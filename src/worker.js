// thoughts.ycjian.com — static pages + anonymous comments API (Cloudflare Worker + D1 + Turnstile).
// Bindings: DB (D1), TURNSTILE_SITEKEY (var), TURNSTILE_SECRET / IP_SALT / OWNER_TOKEN_SHA256 / AGENT_TOKEN_SHA256 (secrets; raw OWNER_TOKEN / AGENT_TOKEN also accepted). ADMIN_TOKEN (v1) is no longer read.
// Pages are embedded from public/* via src/site.gen.js (run `python3 tools/build.py`).
import SITE from './site.gen.js';

const LIMITS = { body: 2000, nickname: 40, quote: 1000, ctx: 64, payload: 8192 };
const RATE = { perIp10m: 5, perIpDay: 40, global1h: 200, tokenPer10m: 60 };
const ROLES = new Set(['owner', 'agent', 'anon']);
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const TYPES = new Set(['text', 'element', 'media_time']);
const PUBLIC_COLS = 'id, page, anchor_type, anchor_id, quote, prefix, suffix, media_t, parent_id, nickname, body, created_at, author_role, author_name, edited_at, resolved_at, resolved_by';

const SEC_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};
const PAGE_HEADERS = {
  ...SEC_HEADERS,
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

// Decode base64 entries (images) once, on first use.
const BIN = new Map();
function fileBody(path, file) {
  if (file.body != null) return file.body;
  let b = BIN.get(path);
  if (!b) { const s = atob(file.b64); b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); BIN.set(path, b); }
  return b;
}

// Clean URLs: "/" -> index.html, "/slug" -> slug.html. "/slug.html" and "/slug/" redirect to "/slug".
function resolvePath(pathname) {
  if (pathname === '/') return { path: '/index.html' };
  if (pathname === '/index.html') return { redirect: '/' };
  if (pathname.endsWith('.html') && SITE[pathname]) return { redirect: pathname.slice(0, -5) };
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (trimmed !== pathname && SITE[`${trimmed}.html`]) return { redirect: trimmed };
  if (SITE[`${pathname}.html`]) return { path: `${pathname}.html` };
  return { path: pathname };
}

function serveStatic(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  const r = resolvePath(url.pathname);
  if (r.redirect) return new Response(null, { status: 301, headers: { location: r.redirect + url.search + url.hash, ...SEC_HEADERS } });
  const path = r.path;
  const file = SITE[path];
  if (!file) {
    return new Response('<!doctype html><meta charset="utf-8"><title>404</title><p>页面不存在。<a href="/">回到首页</a>。</p>', {
      status: 404, headers: { 'content-type': 'text/html; charset=utf-8', ...PAGE_HEADERS },
    });
  }
  const headers = {
    'content-type': file.type,
    etag: file.etag,
    'cache-control': path.endsWith('.html') ? 'public, max-age=0, must-revalidate' : 'public, max-age=300',
    ...PAGE_HEADERS,
  };
  if (request.headers.get('if-none-match') === file.etag) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : fileBody(path, file), { headers });
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SEC_HEADERS, ...extra },
  });
}
const err = (status, msg) => json({ error: msg }, status);

// Strip control chars (keep \n and \t), normalise newlines, trim, cap length.
function clean(v, max, { multiline = false } = {}) {
  if (v == null) return '';
  if (typeof v !== 'string') return null;
  let s = v.replace(/\r\n?/g, '\n').replace(multiline ? /[\u0000-\u0008\u000B-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g : /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, '');
  if (multiline) s = s.replace(/\n{4,}/g, '\n\n\n');
  return s.length > max ? null : s;
}

async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // Turnstile not configured -> rely on rate limits
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = await r.json().catch(() => ({}));
  return out.success === true;
}

/* ---------- auth: owner (Max, browser) and agent (CLI) bearer tokens ---------- */
// Tokens travel only in the Authorization header (never cookies), so cross-site requests cannot carry them.
// Cloudflare holds only SHA-256 hashes of the tokens (OWNER_TOKEN_SHA256 / AGENT_TOKEN_SHA256, lowercase hex);
// raw OWNER_TOKEN / AGENT_TOKEN secrets are also accepted.
async function authOf(request, env) {
  const h = request.headers.get('authorization');
  if (!h) return { role: null };
  const m = /^Bearer\s+(\S{20,200})$/.exec(h);
  if (m) {
    const t = m[1], d = await sha256Hex(t);
    const is = (raw, hash) => (raw && safeEqual(t, raw)) || (hash && safeEqual(d, String(hash).trim().toLowerCase()));
    if (is(env.OWNER_TOKEN, env.OWNER_TOKEN_SHA256)) return { role: 'owner', name: 'Max' };
    if (is(env.AGENT_TOKEN, env.AGENT_TOKEN_SHA256)) return { role: 'agent', name: 'agent' };
  }
  return { error: true };
}
const needAuth = () => err(401, '需要有效的令牌（Authorization: Bearer …）。');

function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) return { error: err(415, '请用 JSON 提交。') };
  const raw = await request.text();
  if (raw.length > LIMITS.payload) return { error: err(413, '内容太长。') };
  try { const p = JSON.parse(raw); if (p && typeof p === 'object' && !Array.isArray(p)) return { p }; } catch { /* fall through */ }
  return { error: err(400, '请求格式错误。') };
}

async function getComment(env, id) {
  return env.DB.prepare(`SELECT ${PUBLIC_COLS} FROM comments WHERE id = ? AND status = 'visible'`).bind(id).first();
}

async function listComments(env, url, who) {
  const q = url.searchParams;
  const page = q.get('page') || '';
  const where = ["status = 'visible'"], args = [];
  if (page) {
    if (!ID_RE.test(page)) return err(400, '页面参数无效。');
    where.push('page = ?'); args.push(page);
  } else if (!who.role) {
    return err(400, '页面参数无效。');
  }
  const st = q.get('status') || 'all';
  if (st === 'open') where.push('resolved_at IS NULL');
  else if (st === 'resolved') where.push('resolved_at IS NOT NULL');
  else if (st !== 'all') return err(400, 'status 只能是 open / resolved / all。');
  const role = q.get('author_role');
  if (role) {
    if (!ROLES.has(role)) return err(400, 'author_role 只能是 owner / agent / anon。');
    where.push('author_role = ?'); args.push(role);
  }
  const since = q.get('since');
  if (since) {
    const s = Number(since);
    if (!Number.isFinite(s) || s < 0) return err(400, 'since 必须是毫秒时间戳。');
    where.push('(created_at > ? OR edited_at > ? OR resolved_at > ?)'); args.push(s, s, s);
  }
  const limit = Math.min(Math.max(parseInt(q.get('limit') || '2000', 10) || 2000, 1), 2000);
  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_COLS} FROM comments WHERE ${where.join(' AND ')} ORDER BY created_at LIMIT ${limit}`
  ).bind(...args).all();
  return json({ comments: results });
}

async function createComment(request, env, url, who) {
  if (!sameOrigin(request, url)) return err(403, '来源不被允许。');
  const { p, error } = await readJson(request); if (error) return error;

  const ip = request.headers.get('cf-connecting-ip') || '';
  const ipHash = (await sha256Hex(`${env.IP_SALT || 'thoughts'}|${ip}`)).slice(0, 32);

  const page = typeof p.page === 'string' ? p.page : '';
  if (!ID_RE.test(page)) return err(400, '页面参数无效。');
  const body = clean(p.body, LIMITS.body, { multiline: true });
  if (body === null) return err(400, `评论最多 ${LIMITS.body} 字。`);
  if (!body.trim()) return err(400, '评论不能为空。');
  const nickname = clean(p.nickname, LIMITS.nickname);
  if (nickname === null) return err(400, `昵称最多 ${LIMITS.nickname} 字。`);
  const agentName = clean(p.author_name, LIMITS.nickname);
  if (agentName === null) return err(400, `名字最多 ${LIMITS.nickname} 字。`);

  let anchor, reopenRoot = null;
  if (p.parent_id != null && p.parent_id !== '') {
    if (typeof p.parent_id !== 'string' || !ID_RE.test(p.parent_id)) return err(400, '回复目标无效。');
    const parent = await env.DB.prepare(
      `SELECT id, page, anchor_type, anchor_id, quote, prefix, suffix, media_t, parent_id FROM comments WHERE id = ? AND status = 'visible'`
    ).bind(p.parent_id).first();
    if (!parent || parent.page !== page) return err(404, '找不到要回复的评论。');
    const rootId = parent.parent_id || parent.id; // keep threads one level deep
    const { anchor_type, anchor_id, quote, prefix, suffix, media_t } = parent;
    anchor = { anchor_type, anchor_id, quote, prefix, suffix, media_t, parent_id: rootId };
    reopenRoot = rootId; // a new reply re-opens a resolved thread
  } else {
    const type = p.anchor_type;
    if (!TYPES.has(type)) return err(400, '锚点类型无效。');
    if (typeof p.anchor_id !== 'string' || !ID_RE.test(p.anchor_id)) return err(400, '锚点无效。');
    const quote = clean(p.quote, LIMITS.quote, { multiline: true });
    const prefix = clean(p.prefix, LIMITS.ctx, { multiline: true });
    const suffix = clean(p.suffix, LIMITS.ctx, { multiline: true });
    if (quote === null || prefix === null || suffix === null) return err(400, '选中的文字太长。');
    if (type === 'text' && !quote.trim()) return err(400, '请先选中文字。');
    let media_t = null;
    if (type === 'media_time') {
      media_t = Number(p.media_t);
      if (!Number.isFinite(media_t) || media_t < 0 || media_t > 86400) return err(400, '时间点无效。');
    }
    anchor = { anchor_type: type, anchor_id: p.anchor_id, quote, prefix, suffix, media_t, parent_id: null };
  }

  const now = Date.now();
  let author_role = 'anon', author_name = '';
  if (who.role) {
    author_role = who.role;
    author_name = who.role === 'owner' ? 'Max' : (agentName.trim() || 'agent');
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE author_role = ? AND created_at > ?').bind(who.role, now - 600_000).first();
    if (r.n >= RATE.tokenPer10m) return err(429, '评论太频繁。请稍后再试。');
  } else {
    const [a, b, c] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?').bind(ipHash, now - 600_000),
      env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?').bind(ipHash, now - 86_400_000),
      env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE author_role = 'anon' AND created_at > ?").bind(now - 3_600_000),
    ]);
    if (a.results[0].n >= RATE.perIp10m || b.results[0].n >= RATE.perIpDay) return err(429, '评论太频繁。请稍后再试。');
    if (c.results[0].n >= RATE.global1h) return err(429, '评论区暂时繁忙。请稍后再试。');
    if (!(await verifyTurnstile(env, p.turnstile_token, ip))) return err(403, '人机验证未通过。请重试。');
  }

  const id = crypto.randomUUID();
  const stmts = [env.DB.prepare(
    `INSERT INTO comments (id, page, anchor_type, anchor_id, quote, prefix, suffix, media_t, parent_id, nickname, body, created_at, ip_hash, author_role, author_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, page, anchor.anchor_type, anchor.anchor_id, anchor.quote, anchor.prefix, anchor.suffix, anchor.media_t, anchor.parent_id,
    who.role ? '' : nickname.trim(), body.trim(), now, who.role ? '' : ipHash, author_role, author_name)];
  if (reopenRoot) stmts.push(env.DB.prepare("UPDATE comments SET resolved_at = NULL, resolved_by = '' WHERE id = ? OR parent_id = ?").bind(reopenRoot, reopenRoot));
  await env.DB.batch(stmts);
  return json({ comment: await getComment(env, id) }, 201);
}

async function updateComment(request, env, url, who, id, forced) {
  if (!sameOrigin(request, url)) return err(403, '来源不被允许。');
  if (!who.role) return needAuth();
  let p = {};
  if (forced) p = forced;
  else { const r = await readJson(request); if (r.error) return r.error; p = r.p; }
  const c = await getComment(env, id);
  if (!c) return err(404, '找不到这条评论。');
  const now = Date.now(), stmts = [];
  if (p.body !== undefined) {
    const body = clean(p.body, LIMITS.body, { multiline: true });
    if (body === null) return err(400, `评论最多 ${LIMITS.body} 字。`);
    if (!body.trim()) return err(400, '评论不能为空。');
    stmts.push(env.DB.prepare('UPDATE comments SET body = ?, edited_at = ? WHERE id = ?').bind(body.trim(), now, id));
  }
  if (p.resolved !== undefined) {
    if (typeof p.resolved !== 'boolean') return err(400, 'resolved 必须是 true 或 false。');
    if (c.parent_id) return err(400, '只能解决或重开主评论（不是回复）。');
    stmts.push(p.resolved
      ? env.DB.prepare('UPDATE comments SET resolved_at = ?, resolved_by = ? WHERE id = ? OR parent_id = ?').bind(now, who.name, id, id)
      : env.DB.prepare("UPDATE comments SET resolved_at = NULL, resolved_by = '' WHERE id = ? OR parent_id = ?").bind(id, id));
  }
  if (!stmts.length) return err(400, '没有要改的字段（body / resolved）。');
  await env.DB.batch(stmts);
  return json({ comment: await getComment(env, id) });
}

async function deleteComment(request, env, url, who, id) {
  if (!sameOrigin(request, url)) return err(403, '来源不被允许。');
  if (!who.role) return needAuth();
  const c = await env.DB.prepare('SELECT id FROM comments WHERE id = ?').bind(id).first();
  if (!c) return err(404, '找不到这条评论。');
  const r = await env.DB.prepare('DELETE FROM comments WHERE id = ? OR parent_id = ?').bind(id, id).run();
  return json({ deleted: r.meta?.changes ?? null, id });
}

async function api(request, env, url) {
  const who = await authOf(request, env);
  if (who.error) return err(401, '令牌无效。');
  const m = request.method;
  if (url.pathname === '/api/config' && m === 'GET') {
    return json({ turnstile_sitekey: env.TURNSTILE_SITEKEY || null }, 200, { 'cache-control': 'public, max-age=300' });
  }
  if (url.pathname === '/api/me' && m === 'GET') {
    return who.role ? json({ role: who.role, name: who.name }) : needAuth();
  }
  if (url.pathname === '/api/comments') {
    if (m === 'GET') return listComments(env, url, who);
    if (m === 'POST') return createComment(request, env, url, who);
    return err(405, '不支持该方法。');
  }
  const cm = /^\/api\/comments\/([A-Za-z0-9_-]{1,80})(?:\/(resolve|reopen))?$/.exec(url.pathname);
  if (cm) {
    const [, id, action] = cm;
    if (action) return m === 'POST' ? updateComment(request, env, url, who, id, { resolved: action === 'resolve' }) : err(405, '不支持该方法。');
    if (m === 'GET') {
      const c = await getComment(env, id);
      if (!c) return err(404, '找不到这条评论。');
      const { results } = await env.DB.prepare(`SELECT ${PUBLIC_COLS} FROM comments WHERE parent_id = ? AND status = 'visible' ORDER BY created_at`).bind(c.parent_id || c.id).all();
      return json({ comment: c, replies: results });
    }
    if (m === 'PATCH') return updateComment(request, env, url, who, id);
    if (m === 'DELETE') return deleteComment(request, env, url, who, id);
    return err(405, '不支持该方法。');
  }
  return err(404, '接口不存在。');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, url); } catch (e) { console.error(e); return err(500, '服务器出错。请稍后再试。'); }
    }
    return serveStatic(request, url);
  },
};
