#!/usr/bin/env python3
"""thoughts comments CLI for agents (Python stdlib only).

Token: $THOUGHTS_AGENT_TOKEN, else AGENT_TOKEN in /home/box/.config/thoughts/secrets.env
(--role owner uses $THOUGHTS_OWNER_TOKEN / OWNER_TOKEN; only for tests and for Max).
Base URL: $THOUGHTS_URL (default https://thoughts.ycjian.com).

  comments.py list [--page P] [--status open|resolved|all] [--since MS|2026-10-08|2h|3d] [--author-role R]
  comments.py open [--page P]                       # unresolved threads (root + replies)
  comments.py show ID
  comments.py add --page P --anchor s3 --quote "exact text" [--prefix ..] [--suffix ..] [--element] TEXT
  comments.py reply ID TEXT
  comments.py edit ID TEXT
  comments.py delete ID                              # deletes replies too
  comments.py resolve ID | reopen ID
Global: --json (raw JSON), --name NAME (agent display name), --role agent|owner, --url URL.
"""
import argparse, json, os, pathlib, sys, time, urllib.error, urllib.parse, urllib.request

SECRETS = pathlib.Path("/home/box/.config/thoughts/secrets.env")


def token_for(role):
    env = os.environ.get(f"THOUGHTS_{role.upper()}_TOKEN")
    if env:
        return env.strip()
    if SECRETS.exists():
        for line in SECRETS.read_text().splitlines():
            k, _, v = line.partition("=")
            if k.strip() in (f"{role.upper()}_TOKEN", f"THOUGHTS_{role.upper()}_TOKEN"):
                return v.strip().strip('"').strip("'")
    sys.exit(f"no {role} token: set THOUGHTS_{role.upper()}_TOKEN or add {role.upper()}_TOKEN to {SECRETS}")


class Api:
    def __init__(self, base, token):
        self.base, self.token = base.rstrip("/"), token

    def call(self, method, path, body=None, query=None):
        url = self.base + path
        if query:
            q = {k: v for k, v in query.items() if v not in (None, "")}
            if q:
                url += "?" + urllib.parse.urlencode(q)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={
            "authorization": f"Bearer {self.token}", "content-type": "application/json",
            "user-agent": "thoughts-comments-cli/1"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read()).get("error", "")
            except Exception:
                msg = ""
            sys.exit(f"HTTP {e.code}: {msg or e.reason}")
        except (urllib.error.URLError, OSError) as e:
            sys.exit(f"network error ({self.base}): {getattr(e, 'reason', e)}")


def fmt_time(ms):
    return time.strftime("%Y-%m-%d %H:%M", time.localtime(ms / 1000)) if ms else ""


def who(c):
    if c["author_role"] == "owner":
        return "Max"
    if c["author_role"] == "agent":
        return f"{c.get('author_name') or 'agent'} [agent]"
    return f"{c.get('nickname') or '匿名'} [匿名]"


def print_comment(c, indent=""):
    flags = []
    if c.get("edited_at"): flags.append("edited")
    if c.get("resolved_at") and not c.get("parent_id"): flags.append(f"resolved by {c.get('resolved_by') or '?'}")
    print(f"{indent}{c['id']}  {c['page']}#{c['anchor_id']}  {who(c)}  {fmt_time(c['created_at'])}"
          + (f"  ({', '.join(flags)})" if flags else ""))
    pad = " " * len(indent)
    if c.get("quote") and not c.get("parent_id"):
        print(f"{pad}  > {c['quote'][:200]}")
    for line in c["body"].splitlines() or [""]:
        print(f"{pad}  {line}")


def print_threads(comments):
    roots = [c for c in comments if not c.get("parent_id")]
    kids = {}
    for c in comments:
        if c.get("parent_id"):
            kids.setdefault(c["parent_id"], []).append(c)
    if not roots and not kids:
        print("(no comments)")
    for r in roots:
        print_comment(r)
        for k in kids.get(r["id"], []):
            print_comment(k, "    ↳ ")
        print()
    orphans = [c for pid, cs in kids.items() if pid not in {r["id"] for r in roots} for c in cs]
    for c in orphans:
        print_comment(c, "  ↳ ")


def parse_since(v):
    """ms epoch, ISO date/time (local tz), or relative like 30m / 2h / 3d."""
    import datetime, re as _re
    v = v.strip()
    if v.isdigit():
        return int(v)
    m = _re.fullmatch(r"(\d+)([mhd])", v)
    if m:
        secs = int(m.group(1)) * {"m": 60, "h": 3600, "d": 86400}[m.group(2)]
        return int((datetime.datetime.now().timestamp() - secs) * 1000)
    try:
        d = datetime.datetime.fromisoformat(v)
    except ValueError:
        raise argparse.ArgumentTypeError("use ms epoch, 2026-10-08[T20:00], or 30m/2h/3d")
    return int(d.timestamp() * 1000)


def main():
    ap = argparse.ArgumentParser(description="thoughts comments CLI (agents)", formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("--json", action="store_true", help="print raw JSON")
    ap.add_argument("--name", default=os.environ.get("THOUGHTS_AGENT_NAME", ""), help="agent display name (create/reply)")
    ap.add_argument("--role", choices=["agent", "owner"], default="agent")
    ap.add_argument("--url", default=os.environ.get("THOUGHTS_URL", "https://thoughts.ycjian.com"))
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("list"); s.add_argument("--page"); s.add_argument("--status", default="all", choices=["open", "resolved", "all"])
    s.add_argument("--since", type=parse_since); s.add_argument("--author-role", choices=["owner", "agent", "anon"])
    s = sub.add_parser("open"); s.add_argument("--page")
    s = sub.add_parser("show"); s.add_argument("id")
    s = sub.add_parser("add"); s.add_argument("--page", required=True); s.add_argument("--anchor", required=True, help="section id (s3) or element id")
    s.add_argument("--quote", default=""); s.add_argument("--prefix", default=""); s.add_argument("--suffix", default="")
    s.add_argument("--element", action="store_true", help="anchor to an element/section as a whole (no quote)"); s.add_argument("text")
    s = sub.add_parser("reply"); s.add_argument("id"); s.add_argument("text")
    s = sub.add_parser("edit"); s.add_argument("id"); s.add_argument("text")
    for n in ("delete", "resolve", "reopen"):
        s = sub.add_parser(n); s.add_argument("id")
    a = ap.parse_args()
    api = Api(a.url, token_for(a.role))

    if a.cmd in ("list", "open"):
        q = {"page": a.page, "status": "open" if a.cmd == "open" else a.status}
        if a.cmd == "list":
            q.update({"since": a.since, "author_role": a.author_role})
        out = api.call("GET", "/api/comments", query=q)
        if a.json: print(json.dumps(out, ensure_ascii=False, indent=2))
        else: print_threads(out["comments"])
        return
    if a.cmd == "show":
        out = api.call("GET", f"/api/comments/{a.id}")
        if a.json: print(json.dumps(out, ensure_ascii=False, indent=2))
        else: print_threads([out["comment"]] + out["replies"] if not out["comment"].get("parent_id") else [out["comment"]])
        return
    if a.cmd == "add":
        if not a.element and not a.quote:
            sys.exit("add: give --quote \"exact text from the section\" or use --element")
        body = {"page": a.page, "anchor_id": a.anchor, "body": a.text, "author_name": a.name,
                "anchor_type": "element" if a.element else "text", "quote": a.quote, "prefix": a.prefix, "suffix": a.suffix}
        out = api.call("POST", "/api/comments", body)
    elif a.cmd == "reply":
        parent = api.call("GET", f"/api/comments/{a.id}")["comment"]
        out = api.call("POST", "/api/comments", {"page": parent["page"], "parent_id": a.id, "body": a.text, "author_name": a.name})
    elif a.cmd == "edit":
        out = api.call("PATCH", f"/api/comments/{a.id}", {"body": a.text})
    elif a.cmd == "delete":
        out = api.call("DELETE", f"/api/comments/{a.id}")
    else:
        out = api.call("POST", f"/api/comments/{a.id}/{a.cmd}")
    if a.json: print(json.dumps(out, ensure_ascii=False, indent=2))
    elif "comment" in out: print_comment(out["comment"])
    else: print(f"deleted {out.get('deleted')} comment(s) (id {out.get('id')})")


if __name__ == "__main__":
    main()
