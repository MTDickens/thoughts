#!/usr/bin/env python3
"""Build the thoughts site from content/*.md.

Pages (see PAGES): each Markdown file becomes public/<slug>.html.
public/index.html is a simple index that links to every page.
Everything in public/ is then embedded into src/site.gen.js for the Worker.

Tiny purpose-built converter: h1, "## N. title" sections, paragraphs, blockquotes,
pipe tables (with alignment), ordered lists, images, links, inline code, bold.
Text is kept verbatim.
"""
import base64, hashlib, html, json, pathlib, re, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
PUBLIC = ROOT / "public"
UPDATED = "2026-10-08"

# Order = order on the index page and in the nav.
PAGES = [
    {
        "slug": "wrop-improvement-directions",
        "short": "改进方向",
        "desc": "WROP 基准的 7 个后续改进方向。可选中文字匿名评论。",
        "chips": ["7 个方向", "依据作者已承认的问题"],
    },
    {
        "slug": "wrop-metrics-zh",
        "short": "评测指标",
        "desc": "WROP 的评测指标：是什么、怎么算、哪里弱。可选中文字匿名评论。",
        "chips": ["7 节", "人工 Elo 与自动指标", "G26 复算例子"],
    },
]
# Images referenced by the pages. Copied from content/assets/ into public/.
ASSETS = ["wrop-metrics-g26-sheet.png"]


def inline(s, published):
    out, i = [], 0
    pat = re.compile(r"`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)")
    for m in pat.finditer(s):
        out.append(html.escape(s[i:m.start()], quote=False))
        if m.group(1) is not None:
            out.append(f"<code>{html.escape(m.group(1), quote=False)}</code>")
        elif m.group(2) is not None:
            out.append(f"<strong>{inline(m.group(2), published)}</strong>")
        else:
            text, url = m.group(3), m.group(4)
            if re.match(r"^https?://", url):
                out.append(f'<a href="{html.escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">{html.escape(text, quote=False)}</a>')
            elif url.endswith(".md") and url[:-3] in published:
                out.append(f'<a href="/{html.escape(url[:-3], quote=True)}">{html.escape(text, quote=False)}</a>')
            else:
                # Local file that is not published on this site: keep the name, no link.
                out.append(f'<span class="unpub" title="未在本站发布">{html.escape(text, quote=False)}</span>')
        i = m.end()
    out.append(html.escape(s[i:], quote=False))
    return "".join(out)


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def table(lines, sec, n, published):
    head, aligns_raw, body = cells(lines[0]), cells(lines[1]), [cells(l) for l in lines[2:]]
    aligns = ["right" if a.endswith(":") and not a.startswith(":") else "center" if a.startswith(":") and a.endswith(":") else "" for a in aligns_raw]
    def cls(j):
        c = []
        if j < len(aligns) and aligns[j] == "right": c.append("num")
        if j == 0: c.append("k")
        return f' class="{" ".join(c)}"' if c else ""
    h = "\n".join(f"<th{cls(j)} scope=\"col\">{inline(t, published)}</th>" for j, t in enumerate(head))
    rows = []
    for r in body:
        tds = "\n".join(
            f"<td{cls(j)} data-label=\"{html.escape(re.sub(r'[*`]', '', head[j]) if j < len(head) else '', quote=True)}\"><span class=\"cv\">{inline(t, published)}</span></td>"
            for j, t in enumerate(r))
        total = ' class="total"' if r[0] == "合计" else ""
        rows.append(f"<tr{total}>{tds}</tr>")
    ncol = len(head)
    kind = " wide" if ncol >= 3 else ""
    if ncol >= 4: kind += " stack"          # becomes cards on narrow screens
    if ncol >= 6: kind += " xwide"
    return (f'<div class="table-wrap{kind}" data-anchor-id="{sec}-table-{n}" tabindex="0" role="region" aria-label="表格">'
            f"<table>\n<thead><tr>{h}</tr></thead>\n<tbody>\n{chr(10).join(rows)}\n</tbody>\n</table></div>")


def parse(src):
    lines = src.read_text(encoding="utf-8").splitlines()
    title, lead, sections, cur = None, [], [], None
    i = 0
    while i < len(lines):
        ln = lines[i]
        tgt = cur["blocks"] if cur else lead
        if ln.startswith("# "):
            title = ln[2:].strip(); i += 1; continue
        m = re.match(r"^## (\d+)\.\s*(.+)$", ln)
        if m:
            cur = {"num": m.group(1), "title": m.group(2).strip(), "blocks": []}
            sections.append(cur); i += 1; continue
        if not ln.strip():
            i += 1; continue
        if ln.startswith("|"):
            j = i
            while j < len(lines) and lines[j].startswith("|"): j += 1
            tgt.append(("table", lines[i:j])); i = j; continue
        if ln.startswith("> "):
            tgt.append(("quote", ln[2:].strip())); i += 1; continue
        im = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$", ln)
        if im:
            tgt.append(("img", (im.group(1), im.group(2)))); i += 1; continue
        if re.match(r"^\d+\.\s", ln):
            items, start = [], int(re.match(r"^(\d+)\.", ln).group(1))
            while i < len(lines) and re.match(r"^\d+\.\s", lines[i]):
                items.append(re.sub(r"^\d+\.\s+", "", lines[i]).strip()); i += 1
            tgt.append(("ol", (start, items))); continue
        tgt.append(("p", ln.strip())); i += 1
    assert title and sections, (src, title, len(sections))
    return title, lead, sections


def nav_html(cur_slug, titles):
    links = []
    for p in PAGES:
        cur = ' aria-current="page"' if p["slug"] == cur_slug else ""
        links.append(f'<a href="/{p["slug"]}"{cur} title="{html.escape(titles[p["slug"]], quote=True)}">{html.escape(p["short"])}</a>')
    home_cur = ' aria-current="page"' if cur_slug is None else ""
    return (f'<nav class="topnav" aria-label="站点"><div class="topnav-inner">'
            f'<a class="brand" href="/"{home_cur}>thoughts</a>'
            f'<div class="topnav-links">{"".join(links)}</div></div></nav>')


def build_page(page, titles, published):
    src = CONTENT / f"{page['slug']}.md"
    title, lead, sections = parse(src)
    toc, body = [], []
    for s in sections:
        sid = f"s{s['num']}"
        toc.append(f'<li><a href="#{sid}"><span class="toc-n">{s["num"]}</span><span class="toc-t">{html.escape(s["title"])}</span></a></li>')
        parts, tn, qn, fn = [], 0, 0, 0
        for kind, val in s["blocks"]:
            if kind == "table":
                tn += 1; parts.append(table(val, sid, tn, published))
            elif kind == "quote":
                qn += 1; parts.append(f'<blockquote data-anchor-id="{sid}-note-{qn}"><p>{inline(val, published)}</p></blockquote>')
            elif kind == "img":
                fn += 1
                alt, url = val
                name = url.rsplit("/", 1)[-1]
                assert name in ASSETS, f"image {name} not in ASSETS"
                parts.append(f'<figure class="fig" data-anchor-id="{sid}-fig-{fn}">'
                             f'<a href="/{html.escape(name, quote=True)}" target="_blank" rel="noopener"><img src="/{html.escape(name, quote=True)}" alt="{html.escape(alt, quote=True)}" loading="lazy" decoding="async"></a>'
                             f'<figcaption>{html.escape(alt)}</figcaption></figure>')
            elif kind == "ol":
                start, items = val
                st = f' start="{start}"' if start != 1 else ""
                parts.append(f"<ol class=\"steps\"{st}>" + "".join(f"<li>{inline(t, published)}</li>" for t in items) + "</ol>")
            else:
                meta = val.startswith("链接：") or val.startswith("详见")
                parts.append(f'<p class="{"meta" if meta else ""}">{inline(val, published)}</p>'.replace(' class=""', ""))
        body.append(
            f'<section class="card" id="{sid}" data-section="{sid}" aria-labelledby="{sid}-h">'
            f'<h2 id="{sid}-h"><span class="badge" aria-hidden="true">{s["num"]}</span>'
            f'<span class="h-num">{s["num"]}. </span><span class="h-t">{html.escape(s["title"])}</span></h2>'
            + "\n" + "\n".join(parts) + "\n</section>")
    lead_html = "\n".join(f'<p class="lead">{inline(v, published)}</p>' for k, v in lead)
    chips = "".join(f"<li>{html.escape(c)}</li>" for c in page["chips"] + ["选中文字即可评论"])
    others = [p for p in PAGES if p["slug"] != page["slug"]]
    more = "".join(f'<li><a class="more-card" href="/{p["slug"]}"><span class="more-k">另一篇</span><span class="more-t">{html.escape(titles[p["slug"]])}</span></a></li>' for p in others)

    tpl = (ROOT / "tools" / "template.html").read_text(encoding="utf-8")
    out = (tpl.replace("{{TITLE}}", html.escape(title))
              .replace("{{DESC}}", html.escape(page["desc"], quote=True))
              .replace("{{PAGE_ID}}", page["slug"])
              .replace("{{NAV}}", nav_html(page["slug"], titles))
              .replace("{{CHIPS}}", chips)
              .replace("{{LEAD}}", lead_html)
              .replace("{{TOC}}", "".join(toc))
              .replace("{{SECTIONS}}", "\n".join(body))
              .replace("{{MORE}}", more)
              .replace("{{SOURCE}}", html.escape(f"{page['slug']}.md"))
              .replace("{{UPDATED}}", UPDATED))
    assert "{{" not in out, "unreplaced placeholder"
    dst = PUBLIC / f"{page['slug']}.html"
    dst.write_text(out, encoding="utf-8")
    print(f"wrote {dst.relative_to(ROOT)} ({len(out)} bytes)")
    return title, lead, sections


def build_index(titles, info, published):
    cards = []
    for p in PAGES:
        title, lead, sections = info[p["slug"]]
        lead_txt = inline(lead[0][1], published) if lead else ""
        secs = "".join(f"<li>{html.escape(s['title'])}</li>" for s in sections)
        cards.append(
            f'<li><a class="idx-card" href="/{p["slug"]}">'
            f'<span class="idx-k">{html.escape(p["short"])} · {len(sections)} 节</span>'
            f'<span class="idx-t">{html.escape(title)}</span>'
            f'<span class="idx-lead">{lead_txt}</span>'
            f'<ol class="idx-secs">{secs}</ol>'
            f'<span class="idx-go">阅读并评论 →</span></a></li>')
    tpl = (ROOT / "tools" / "index-template.html").read_text(encoding="utf-8")
    out = (tpl.replace("{{NAV}}", nav_html(None, titles))
              .replace("{{CARDS}}", "\n".join(cards))
              .replace("{{N}}", str(len(PAGES)))
              .replace("{{UPDATED}}", UPDATED))
    assert "{{" not in out, "unreplaced placeholder"
    (PUBLIC / "index.html").write_text(out, encoding="utf-8")
    print(f"wrote public/index.html ({len(out)} bytes)")


def main():
    published = {p["slug"] for p in PAGES}
    titles = {p["slug"]: parse(CONTENT / f"{p['slug']}.md")[0] for p in PAGES}
    info = {p["slug"]: build_page(p, titles, published) for p in PAGES}
    build_index(titles, info, published)
    for name in ASSETS:
        shutil.copyfile(CONTENT / "assets" / name, PUBLIC / name)
    bundle_site()


TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml",
         ".png": "image/png"}
BINARY = {".png"}


def bundle_site():
    """Embed public/* into src/site.gen.js so the Worker serves them (no assets binding needed)."""
    entries = {}
    for f in sorted(PUBLIC.iterdir()):
        if f.suffix not in TYPES:
            continue
        raw = f.read_bytes()
        etag = f'"{hashlib.sha256(raw).hexdigest()[:16]}"'
        if f.suffix in BINARY:
            entries["/" + f.name] = {"type": TYPES[f.suffix], "etag": etag, "b64": base64.b64encode(raw).decode()}
        else:
            entries["/" + f.name] = {"type": TYPES[f.suffix], "etag": etag, "body": raw.decode("utf-8")}
    js = ("// GENERATED by tools/build.py from public/*. Do not edit by hand.\n"
          "export default " + json.dumps(entries, ensure_ascii=False, indent=0) + ";\n")
    (ROOT / "src" / "site.gen.js").write_text(js, encoding="utf-8")
    print(f"wrote src/site.gen.js ({len(js.encode())} bytes, {len(entries)} files)")


if __name__ == "__main__":
    main()
