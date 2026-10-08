/* thoughts — open text-anchored comments: anyone can comment, reply, edit, delete, resolve. All user text goes through textContent. */
(() => {
  'use strict';
  const PAGE = document.body.dataset.page;
  const API = '/api/comments';
  const CTX = 32;            // prefix / suffix length
  const MAX_QUOTE = 1000;
  const $ = (id) => document.getElementById(id);
  const article = document.querySelector('article.doc');
  const selBtn = $('sel-btn'), panel = $('panel'), scrim = $('scrim');
  const form = $('composer'), fNick = $('f-nick'), fBody = $('f-body'), fMsg = $('f-msg'), fSubmit = $('f-submit');

  let comments = [];        // all visible comments from the API
  let pending = null;       // anchor captured from the current selection
  let mode = null;          // { kind: 'new', anchor } | { kind: 'thread', rootId }
  const found = new Map();  // root id -> true when highlight placed
  const NICK_KEY = 'thoughts.nick';
  try { localStorage.removeItem('thoughts.token'); } catch (_) { /* old owner-login token (removed 2026-10-08) */ }
  const nick = () => fNick.value.trim();

  /* ---------- helpers ---------- */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sectionOf = (node) => { const e = node && (node.nodeType === 1 ? node : node.parentElement); return e ? e.closest('[data-section]') : null; };
  const sectionLabel = (id) => {
    if (id === 'page') return '整篇';
    if (id === 'intro') return '开头';
    const h = document.querySelector(`#${CSS.escape(id)} .h-t`);
    return h ? `${id.replace(/^s/, '')}. ${h.textContent}` : id;
  };
  const fmtTime = (ms) => new Date(ms).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  let toastTimer;
  const toast = (msg) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600); };

  // Text offset of a boundary point inside root (concatenation of all text nodes).
  const offsetIn = (root, node, off) => { const r = document.createRange(); r.setStart(root, 0); r.setEnd(node, off); return r.toString().length; };
  const textNodes = (root) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const out = []; let n; while ((n = w.nextNode())) out.push(n); return out; };
  const commonSuffix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++; return i; };
  const commonPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

  /* ---------- anchoring ---------- */
  function locate(root, c) {
    const text = root.textContent, q = c.quote || '';
    if (!q) return null;
    let best = -1, bestScore = -1, i = text.indexOf(q);
    while (i !== -1) {
      const pre = text.slice(Math.max(0, i - (c.prefix || '').length), i);
      const suf = text.slice(i + q.length, i + q.length + (c.suffix || '').length);
      const score = commonSuffix(pre, c.prefix || '') + commonPrefix(suf, c.suffix || '');
      if (score > bestScore) { best = i; bestScore = score; }
      i = text.indexOf(q, i + 1);
    }
    return best < 0 ? null : [best, best + q.length];
  }

  function wrap(root, start, end, cid) {
    let pos = 0; const segs = [];
    for (const n of textNodes(root)) {
      const s = pos, e = pos + n.data.length; pos = e;
      if (e <= start || s >= end) continue;
      const a = Math.max(start, s) - s, b = Math.min(end, e) - s;
      if (!n.data.slice(a, b).trim()) continue; // skip whitespace between blocks
      segs.push([n, a, b]);
    }
    for (const [n, a, b] of segs) {
      let t = n;
      if (a > 0) t = t.splitText(a);
      if (b - a < t.data.length) t.splitText(b - a);
      const m = el('mark', 'hl'); m.dataset.cid = cid; m.tabIndex = 0; m.setAttribute('role', 'button'); m.setAttribute('aria-label', '查看评论');
      t.parentNode.replaceChild(m, t); m.appendChild(t);
    }
    return segs.length > 0;
  }

  function placeHighlight(c) {
    if (c.anchor_type !== 'text' || c.parent_id) return;
    const root = document.querySelector(`[data-section="${CSS.escape(c.anchor_id)}"]`);
    const r = root && locate(root, c);
    found.set(c.id, !!(r && wrap(root, r[0], r[1], c.id)));
    if (c.resolved_at) document.querySelectorAll(`mark.hl[data-cid="${CSS.escape(c.id)}"]`).forEach((m) => m.classList.add('resolved'));
  }

  /* ---------- selection → 评论 button ---------- */
  function captureSelection() {
    pending = null;
    const sel = window.getSelection();
    if (!panel.hidden || !sel || sel.rangeCount === 0 || sel.isCollapsed) return hideSelBtn();
    const r = sel.getRangeAt(0);
    const sec = sectionOf(r.startContainer);
    if (!sec || sec !== sectionOf(r.endContainer)) return hideSelBtn();
    const text = sec.textContent;
    let s = offsetIn(sec, r.startContainer, r.startOffset), e = offsetIn(sec, r.endContainer, r.endOffset);
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e - s < 1 || e - s > MAX_QUOTE) return hideSelBtn();
    pending = { anchor_type: 'text', anchor_id: sec.dataset.section, quote: text.slice(s, e),
      prefix: text.slice(Math.max(0, s - CTX), s), suffix: text.slice(e, e + CTX) };
    const rects = r.getClientRects(); const last = rects[rects.length - 1] || r.getBoundingClientRect();
    selBtn.style.left = `${Math.min(Math.max(48, last.left + last.width / 2 + window.scrollX), document.documentElement.clientWidth - 48)}px`;
    selBtn.style.top = `${last.bottom + window.scrollY}px`;
    selBtn.hidden = false;
  }
  function hideSelBtn() { selBtn.hidden = true; }
  let selTimer;
  document.addEventListener('selectionchange', () => { clearTimeout(selTimer); selTimer = setTimeout(captureSelection, 180); });
  selBtn.addEventListener('mousedown', (e) => e.preventDefault());
  selBtn.addEventListener('click', () => {
    if (!pending) return;
    const a = pending; hideSelBtn(); window.getSelection().removeAllRanges();
    openPanel({ kind: 'new', anchor: a });
  });

  /* ---------- panel ---------- */
  function authorEls(c) {
    if (c.author_role === 'agent') return [el('span', 'cmt-nick', c.author_name || 'agent'), el('span', 'role role-agent', 'agent')];
    if (c.author_role === 'owner') return [el('span', 'cmt-nick', 'Max')]; // rows from the old owner login
    return [el('span', c.nickname ? 'cmt-nick' : 'cmt-nick anon', c.nickname || '匿名')];
  }
  function renderComment(c, isReply) {
    const li = el('li', isReply ? 'cmt reply' : 'cmt'); li.dataset.cid = c.id;
    const meta = el('div', 'cmt-meta');
    meta.append(...authorEls(c));
    meta.append(el('time', null, fmtTime(c.created_at)));
    if (c.edited_at) meta.append(el('span', 'cmt-edited', `已编辑${c.edited_by ? `（${c.edited_by}）` : ''}`));
    if (!isReply && c.resolved_at) meta.append(el('span', 'cmt-resolved', `已解决${c.resolved_by ? `（${c.resolved_by}）` : ''}`));
    const body = el('div', 'cmt-body', c.body);
    li.append(meta, body);
    li.append(actionsFor(c, isReply, li, body));
    return li;
  }

  /* ---------- actions (open to everyone): edit, delete, resolve / reopen ---------- */
  async function apiCall(method, path, payload) {
    const res = await fetch(path, { method, headers: payload ? { 'content-type': 'application/json' } : {}, body: payload ? JSON.stringify(payload) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `操作失败（${res.status}）。`);
    return data;
  }
  function actionsFor(c, isReply, li, bodyEl) {
    const bar = el('div', 'cmt-actions');
    const btn = (label, fn, cls) => { const b = el('button', `link-btn${cls ? ` ${cls}` : ''}`, label); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); }); bar.append(b); return b; };
    btn('编辑', () => {
      if (li.querySelector('.cmt-edit')) return;
      const box = el('div', 'cmt-edit'); const ta = el('textarea'); ta.value = c.body; ta.rows = 4; ta.maxLength = 2000;
      const save = el('button', 'btn', '保存'); save.type = 'button';
      const cancel = el('button', 'link-btn', '取消'); cancel.type = 'button';
      const msg = el('p', 'form-msg err');
      box.append(ta, save, cancel, msg); bodyEl.hidden = true; bar.hidden = true; li.append(box); ta.focus();
      box.addEventListener('click', (e) => e.stopPropagation());
      cancel.addEventListener('click', () => { box.remove(); bodyEl.hidden = false; bar.hidden = false; });
      save.addEventListener('click', async () => {
        save.disabled = true;
        try { await apiCall('PATCH', `${API}/${encodeURIComponent(c.id)}`, { body: ta.value, nickname: nick() }); toast('已保存。'); await reload(); }
        catch (e) { msg.textContent = e.message; save.disabled = false; }
      });
    });
    btn('删除', async () => {
      const n = isReply ? 0 : comments.filter((x) => x.parent_id === c.id).length;
      if (!window.confirm(n ? `删除这条评论和它的 ${n} 条回复？` : '删除这条评论？')) return;
      try { await apiCall('DELETE', `${API}/${encodeURIComponent(c.id)}`); toast('已删除。'); await reload(); } catch (e) { toast(e.message); }
    }, 'danger');
    if (!isReply) btn(c.resolved_at ? '重新打开' : '解决', async () => {
      try { await apiCall('POST', `${API}/${encodeURIComponent(c.id)}/${c.resolved_at ? 'reopen' : 'resolve'}`, { nickname: nick() }); toast(c.resolved_at ? '已重新打开。' : '已解决。'); await reload(); } catch (e) { toast(e.message); }
    });
    return bar;
  }

  function openPanel(m) {
    mode = m;
    const quoteBox = $('panel-quote'), thread = $('panel-thread');
    thread.textContent = '';
    let anchor = m.anchor;
    if (m.kind === 'thread') {
      const root = comments.find((c) => c.id === m.rootId);
      if (!root) return;
      anchor = root;
      thread.append(renderComment(root, false));
      comments.filter((c) => c.parent_id === root.id).forEach((c) => thread.append(renderComment(c, true)));
      $('panel-h').textContent = `评论 · ${sectionLabel(root.anchor_id)}`;
      $('f-body-label').textContent = '回复';
      fBody.placeholder = '写下你的回复。';
      document.querySelectorAll('mark.hl.active').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll(`mark.hl[data-cid="${CSS.escape(root.id)}"]`).forEach((x) => x.classList.add('active'));
    } else {
      $('panel-h').textContent = `新评论 · ${sectionLabel(anchor.anchor_id)}`;
      $('f-body-label').textContent = '评论';
      fBody.placeholder = '写下你的看法。';
    }
    quoteBox.hidden = !anchor.quote;
    quoteBox.textContent = anchor.quote || '';
    fMsg.textContent = ''; fMsg.className = 'form-msg';
    panel.hidden = false; scrim.hidden = false;
    hideSelBtn();
    setTimeout(() => fBody.focus({ preventScroll: true }), 30);
  }
  function closePanel() {
    panel.hidden = true; scrim.hidden = true; mode = null;
    document.querySelectorAll('mark.hl.active').forEach((x) => x.classList.remove('active'));
  }
  $('panel-close').addEventListener('click', closePanel);
  scrim.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) closePanel(); });

  article.addEventListener('click', (e) => {
    const m = e.target.closest('mark.hl'); if (!m) return;
    const sel = window.getSelection(); if (sel && !sel.isCollapsed) return;
    e.preventDefault(); openPanel({ kind: 'thread', rootId: m.dataset.cid });
  });
  article.addEventListener('keydown', (e) => {
    const m = e.target.closest && e.target.closest('mark.hl');
    if (m && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPanel({ kind: 'thread', rootId: m.dataset.cid }); }
  });
  $('page-comment').addEventListener('click', () => openPanel({ kind: 'new', anchor: { anchor_type: 'element', anchor_id: 'page', quote: '', prefix: '', suffix: '' } }));

  /* ---------- submit ---------- */
  fBody.addEventListener('input', () => { $('f-count').textContent = `${fBody.value.length} / 2000`; });
  try { fNick.value = localStorage.getItem(NICK_KEY) || ''; } catch (_) { /* ignore */ }
  fNick.addEventListener('change', () => { try { localStorage.setItem(NICK_KEY, nick()); } catch (_) { /* ignore */ } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!mode) return;
    const body = fBody.value.trim();
    if (!body) { fMsg.textContent = '请先写评论。'; fMsg.className = 'form-msg err'; return; }
    const nickname = nick();
    try { localStorage.setItem(NICK_KEY, nickname); } catch (_) { /* ignore */ }
    const payload = { page: PAGE, nickname, body };
    if (mode.kind === 'thread') payload.parent_id = mode.rootId;
    else Object.assign(payload, mode.anchor);
    fSubmit.disabled = true; fMsg.textContent = '正在发布……'; fMsg.className = 'form-msg';
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `发布失败（${res.status}）。`);
      const c = data.comment;
      fBody.value = ''; $('f-count').textContent = '0 / 2000';
      if (c.parent_id) { await reload(); } else { comments.push(c); placeHighlight(c); renderList(); }
      openPanel({ kind: 'thread', rootId: c.parent_id || c.id });
      toast('已发布。');
    } catch (err) {
      fMsg.textContent = err.message; fMsg.className = 'form-msg err';
    } finally {
      fSubmit.disabled = false;
    }
  });

  /* ---------- list of all comments ---------- */
  function renderList() {
    const list = $('thread-list'); list.textContent = '';
    const roots = comments.filter((c) => !c.parent_id);
    const order = (c) => { if (c.anchor_id === 'page') return 1e9; const m = document.querySelector(`mark.hl[data-cid="${CSS.escape(c.id)}"]`); return m ? m.getBoundingClientRect().top + window.scrollY : 1e8; };
    roots.sort((a, b) => order(a) - order(b) || a.created_at - b.created_at);
    for (const r of roots) {
      const replies = comments.filter((c) => c.parent_id === r.id);
      const li = el('li', 'thread-item'); li.tabIndex = 0;
      li.append(el('div', 'ti-where', `${sectionLabel(r.anchor_id)} · ${replies.length + 1} 条${r.resolved_at ? ' · 已解决' : ''}`));
      if (r.resolved_at) li.classList.add('resolved');
      if (r.quote) li.append(el('p', 'ti-quote', r.quote));
      if (r.anchor_type === 'text' && found.get(r.id) === false) li.append(el('div', 'ti-orphan', '原文已改。找不到这段文字。'));
      li.append(renderComment(r, false));
      const go = () => {
        const m = document.querySelector(`mark.hl[data-cid="${CSS.escape(r.id)}"]`);
        if (m) { m.scrollIntoView({ block: 'center' }); m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 2600); }
        openPanel({ kind: 'thread', rootId: r.id });
      };
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      list.append(li);
    }
    const n = comments.length;
    $('list-count').textContent = n; $('toc-count').textContent = n;
    $('list-empty').hidden = n > 0;
  }

  /* ---------- TOC + progress ---------- */
  const tocLinks = [...document.querySelectorAll('.toc li a')];
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) {
        tocLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`));
      }
    }, { rootMargin: '-30% 0px -60% 0px' });
    document.querySelectorAll('.card[id]').forEach((s) => io.observe(s));
  }
  const bar = $('progress-bar');
  const onScroll = () => { const h = document.documentElement; const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight); bar.style.width = `${(p * 100).toFixed(2)}%`; };
  document.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- load / reload ---------- */
  function clearHighlights() {
    document.querySelectorAll('mark.hl').forEach((m) => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
    found.clear();
  }
  async function fetchComments() {
    const r = await fetch(`${API}?page=${encodeURIComponent(PAGE)}`);
    if (!r.ok) throw new Error();
    const data = await r.json();
    return Array.isArray(data.comments) ? data.comments : [];
  }
  async function reload() {
    const keep = mode && mode.kind === 'thread' ? mode.rootId : null;
    comments = await fetchComments();
    clearHighlights();
    comments.sort((a, b) => a.created_at - b.created_at).forEach(placeHighlight);
    renderList();
    if (keep && comments.some((c) => c.id === keep)) openPanel({ kind: 'thread', rootId: keep });
    else if (keep) closePanel();
  }

  /* ---------- boot ---------- */
  (async () => {
    try {
      await reload();
      const h = location.hash.match(/^#c-([\w-]+)$/);
      if (h) { const c = comments.find((x) => x.id === h[1]); if (c) openPanel({ kind: 'thread', rootId: c.parent_id || c.id }); }
    } catch (_) {
      $('list-empty').textContent = '评论加载失败。请稍后刷新。';
    }
  })();
})();

/* ---------- components: tabs + <x-viz> hook ---------- */
(() => {
  'use strict';
  for (const box of document.querySelectorAll('.tabs')) {
    const tabs = [...box.querySelectorAll(':scope > .tab-list > [role="tab"]')];
    const panels = [...box.querySelectorAll(':scope > .tab-panel')];
    if (!tabs.length) continue;
    const show = (i, focus) => tabs.forEach((t, k) => {
      const on = k === i; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; panels[k].hidden = !on;
      if (on && focus) t.focus();
    });
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => show(i));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); show((i + d + tabs.length) % tabs.length, true); }
      });
    });
    box.classList.add('js'); show(0);
  }

  // <x-viz kind="bar|line|..." src="/data/x.csv|.json" data-x="col" data-y="col">.
  // Extend: window.thoughtsViz.kinds.myKind = (el, rows, opts) => { ...draw into el... }.
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
  const parseCsv = (t) => { const [h, ...rows] = t.trim().split(/\r?\n/).map((l) => l.split(',')); return rows.map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), r[i] != null ? r[i].trim() : '']))); };
  function bar(el, rows, o) {
    const x = o.x || Object.keys(rows[0])[0], y = o.y || Object.keys(rows[0])[1];
    const vals = rows.map((r) => +r[y]); const max = Math.max(...vals), min = Math.min(0, ...vals);
    const W = 600, rowH = 30, L = 150, H = rows.length * rowH + 10;
    const s = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'presentation' });
    rows.forEach((r, i) => {
      const w = ((vals[i] - min) / ((max - min) || 1)) * (W - L - 70);
      s.append(svgEl('text', { x: L - 8, y: i * rowH + 20, 'text-anchor': 'end' }, r[x]),
        svgEl('rect', { class: 'bar', x: L, y: i * rowH + 6, width: Math.max(1, w), height: rowH - 10, rx: 4 }),
        svgEl('text', { class: 'val', x: L + w + 6, y: i * rowH + 20 }, r[y]));
    });
    el.append(s);
  }
  function line(el, rows, o) {
    const x = o.x || Object.keys(rows[0])[0], y = o.y || Object.keys(rows[0])[1];
    const vals = rows.map((r) => +r[y]); const max = Math.max(...vals), min = Math.min(...vals);
    const W = 600, H = 220, P = 30, sx = (i) => P + (i * (W - 2 * P)) / Math.max(1, rows.length - 1), sy = (v) => H - P - ((v - min) / ((max - min) || 1)) * (H - 2 * P);
    const s = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'presentation' });
    s.append(svgEl('line', { class: 'axis', x1: P, y1: H - P, x2: W - P, y2: H - P }));
    s.append(svgEl('polyline', { class: 'line', points: vals.map((v, i) => `${sx(i)},${sy(v)}`).join(' ') }));
    rows.forEach((r, i) => s.append(svgEl('circle', { class: 'dot', cx: sx(i), cy: sy(vals[i]), r: 3.5 }), svgEl('text', { x: sx(i), y: H - 10, 'text-anchor': 'middle' }, r[x])));
    el.append(s);
  }
  const reg = window.thoughtsViz = window.thoughtsViz || { kinds: {} };
  Object.assign(reg.kinds, { bar, line }, reg.kinds);
  if (!customElements.get('x-viz')) customElements.define('x-viz', class extends HTMLElement {
    async connectedCallback() {
      if (this.dataset.done) return; this.dataset.done = '1';
      const kind = this.getAttribute('kind'), src = this.getAttribute('src');
      const fail = (msg) => { this.textContent = msg; this.classList.add('viz-error'); };
      const draw = reg.kinds[kind];
      if (!draw) return fail(`未知的可视化类型：${kind}`);
      try {
        let rows = [];
        if (src) { const t = await (await fetch(src)).text(); rows = src.endsWith('.json') ? JSON.parse(t) : parseCsv(t); }
        this.textContent = ''; draw(this, rows, { ...this.dataset });
      } catch (_) { fail('可视化加载失败。'); }
    }
  });
})();
