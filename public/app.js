/* thoughts — anonymous text-anchored comments (v1). All user text goes through textContent. */
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
  let sitekey = null, tsWidget = null, tsToken = null, tsPromise = null;
  const found = new Map();  // root id -> true when highlight placed

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
  function renderComment(c, isReply) {
    const li = el('li', isReply ? 'cmt reply' : 'cmt');
    const meta = el('div', 'cmt-meta');
    meta.append(el('span', 'cmt-nick', c.nickname || '匿名'), el('time', null, fmtTime(c.created_at)));
    li.append(meta, el('div', 'cmt-body', c.body));
    return li;
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
    ensureTurnstile();
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

  /* ---------- Turnstile (loaded only when needed) ---------- */
  function loadTurnstile() {
    if (!tsPromise) tsPromise = new Promise((resolve, reject) => {
      window.__thoughtsTs = resolve;
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__thoughtsTs';
      s.async = true; s.onerror = reject; document.head.appendChild(s);
    });
    return tsPromise;
  }
  function ensureTurnstile() {
    if (!sitekey || tsWidget !== null) return;
    loadTurnstile().then(() => {
      if (tsWidget !== null) return;
      tsWidget = window.turnstile.render('#ts-box', {
        sitekey, theme: 'auto', language: 'zh-cn', size: 'flexible',
        callback: (t) => { tsToken = t; },
        'expired-callback': () => { tsToken = null; },
        'error-callback': () => { tsToken = null; },
      });
    }).catch(() => { fMsg.textContent = '人机验证加载失败。请刷新页面。'; fMsg.className = 'form-msg err'; });
  }

  /* ---------- submit ---------- */
  fBody.addEventListener('input', () => { $('f-count').textContent = `${fBody.value.length} / 2000`; });
  try { fNick.value = localStorage.getItem('thoughts.nick') || ''; } catch (_) { /* ignore */ }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!mode) return;
    const body = fBody.value.trim();
    if (!body) { fMsg.textContent = '请先写评论。'; fMsg.className = 'form-msg err'; return; }
    if (sitekey && !tsToken) { fMsg.textContent = '请先完成人机验证。'; fMsg.className = 'form-msg err'; return; }
    const nickname = fNick.value.trim();
    try { localStorage.setItem('thoughts.nick', nickname); } catch (_) { /* ignore */ }
    const payload = { page: PAGE, nickname, body, turnstile_token: tsToken || '' };
    if (mode.kind === 'thread') payload.parent_id = mode.rootId;
    else Object.assign(payload, mode.anchor);
    fSubmit.disabled = true; fMsg.textContent = '正在发布……'; fMsg.className = 'form-msg';
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `发布失败（${res.status}）。`);
      const c = data.comment;
      comments.push(c);
      if (!c.parent_id) placeHighlight(c);
      fBody.value = ''; $('f-count').textContent = '0 / 2000';
      renderList();
      openPanel({ kind: 'thread', rootId: c.parent_id || c.id });
      toast('已发布。');
    } catch (err) {
      fMsg.textContent = err.message; fMsg.className = 'form-msg err';
    } finally {
      fSubmit.disabled = false;
      if (tsWidget !== null && window.turnstile) { window.turnstile.reset(tsWidget); tsToken = null; }
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
      li.append(el('div', 'ti-where', `${sectionLabel(r.anchor_id)} · ${replies.length + 1} 条`));
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

  /* ---------- boot ---------- */
  (async () => {
    try {
      const [cfg, data] = await Promise.all([
        fetch('/api/config').then((r) => r.json()).catch(() => ({})),
        fetch(`${API}?page=${encodeURIComponent(PAGE)}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
      ]);
      sitekey = cfg.turnstile_sitekey || null;
      comments = Array.isArray(data.comments) ? data.comments : [];
      comments.sort((a, b) => a.created_at - b.created_at).forEach(placeHighlight);
      renderList();
      const h = location.hash.match(/^#c-([\w-]+)$/);
      if (h) { const c = comments.find((x) => x.id === h[1]); if (c) openPanel({ kind: 'thread', rootId: c.parent_id || c.id }); }
    } catch (_) {
      $('list-empty').textContent = '评论加载失败。请稍后刷新。';
    }
  })();
})();
