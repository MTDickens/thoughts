#!/usr/bin/env python3
"""Build public/index.html from content/wrop-improvement-directions.md.

Tiny purpose-built converter: h1, h2 sections, paragraphs, blockquotes,
pipe tables (with alignment), links, inline code. Text is kept verbatim.
"""
import html, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "wrop-improvement-directions.md"
OUT = ROOT / "public" / "index.html"
PAGE_ID = "wrop-improvement-directions"

def inline(s):
    out, i = [], 0
    pat = re.compile(r"`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)")
    for m in pat.finditer(s):
        out.append(html.escape(s[i:m.start()], quote=False))
        if m.group(1) is not None:
            out.append(f"<code>{html.escape(m.group(1), quote=False)}</code>")
        else:
            url = html.escape(m.group(3), quote=True)
            out.append(f'<a href="{url}" target="_blank" rel="noopener noreferrer">{html.escape(m.group(2), quote=False)}</a>')
        i = m.end()
    out.append(html.escape(s[i:], quote=False))
    return "".join(out)

def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]

NUM = re.compile(r"^[约~]?[\d.,]+(%|万)?$")

def table(lines, sec, n):
    head, aligns_raw, body = cells(lines[0]), cells(lines[1]), [cells(l) for l in lines[2:]]
    aligns = ["right" if a.endswith(":") and not a.startswith(":") else "center" if a.startswith(":") and a.endswith(":") else "" for a in aligns_raw]
    def cls(j, txt):
        c = []
        if aligns[j] == "right": c.append("num")
        if j == 0: c.append("k")
        return f' class="{" ".join(c)}"' if c else ""
    h = "\n".join(f"<th{cls(j, t)} scope=\"col\">{inline(t)}</th>" for j, t in enumerate(head))
    rows = []
    for r in body:
        tds = "\n".join(f"<td{cls(j, t)}>{inline(t)}</td>" for j, t in enumerate(r))
        total = ' class="total"' if r[0] == "合计" else ""
        rows.append(f"<tr{total}>{tds}</tr>")
    wide = " wide" if len(head) >= 3 else ""
    return (f'<div class="table-wrap{wide}" data-anchor-id="{sec}-table-{n}">'
            f"<table>\n<thead><tr>{h}</tr></thead>\n<tbody>\n{chr(10).join(rows)}\n</tbody>\n</table></div>")

def main():
    lines = SRC.read_text(encoding="utf-8").splitlines()
    title, lead, sections, cur = None, [], [], None
    i = 0
    while i < len(lines):
        ln = lines[i]
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
            cur["blocks"].append(("table", lines[i:j])); i = j; continue
        if ln.startswith("> "):
            (cur["blocks"] if cur else lead).append(("quote", ln[2:].strip())); i += 1; continue
        (cur["blocks"] if cur else lead).append(("p", ln.strip())); i += 1
    assert title and len(sections) == 7, (title, len(sections))

    toc, body = [], []
    for s in sections:
        sid = f"s{s['num']}"
        toc.append(f'<li><a href="#{sid}"><span class="toc-n">{s["num"]}</span><span class="toc-t">{html.escape(s["title"])}</span></a></li>')
        parts, tn, qn = [], 0, 0
        for kind, val in s["blocks"]:
            if kind == "table":
                tn += 1; parts.append(table(val, sid, tn))
            elif kind == "quote":
                qn += 1; parts.append(f'<blockquote data-anchor-id="{sid}-note-{qn}"><p>{inline(val)}</p></blockquote>')
            else:
                meta = val.startswith("链接：") or val.startswith("详见：")
                parts.append(f'<p class="{"meta" if meta else ""}">{inline(val)}</p>'.replace(' class=""', ""))
        body.append(
            f'<section class="card" id="{sid}" data-section="{sid}" aria-labelledby="{sid}-h">'
            f'<h2 id="{sid}-h"><span class="badge" aria-hidden="true">{s["num"]}</span>'
            f'<span class="h-num">{s["num"]}. </span><span class="h-t">{html.escape(s["title"])}</span></h2>'
            + "\n" + "\n".join(parts) + "\n</section>")
    lead_html = "\n".join(f'<p class="lead">{inline(v)}</p>' for k, v in lead)

    tpl = (ROOT / "tools" / "template.html").read_text(encoding="utf-8")
    out = (tpl.replace("{{TITLE}}", html.escape(title))
              .replace("{{PAGE_ID}}", PAGE_ID)
              .replace("{{LEAD}}", lead_html)
              .replace("{{TOC}}", "".join(toc))
              .replace("{{SECTIONS}}", "\n".join(body)))
    OUT.write_text(out, encoding="utf-8")
    print(f"wrote {OUT} ({len(out)} bytes)")
    bundle_site()

TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml"}

def bundle_site():
    """Embed public/* into src/site.gen.js so the Worker serves them (no assets binding needed)."""
    import hashlib, json
    pub = ROOT / "public"
    entries = {}
    for f in sorted(pub.iterdir()):
        if f.suffix not in TYPES:
            continue
        body = f.read_text(encoding="utf-8")
        etag = hashlib.sha256(body.encode()).hexdigest()[:16]
        entries["/" + f.name] = {"type": TYPES[f.suffix], "etag": f'"{etag}"', "body": body}
    js = ("// GENERATED by tools/build.py from public/*. Do not edit by hand.\n"
          "export default " + json.dumps(entries, ensure_ascii=False, indent=0) + ";\n")
    (ROOT / "src" / "site.gen.js").write_text(js, encoding="utf-8")
    print(f"wrote src/site.gen.js ({len(js.encode())} bytes, {len(entries)} files)")

if __name__ == "__main__":
    main()
