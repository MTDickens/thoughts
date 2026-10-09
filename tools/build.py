#!/usr/bin/env python3
"""Build the thoughts site from content/*.md (Markdown + Pandoc-style ::: directives).

See AUTHORING-SPEC.md for the syntax. One page per content/*.md (YAML front matter).
Outputs public/<slug>.html, public/index.html, copies content/assets/** into public/,
then embeds public/** into src/site.gen.js for the Worker.

The build FAILS (exit 1, nothing written) on: missing/duplicate ids, unknown block
names, unknown citation keys, stray ':::', forbidden raw HTML, bad front matter.
Dependencies are vendored in tools/vendor (no network needed).
"""
import base64, hashlib, html, json, pathlib, re, shutil, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools" / "vendor"))
import yaml  # noqa: E402  (vendored PyYAML, pure Python)
from markdown_it import MarkdownIt  # noqa: E402
from mdit_py_plugins.attrs import attrs_plugin  # noqa: E402
from mdit_py_plugins.container import container_plugin  # noqa: E402

STATIC = {"app.js", "style.css", "favicon.svg", "physiq-vs-wrop-rank.html", "physiq-vs-wrop-rank.js"}  # hand-written files in public/
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")  # same charset the comments API accepts
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")
FM_KEYS = {"title": str, "slug": str, "short": str, "description": str, "chips": list,
           "order": int, "updated": str, "draft": bool}
FM_REQUIRED = {"title", "slug"}
CALLOUT_TITLE = {"note": "说明", "tip": "提示", "warning": "注意"}
NEED_ID = {"figure", "video", "viz", "compare", "columns", "tabs"}
BLOCKS = NEED_ID | set(CALLOUT_TITLE) | {"aside", "details"}
FORBIDDEN_HTML = re.compile(r"<\s*(script|style|iframe|object|embed|link|meta)\b|\son[a-z]+\s*=|javascript:", re.I)
HEAD_ID = re.compile(r"\s*\{#([^}\s]+)\}\s*$")
CITE = re.compile(r"\[(@[A-Za-z0-9_:-]+(?:\s*;\s*@[A-Za-z0-9_:-]+)*)\]")


class BuildError(Exception):
    pass


def esc(s):
    return html.escape(str(s), quote=True)


# ---------------------------------------------------------------- markdown setup
def make_md():
    md = MarkdownIt("commonmark", {"html": True}).use(attrs_plugin, spans=True).enable("table")
    md.use(container_plugin, name="dir", validate=lambda params, *a: True)
    r = md.renderer.rules
    base_link_open = r.get("link_open")

    def table_open(self, tokens, idx, options, env):
        m = tokens[idx].meta
        return (f'<div class="table-wrap{m["kind"]}" data-anchor-id="{esc(m["aid"])}" tabindex="0" role="region" aria-label="表格">'
                f"<table>\n")
    md.add_render_rule("table_open", table_open)
    md.add_render_rule("table_close", lambda self, t, i, o, e: "</table></div>\n")

    def cell_open(self, tokens, idx, options, env):
        t = tokens[idx]; m = t.meta or {}
        cls = []
        if m.get("col") == 0: cls.append("k")
        if "text-align:right" in (t.attrGet("style") or ""): cls.append("num")
        c = f' class="{" ".join(cls)}"' if cls else ""
        if t.tag == "th":
            return f'<th{c} scope="col">'
        return f'<td{c} data-label="{esc(m.get("label", ""))}"><span class="cv">'
    md.add_render_rule("th_open", cell_open)
    md.add_render_rule("td_open", cell_open)
    md.add_render_rule("td_close", lambda self, t, i, o, e: "</span></td>\n")
    md.add_render_rule("tr_open", lambda self, t, i, o, e: '<tr class="total">' if (t[i].meta or {}).get("total") else "<tr>")

    def link_open(self, tokens, idx, options, env):
        t = tokens[idx]; href = t.attrGet("href") or ""
        stack = env.setdefault("_links", [])
        if re.match(r"^https?://", href):
            stack.append("</a>")
            return f'<a href="{esc(href)}" target="_blank" rel="noopener noreferrer">'
        if href.startswith("#") or href.startswith("/"):
            stack.append("</a>")
            return f'<a href="{esc(href)}">'
        slug = re.sub(r"\.md$", "", href.split("/")[-1])
        if href.endswith(".md") and slug in env["published"]:
            stack.append("</a>")
            return f'<a href="/{esc(slug)}">'
        stack.append("</span>")  # local file not published on this site: name only
        return '<span class="unpub" title="未在本站发布">'
    md.add_render_rule("link_open", link_open)
    md.add_render_rule("link_close", lambda self, t, i, o, e: e["_links"].pop())
    return md


MD = make_md()


# ---------------------------------------------------------------- helpers
def parse_info(info):
    """'warning' | '{.figure #id k=v k2="a b"}' -> (name, attrs)."""
    p = info.strip()
    attrs = {}
    if p.startswith("{"):
        if not p.endswith("}"):
            raise BuildError(f"bad block attributes: ::: {p}")
        body = p[1:-1]
        classes = []
        for m in re.finditer(r'#([^\s}]+)|\.([^\s}=]+)|([A-Za-z_][\w-]*)=("([^"]*)"|\'([^\']*)\'|[^\s}]+)', body):
            if m.group(1): attrs["id"] = m.group(1)
            elif m.group(2): classes.append(m.group(2))
            else:
                v = m.group(5) if m.group(5) is not None else m.group(6) if m.group(6) is not None else m.group(4)
                attrs[m.group(3)] = v
        if not classes:
            raise BuildError(f"block without a name: ::: {p}")
        name = classes[0]
        if len(classes) > 1: attrs["class"] = " ".join(classes[1:])
    else:
        name = p.split()[0] if p else ""
        if len(p.split()) > 1:
            attrs["title"] = p.split(None, 1)[1]
    return name, attrs


def strip_heading_id(inline_tok):
    m = HEAD_ID.search(inline_tok.content)
    if not m:
        return None
    inline_tok.content = inline_tok.content[:m.start()]
    last = [c for c in inline_tok.children if c.type == "text"]
    if last:
        last[-1].content = HEAD_ID.sub("", last[-1].content)
    return m.group(1)


def plain(inline_tok):
    return "".join(c.content for c in inline_tok.children if c.type in ("text", "code_inline"))


class Page:
    def __init__(self, src, meta, body):
        self.src, self.meta, self.body = src, meta, body
        self.slug = meta["slug"]
        self.ids = {}
        self.cites = {}

    def add_id(self, i, where):
        if not ID_RE.match(i):
            raise BuildError(f"{self.src.name}: bad id '{i}' ({where}); use letters, digits, - or _")
        if i in self.ids:
            raise BuildError(f"{self.src.name}: duplicate id '{i}' ({where}; first at {self.ids[i]})")
        self.ids[i] = where


# ---------------------------------------------------------------- front matter
def read_page(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        raise BuildError(f"{path.name}: missing YAML front matter (--- ... ---)")
    try:
        meta = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError as e:
        raise BuildError(f"{path.name}: front matter is not valid YAML: {e}")
    if not isinstance(meta, dict):
        raise BuildError(f"{path.name}: front matter must be a mapping")
    for k, v in list(meta.items()):
        if k not in FM_KEYS:
            raise BuildError(f"{path.name}: unknown front matter key '{k}' (allowed: {', '.join(FM_KEYS)})")
        if k == "updated" and not isinstance(v, str):
            meta[k] = v = str(v)
        if not isinstance(v, FM_KEYS[k]):
            raise BuildError(f"{path.name}: front matter '{k}' must be {FM_KEYS[k].__name__}")
    for k in FM_REQUIRED - meta.keys():
        raise BuildError(f"{path.name}: front matter needs '{k}'")
    if not SLUG_RE.match(meta["slug"]) or meta["slug"] == "index":
        raise BuildError(f"{path.name}: bad slug '{meta['slug']}' (lowercase letters, digits, -)")
    meta.setdefault("short", meta["title"])
    meta.setdefault("description", meta["title"])
    meta.setdefault("chips", [])
    meta.setdefault("order", 100)
    meta.setdefault("updated", "")
    return Page(path, meta, text[m.end():])


def load_refs(path):
    if not path.exists():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict) or not all(isinstance(v, str) for v in data.values()):
        raise BuildError(f"{path.name}: must map key -> reference text")
    return {str(k): v for k, v in data.items()}


# ---------------------------------------------------------------- lint + annotate tokens
def lint_source(page):
    depth = []
    for n, line in enumerate(page.body.splitlines(), 1):
        m = re.match(r"^(:{3,})\s*(.*)$", line)
        if not m:
            continue
        if m.group(2):
            name, _ = parse_info(m.group(2))
            if name not in BLOCKS:
                raise BuildError(f"{page.src.name}:{n}: unknown block '::: {name}' (known: {', '.join(sorted(BLOCKS))})")
            depth.append(len(m.group(1)))
        else:
            if not depth:
                raise BuildError(f"{page.src.name}:{n}: stray ':::' with no open block")
            depth.pop()
    if depth:
        raise BuildError(f"{page.src.name}: {len(depth)} ':::' block(s) not closed")
    if FORBIDDEN_HTML.search(page.body):
        raise BuildError(f"{page.src.name}: forbidden raw HTML (<script>, <style>, <iframe>, on*=, javascript:)")


def resolve_cites(page, tokens, refs):
    for t in tokens:
        if t.type != "inline" or not t.children:
            continue
        out = []
        for c in t.children:
            if c.type != "text" or "[@" not in c.content:
                out.append(c); continue
            pos = 0
            for m in CITE.finditer(c.content):
                if m.start() > pos:
                    tt = c.copy(); tt.content = c.content[pos:m.start()]; out.append(tt)
                sups = []
                for key in re.findall(r"@([A-Za-z0-9_:-]+)", m.group(1)):
                    if key not in refs:
                        raise BuildError(f"{page.src.name}: unknown citation key '@{key}' (add it to content/refs.yaml)")
                    n = page.cites.setdefault(key, len(page.cites) + 1)
                    sups.append(f'<a href="#ref-{esc(key)}" id="cite-{esc(key)}-{n}">{n}</a>')
                h = c.copy(); h.type = "html_inline"; h.content = f'<sup class="cite">[{",".join(sups)}]</sup>'
                out.append(h); pos = m.end()
            if pos < len(c.content):
                tt = c.copy(); tt.content = c.content[pos:]; out.append(tt)
        t.children = out


def annotate_tables(page, tokens, sid, counter):
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.type == "table_open":
            counter["table"] += 1
            aid = f"{sid}-table-{counter['table']}"
            page.add_id(aid, "table")
            labels, col, j, header = [], 0, i + 1, True
            first_cell = None
            while tokens[j].type != "table_close":
                tj = tokens[j]
                if tj.type == "tr_open":
                    col = 0; first_cell = None; tr = tj
                elif tj.type in ("th_open", "td_open"):
                    tj.meta = {"col": col}
                    if tj.type == "th_open":
                        labels.append(re.sub(r"[*`]", "", tokens[j + 1].content))
                    else:
                        tj.meta["label"] = labels[col] if col < len(labels) else ""
                        if col == 0:
                            first_cell = tokens[j + 1].content.strip()
                            tr.meta = {"total": first_cell == "合计"}
                    col += 1
                j += 1
            n = len(labels)
            kind = (" wide" if n >= 3 else "") + (" stack" if n >= 4 else "") + (" xwide" if n >= 6 else "")
            t.meta = {"aid": aid, "kind": kind}
            i = j
        i += 1


# ---------------------------------------------------------------- render
def render_seq(page, tokens, ctx):
    """Render a balanced token list; ::: containers are rendered by render_block."""
    out, run, i = [], [], 0
    while i < len(tokens):
        t = tokens[i]
        if t.type == "container_dir_open":
            if run:
                out.append(MD.renderer.render(run, MD.options, ctx["env"])); run = []
            depth, j = 1, i + 1
            while depth:
                if tokens[j].type == "container_dir_open": depth += 1
                elif tokens[j].type == "container_dir_close": depth -= 1
                j += 1
            out.append(render_block(page, t, tokens[i + 1:j - 1], ctx))
            i = j
            continue
        run.append(t); i += 1
    if run:
        out.append(MD.renderer.render(run, MD.options, ctx["env"]))
    return "".join(out)


def split_h3(page, inner, name, bid):
    groups, cur = [], None
    i = 0
    while i < len(inner):
        t = inner[i]
        if t.type == "heading_open" and t.tag == "h3" and t.level == inner[0].level:
            cur = {"title": inner[i + 1], "body": []}; groups.append(cur); i += 3; continue
        if cur is None:
            if t.type in ("paragraph_open",) or t.nesting == 1:
                raise BuildError(f"{page.src.name}: '::: {name}' #{bid}: start each part with '### title'")
            i += 1; continue
        cur["body"].append(t); i += 1
    if len(groups) < 2:
        raise BuildError(f"{page.src.name}: '::: {name}' #{bid} needs at least 2 '### ' parts")
    return groups


def caption_html(page, inner, ctx):
    h = render_seq(page, inner, ctx).strip()
    return re.sub(r"^<p>(.*)</p>$", r"\1", h, flags=re.S) if h.count("<p>") == 1 else h


def asset_ok(page, src, ctx):
    if src.startswith("/"):
        if not (page.src.parent / "assets" / src.split("#")[0].lstrip("/")).is_file():
            raise BuildError(f"{page.src.name}: file not found: content/assets{src}")
    elif not re.match(r"^https://", src):
        raise BuildError(f"{page.src.name}: src must be /file (in content/assets/) or https://… : {src}")


def render_block(page, tok, inner, ctx):
    name, a = parse_info(tok.info)
    if name not in BLOCKS:
        raise BuildError(f"{page.src.name}: unknown block '::: {name}'")
    bid = a.get("id")
    if name in NEED_ID and not bid:
        raise BuildError(f"{page.src.name}: '::: {name}' needs an id, e.g. ::: {{.{name} #{name[:3]}-x ...}}")
    sid = ctx["sid"]
    if not bid:
        txt = "".join(t.content for t in inner if t.type == "inline")
        base_id = bid = f"{sid}-{name}-{hashlib.sha1(txt.encode()).hexdigest()[:6]}"
        k = 2
        while bid in page.ids:
            bid = f"{base_id}-{k}"; k += 1
    page.add_id(bid, f"::: {name}")
    extra = f' {esc(a["class"])}' if a.get("class") else ""
    if name == "figure":
        src = a.get("src") or ""
        if not src: raise BuildError(f"{page.src.name}: figure #{bid} needs src=")
        asset_ok(page, src, ctx)
        cap = caption_html(page, inner, ctx)
        alt = a.get("alt") or re.sub(r"<[^>]+>", "", cap)
        return (f'<figure class="fig{extra}" id="{esc(bid)}" data-anchor-id="{esc(bid)}">'
                f'<a href="{esc(src)}" target="_blank" rel="noopener"><img src="{esc(src)}" alt="{esc(alt)}" loading="lazy" decoding="async"></a>'
                f"<figcaption>{cap}</figcaption></figure>\n")
    if name == "video":
        src = a.get("src") or ""
        if not src: raise BuildError(f"{page.src.name}: video #{bid} needs src=")
        asset_ok(page, src, ctx)
        poster = f' poster="{esc(a["poster"])}"' if a.get("poster") else ""
        t0 = f"#t={esc(a['t'])}" if a.get("t") else ""
        return (f'<figure class="fig video{extra}" id="{esc(bid)}" data-anchor-id="{esc(bid)}">'
                f'<video src="{esc(src)}{t0}" controls preload="metadata" playsinline{poster}></video>'
                f"<figcaption>{caption_html(page, inner, ctx)}</figcaption></figure>\n")
    if name == "viz":
        if not a.get("kind"): raise BuildError(f"{page.src.name}: viz #{bid} needs kind=")
        data = a.get("src") or a.get("data") or ""
        if data: asset_ok(page, data, ctx)
        opts = "".join(f' data-{esc(k)}="{esc(v)}"' for k, v in a.items() if k not in ("id", "kind", "src", "data", "class"))
        cap = caption_html(page, inner, ctx)
        return (f'<figure class="fig viz{extra}" id="{esc(bid)}" data-anchor-id="{esc(bid)}">'
                f'<x-viz kind="{esc(a["kind"])}" src="{esc(data)}"{opts} role="img" aria-label="{esc(re.sub(r"<[^>]+>", "", cap))}">'
                f'<span class="viz-fallback">可视化加载中……</span></x-viz>'
                f"<figcaption>{cap}</figcaption></figure>\n")
    if name in CALLOUT_TITLE:
        title = a.get("title") or CALLOUT_TITLE[name]
        return (f'<aside class="callout callout-{name}{extra}" role="note" id="{esc(bid)}" data-anchor-id="{esc(bid)}">'
                f'<p class="callout-title">{esc(title)}</p>{render_seq(page, inner, ctx)}</aside>\n')
    if name == "aside":
        return f'<aside class="sidenote{extra}" id="{esc(bid)}" data-anchor-id="{esc(bid)}">{render_seq(page, inner, ctx)}</aside>\n'
    if name == "details":
        summ = a.get("summary") or a.get("title") or "展开"
        return (f'<details class="details{extra}" id="{esc(bid)}" data-anchor-id="{esc(bid)}"><summary>{esc(summ)}</summary>'
                f"{render_seq(page, inner, ctx)}</details>\n")
    groups = split_h3(page, inner, name, bid)
    if name in ("compare", "columns"):
        cols = "".join(f'<div class="col"><h3>{MD.renderer.render([g["title"]], MD.options, ctx["env"])}</h3>{render_seq(page, g["body"], ctx)}</div>'
                       for g in groups)
        return f'<div class="{name}{extra} n{len(groups)}" id="{esc(bid)}" data-anchor-id="{esc(bid)}">{cols}</div>\n'
    # tabs
    btns, panels = [], []
    for k, g in enumerate(groups, 1):
        title = MD.renderer.render([g["title"]], MD.options, ctx["env"])
        pid = f"{bid}-{k}"
        page.add_id(pid, f"tab of #{bid}")
        btns.append(f'<button type="button" role="tab" id="{esc(pid)}-tab" aria-controls="{esc(pid)}" aria-selected="{"true" if k == 1 else "false"}"{"" if k == 1 else " tabindex=\"-1\""}>{title}</button>')
        panels.append(f'<div class="tab-panel" role="tabpanel" id="{esc(pid)}" aria-labelledby="{esc(pid)}-tab"><h3 class="tab-h">{title}</h3>{render_seq(page, g["body"], ctx)}</div>')
    return (f'<div class="tabs{extra}" id="{esc(bid)}" data-anchor-id="{esc(bid)}"><div class="tab-list" role="tablist">{"".join(btns)}</div>'
            f'{"".join(panels)}</div>\n')


def annotate_section(page, toks, sid):
    """Stable anchors: blockquotes sX-note-N, paragraphs sX-p-<hash>, meta paragraphs, step lists."""
    notes = 0
    base = toks[0].level if toks else 0
    for i, t in enumerate(toks):
        if t.type == "blockquote_open" and t.level == base:
            notes += 1
            aid = f"{sid}-note-{notes}"; page.add_id(aid, "blockquote"); t.attrSet("data-anchor-id", aid)
        elif t.type == "paragraph_open" and t.level == base:
            txt = toks[i + 1].content
            if txt.startswith("链接：") or txt.startswith("详见"):
                t.attrSet("class", "meta")
            aid = f"{sid}-p-{hashlib.sha1(txt.encode()).hexdigest()[:6]}"
            k = 2
            while aid in page.ids:
                aid = f"{sid}-p-{hashlib.sha1(txt.encode()).hexdigest()[:6]}-{k}"; k += 1
            page.add_id(aid, "paragraph"); t.attrSet("data-anchor-id", aid)
        elif t.type == "ordered_list_open" and t.level == base:
            t.attrSet("class", "steps")
            start = int(t.attrGet("start") or 1)
            if start != 1:
                t.attrSet("style", f"counter-reset: step {start - 1}")


def build_page(page, refs, published):
    lint_source(page)
    env = {"published": published}
    tokens = MD.parse(page.body, env)
    resolve_cites(page, tokens, refs)
    for t in tokens:
        if t.type == "inline" and t.content.lstrip().startswith(":::"):
            raise BuildError(f"{page.src.name}: stray ':::' text near: {t.content[:40]!r}")
        if t.type == "heading_open" and t.tag == "h1":
            raise BuildError(f"{page.src.name}: do not use '# '. The title comes from front matter.")
    # split into lead + h2 sections
    lead, sections, cur = [], [], None
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.type == "heading_open" and t.tag == "h2" and t.level == 0:
            inl = tokens[i + 1]
            hid = strip_heading_id(inl)
            if not hid:
                raise BuildError(f"{page.src.name}: heading '## {inl.content}' needs an id: '## {inl.content} {{#s1}}'")
            page.add_id(hid, "## heading")
            cur = {"id": hid, "inline": inl, "toks": []}; sections.append(cur); i += 3; continue
        if t.type == "heading_open" and t.tag in ("h3", "h4"):
            hid = strip_heading_id(tokens[i + 1])
            if hid:
                page.add_id(hid, f"{t.tag} heading"); t.attrSet("id", hid)
        (cur["toks"] if cur else lead).append(t); i += 1
    if not sections:
        raise BuildError(f"{page.src.name}: needs at least one '## title {{#id}}' section")

    toc, body = [], []
    for s in sections:
        sid = s["id"]
        counter = {"table": 0}
        annotate_tables(page, s["toks"], sid, counter)
        annotate_section(page, s["toks"], sid)
        ctx = {"sid": sid, "env": env}
        title_html = MD.renderer.render([s["inline"]], MD.options, env)
        title_txt = plain(s["inline"])
        m = re.match(r"^(\d+)\.\s*(.+)$", title_txt)
        num, ttl = (m.group(1), m.group(2)) if m else ("", title_txt)
        if m:
            title_html = re.sub(r"^\d+\.\s*", "", title_html)
        page.add_id(f"{sid}-h", "heading element")
        badge = (f'<span class="badge" aria-hidden="true">{num}</span><span class="h-num">{num}. </span>' if num else "")
        toc.append(f'<li><a href="#{esc(sid)}"><span class="toc-n">{num or "·"}</span><span class="toc-t">{html.escape(ttl)}</span></a></li>')
        body.append(f'<section class="card" id="{esc(sid)}" data-section="{esc(sid)}" aria-labelledby="{esc(sid)}-h">'
                    f'<h2 id="{esc(sid)}-h">{badge}<span class="h-t">{title_html}</span></h2>\n'
                    + render_seq(page, s["toks"], ctx) + "</section>")
    if page.cites:
        page.add_id("refs", "references")
        items = "".join(f'<li id="ref-{esc(k)}">{MD.renderInline(refs[k], env)}</li>' for k in page.cites)
        toc.append('<li><a href="#refs"><span class="toc-n">※</span><span class="toc-t">参考文献</span></a></li>')
        body.append('<section class="card refs" id="refs" data-section="refs" aria-labelledby="refs-h">'
                    '<h2 id="refs-h"><span class="h-t">参考文献</span></h2>'
                    f'<ol class="references">{items}</ol></section>')
    for t in lead:
        if t.type == "paragraph_open": t.attrSet("class", "lead")
    lead_html = render_seq(page, lead, {"sid": "intro", "env": env}).strip()

    meta = page.meta
    chips = "".join(f"<li>{html.escape(str(c))}</li>" for c in meta["chips"] + ["选中文字即可评论"])
    others = [p for p in published.values() if p.slug != page.slug]
    more = "".join(f'<li><a class="more-card" href="/{esc(p.slug)}"><span class="more-k">另一篇</span><span class="more-t">{html.escape(p.meta["title"])}</span></a></li>' for p in others)
    tpl = (ROOT / "tools" / "template.html").read_text(encoding="utf-8")
    out = (tpl.replace("{{TITLE}}", html.escape(meta["title"]))
              .replace("{{DESC}}", esc(meta["description"]))
              .replace("{{PAGE_ID}}", page.slug)
              .replace("{{NAV}}", nav_html(page.slug, published))
              .replace("{{CHIPS}}", chips)
              .replace("{{LEAD}}", lead_html)
              .replace("{{TOC}}", "".join(toc))
              .replace("{{SECTIONS}}", "\n".join(body))
              .replace("{{MORE}}", more)
              .replace("{{SOURCE}}", html.escape(f"content/{page.src.name}"))
              .replace("{{UPDATED}}", html.escape(meta["updated"] or "—")))
    if "{{" in out:
        raise BuildError("template has an unreplaced placeholder")
    page.html = out
    page.lead_html = lead_html
    page.section_titles = [plain(s["inline"]) for s in sections]
    return out


def nav_html(cur_slug, published):
    links = "".join(
        f'<a href="/{esc(p.slug)}"{" aria-current=\"page\"" if p.slug == cur_slug else ""} title="{esc(p.meta["title"])}">{html.escape(p.meta["short"])}</a>'
        for p in published.values())
    home = ' aria-current="page"' if cur_slug is None else ""
    return (f'<nav class="topnav" aria-label="站点"><div class="topnav-inner"><a class="brand" href="/"{home}>thoughts</a>'
            f'<div class="topnav-links">{links}</div></div></nav>')


def build_index(published, updated):
    cards = []
    for p in published.values():
        lead = re.sub(r'<p class="lead">(.*?)</p>.*', r"\1", p.lead_html, count=1, flags=re.S) if p.lead_html else ""
        secs = "".join(f"<li>{html.escape(re.sub(r'^\d+\.\s*', '', t))}</li>" for t in p.section_titles)
        cards.append(f'<li><a class="idx-card" href="/{esc(p.slug)}">'
                     f'<span class="idx-k">{html.escape(p.meta["short"])} · {len(p.section_titles)} 节</span>'
                     f'<span class="idx-t">{html.escape(p.meta["title"])}</span>'
                     f'<span class="idx-lead">{lead}</span><ol class="idx-secs">{secs}</ol>'
                     f'<span class="idx-go">阅读并评论 →</span></a></li>')
    tpl = (ROOT / "tools" / "index-template.html").read_text(encoding="utf-8")
    out = (tpl.replace("{{NAV}}", nav_html(None, published)).replace("{{CARDS}}", "\n".join(cards))
              .replace("{{N}}", str(len(published))).replace("{{UPDATED}}", html.escape(updated or "—")))
    if "{{" in out:
        raise BuildError("index template has an unreplaced placeholder")
    return out


# ---------------------------------------------------------------- site
def build_site(content_dir, public_dir, gen_js):
    refs = load_refs(content_dir / "refs.yaml")
    pages = [read_page(p) for p in sorted(content_dir.glob("*.md"))]
    pages = [p for p in pages if not p.meta.get("draft")]
    seen = {}
    for p in pages:
        if p.slug in seen:
            raise BuildError(f"duplicate slug '{p.slug}' in {p.src.name} and {seen[p.slug]}")
        seen[p.slug] = p.src.name
    pages.sort(key=lambda p: (p.meta["order"], p.meta["title"]))
    published = {p.slug: p for p in pages}
    for p in pages:
        build_page(p, refs, published)
    index = build_index(published, max((p.meta["updated"] for p in pages), default=""))

    # all checks passed: write outputs
    public_dir.mkdir(parents=True, exist_ok=True)
    for f in public_dir.iterdir():           # generated files are rebuilt from scratch
        if f.name not in STATIC:
            shutil.rmtree(f) if f.is_dir() else f.unlink()
    for p in pages:
        (public_dir / f"{p.slug}.html").write_text(p.html, encoding="utf-8")
        print(f"wrote public/{p.slug}.html ({len(p.html)} bytes, {len(p.ids)} ids)")
    (public_dir / "index.html").write_text(index, encoding="utf-8")
    assets = content_dir / "assets"
    if assets.is_dir():
        for f in sorted(assets.rglob("*")):
            if f.is_file():
                dst = public_dir / f.relative_to(assets)
                if dst.name in STATIC or dst.suffix == ".html":
                    raise BuildError(f"asset name not allowed: {f}")
                dst.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(f, dst)
    bundle_site(public_dir, gen_js)
    return pages


TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml",
         ".json": "application/json; charset=utf-8", ".csv": "text/csv; charset=utf-8",
         ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
         ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm"}
TEXT = {".html", ".css", ".js", ".svg", ".json", ".csv"}


def bundle_site(public_dir, gen_js):
    """Embed public/** into src/site.gen.js so the Worker serves them (no assets binding needed)."""
    entries = {}
    for f in sorted(public_dir.rglob("*")):
        if not f.is_file():
            continue
        if f.suffix.lower() not in TYPES:
            raise BuildError(f"unsupported file type: {f.name} (allowed: {' '.join(sorted(TYPES))})")
        raw = f.read_bytes()
        key = "/" + f.relative_to(public_dir).as_posix()
        e = {"type": TYPES[f.suffix.lower()], "etag": f'"{hashlib.sha256(raw).hexdigest()[:16]}"'}
        if f.suffix.lower() in TEXT: e["body"] = raw.decode("utf-8")
        else: e["b64"] = base64.b64encode(raw).decode()
        entries[key] = e
    js = ("// GENERATED by tools/build.py from public/*. Do not edit by hand.\n"
          "export default " + json.dumps(entries, ensure_ascii=False, indent=0) + ";\n")
    gen_js.write_text(js, encoding="utf-8")
    size = len(js.encode())
    print(f"wrote {gen_js.relative_to(ROOT) if gen_js.is_relative_to(ROOT) else gen_js} ({size} bytes, {len(entries)} files)")
    if size > 40_000_000:  # Workers limit: 64 MiB uncompressed (developers.cloudflare.com/workers/platform/limits/#worker-size)
        raise BuildError(f"bundle is {size} bytes; keep it well under the 64 MiB Worker limit. Move big media out.")


# ---------------------------------------------------------------- self-test
def selftest():
    """Build tools/examples (all components) into a temp dir; check that bad input fails."""
    ex = ROOT / "tools" / "examples"
    with tempfile.TemporaryDirectory() as td:
        td = pathlib.Path(td)
        shutil.copytree(ex, td / "content")
        pub = td / "public"; pub.mkdir()
        for s in STATIC: shutil.copyfile(ROOT / "public" / s, pub / s)
        pages = build_site_quiet(td / "content", pub, td / "site.gen.js")
        h = pages[0].html
        for needle in ('class="fig"', 'class="fig video"', "<x-viz", 'class="callout callout-warning"',
                       'class="sidenote"', 'class="aside"', 'class="compare', 'class="tabs"', 'class="references"',
                       'data-section="c1"', 'class="table-wrap', "<details"):
            assert needle in h, f"selftest: missing {needle}"
        good = (td / "content" / "components.md").read_text(encoding="utf-8")
        bad_cases = {   # label: (appended text, expected error substring)
            "unknown block": ("\n::: {.bogus #b1}\nx\n:::\n", "unknown block"),
            "missing heading id": ("\n## 没有 id 的标题\n", "needs an id"),
            "duplicate id": ("\n## 重复 {#c1}\n", "duplicate id"),
            "figure without id": ("\n::: {.figure src=/demo.svg}\nx\n:::\n", "needs an id"),
            "unknown citation": ("\n见 [@nokey]。\n", "unknown citation"),
            "stray close": ("\n:::\n", "stray"),
            "script tag": ("\n<script>alert(1)</script>\n", "forbidden raw HTML"),
            "missing asset": ("\n::: {.figure #f-missing src=/nope.png}\nx\n:::\n", "file not found"),
            "unknown front matter": (None, "unknown front matter"),
        }
        for label, (extra, expect) in bad_cases.items():
            text = good + extra if extra is not None else good.replace("short: 组件", "short: 组件\nauthor: x", 1)
            (td / "content" / "components.md").write_text(text, encoding="utf-8")
            try:
                build_site_quiet(td / "content", pub, td / "site.gen.js")
            except BuildError as e:
                if expect not in str(e):
                    raise AssertionError(f"selftest: '{label}' failed with the wrong error: {e}")
                continue
            raise AssertionError(f"selftest: '{label}' should fail the build")
    print(f"selftest ok (components render; {len(bad_cases)} bad inputs rejected)")


def build_site_quiet(content_dir, public_dir, gen_js):
    import contextlib, io
    with contextlib.redirect_stdout(io.StringIO()):
        return build_site(content_dir, public_dir, gen_js)


def main():
    try:
        selftest()
        build_site(ROOT / "content", ROOT / "public", ROOT / "src" / "site.gen.js")
    except BuildError as e:
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
