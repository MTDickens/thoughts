// thoughts.ycjian.com — static pages + anonymous comments API (Cloudflare Worker + D1 + Turnstile).
// Bindings: DB (D1), TURNSTILE_SITEKEY (var), TURNSTILE_SECRET / ADMIN_TOKEN / IP_SALT (secrets).
// Pages are embedded from public/* via src/site.gen.js (run `python3 tools/build.py`).
import SITE from './site.gen.js';

const LIMITS = { body: 2000, nickname: 40, quote: 1000, ctx: 64, payload: 8192 };
const RATE = { perIp10m: 5, perIpDay: 40, global1h: 200 };
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const TYPES = new Set(['text', 'element', 'media_time']);
const PUBLIC_COLS = 'id, page, anchor_type, anchor_id, quote, prefix, suffix, media_t, parent_id, nickname, body, created_at';

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

function serveStatic(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
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
  return new Response(request.method === 'HEAD' ? null : file.body, { headers });
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

async function listComments(env, url) {
  const page = url.searchParams.get('page') || '';
  if (!ID_RE.test(page)) return err(400, '页面参数无效。');
  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_COLS} FROM comments WHERE page = ? AND status = 'visible' ORDER BY created_at LIMIT 2000`
  ).bind(page).all();
  return json({ comments: results });
}

async function createComment(request, env, url) {
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return err(403, '来源不被允许。');
  if (!(request.headers.get('content-type') || '').includes('application/json')) return err(415, '请用 JSON 提交。');
  const raw = await request.text();
  if (raw.length > LIMITS.payload) return err(413, '内容太长。');
  let p;
  try { p = JSON.parse(raw); } catch { return err(400, '请求格式错误。'); }
  if (!p || typeof p !== 'object') return err(400, '请求格式错误。');

  const isAdmin = !!env.ADMIN_TOKEN && safeEqual(request.headers.get('x-admin-token') || '', env.ADMIN_TOKEN);
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ipHash = (await sha256Hex(`${env.IP_SALT || 'thoughts'}|${ip}`)).slice(0, 32);

  const page = typeof p.page === 'string' ? p.page : '';
  if (!ID_RE.test(page)) return err(400, '页面参数无效。');
  const body = clean(p.body, LIMITS.body, { multiline: true });
  if (body === null) return err(400, `评论最多 ${LIMITS.body} 字。`);
  if (!body.trim()) return err(400, '评论不能为空。');
  const nickname = clean(p.nickname, LIMITS.nickname);
  if (nickname === null) return err(400, `昵称最多 ${LIMITS.nickname} 字。`);

  let anchor;
  if (p.parent_id != null && p.parent_id !== '') {
    if (typeof p.parent_id !== 'string' || !ID_RE.test(p.parent_id)) return err(400, '回复目标无效。');
    const parent = await env.DB.prepare(
      `SELECT id, page, anchor_type, anchor_id, quote, prefix, suffix, media_t, parent_id FROM comments WHERE id = ? AND status = 'visible'`
    ).bind(p.parent_id).first();
    if (!parent || parent.page !== page) return err(404, '找不到要回复的评论。');
    const rootId = parent.parent_id || parent.id; // keep threads one level deep
    const { anchor_type, anchor_id, quote, prefix, suffix, media_t } = parent;
    anchor = { anchor_type, anchor_id, quote, prefix, suffix, media_t, parent_id: rootId };
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

  if (!isAdmin) {
    const now = Date.now();
    const [a, b, c] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?').bind(ipHash, now - 600_000),
      env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?').bind(ipHash, now - 86_400_000),
      env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE created_at > ?').bind(now - 3_600_000),
    ]);
    if (a.results[0].n >= RATE.perIp10m || b.results[0].n >= RATE.perIpDay) return err(429, '评论太频繁。请稍后再试。');
    if (c.results[0].n >= RATE.global1h) return err(429, '评论区暂时繁忙。请稍后再试。');
    if (!(await verifyTurnstile(env, p.turnstile_token, ip))) return err(403, '人机验证未通过。请重试。');
  }

  const row = {
    ...anchor, id: crypto.randomUUID(), page, nickname: nickname.trim(), body: body.trim(), created_at: Date.now(),
  };
  await env.DB.prepare(
    `INSERT INTO comments (id, page, anchor_type, anchor_id, quote, prefix, suffix, media_t, parent_id, nickname, body, created_at, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(row.id, row.page, row.anchor_type, row.anchor_id, row.quote, row.prefix, row.suffix, row.media_t, row.parent_id,
    row.nickname, row.body, row.created_at, ipHash).run();

  const { id, page: pg, anchor_type, anchor_id, quote, prefix, suffix, media_t, parent_id, nickname: nk, body: bd, created_at } = row;
  return json({ comment: { id, page: pg, anchor_type, anchor_id, quote, prefix, suffix, media_t, parent_id, nickname: nk, body: bd, created_at } }, 201);
}

async function api(request, env, url) {
  if (url.pathname === '/api/config' && request.method === 'GET') {
    return json({ turnstile_sitekey: env.TURNSTILE_SITEKEY || null }, 200, { 'cache-control': 'public, max-age=300' });
  }
  if (url.pathname === '/api/comments') {
    if (request.method === 'GET') return listComments(env, url);
    if (request.method === 'POST') return createComment(request, env, url);
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
