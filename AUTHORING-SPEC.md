# AUTHORING-SPEC — thoughts.ycjian.com

Cheat sheet for agents. 中文为主，关键词附英文。Keep it short; the build enforces the rules.

## 1. 一页 = 一个文件 (one page = one file)

`content/<slug>.md` → `https://thoughts.ycjian.com/<slug>`. 首页 `/` 自动列出所有页面 (index is auto-generated).

```yaml
---
title: WROP 评测指标：是什么、怎么算、哪里弱   # required
slug: wrop-metrics-zh                          # required; a-z 0-9 -; = URL and comment page key. NEVER change after publish.
short: 评测指标                                # nav label (default: title)
description: 一句话摘要。                       # <meta description>
chips: [7 节, G26 复算例子]                     # hero tags
order: 20                                      # nav/index order (small first)
updated: 2026-10-08
draft: false                                   # true = not built
---
```

Unknown keys fail the build. `# H1` is not allowed (title comes from front matter).
Text before the first `##` = lead paragraph(s) in the hero.

## 2. 正文 (body): CommonMark + tables + `:::` blocks (Pandoc fenced-div subset)

- Section: `## 3. 标题 {#s3}` — **every `##` needs `{#id}`**. `3.` becomes the badge. Each `##` is one card and one comment section.
- `### 小标题 {#opt-id}` (id optional). Tables `| a | b |`, `---:` = right-aligned numbers. Blockquote `>`. Lists `1.` / `-`. `**bold**`, `` `code` ``.
- Links: `https://…` opens in a new tab; `other-slug.md` links to that page; other local `.md` → shown as plain name (not published).
- Citation: `[@key]` or `[@a; @b]` → numbered; keys live in `content/refs.yaml` (`key: text`). References card is added automatically.
- Inline side note: `[短补充]{.aside}`.
- Files (images, video, csv/json): put in `content/assets/`, refer as `/name.ext`. Everything is bundled into the Worker (limit 64 MiB uncompressed; build stops at 40 MB) — keep videos short and small.

| Block | Syntax | id |
|---|---|---|
| figure | `::: {.figure #fig-x src=/x.png alt="可选"}` caption `:::` | required |
| video | `::: {.video #vid-x src=/x.mp4 t=12 poster=/x.jpg}` caption `:::` | required |
| viz | `::: {.viz #viz-x kind=bar src=/data/x.csv x=col y=col}` caption `:::` → `<x-viz>` (kinds: `bar`, `line`; add more in `public/app.js` via `thoughtsViz.kinds`) | required |
| callout | `::: note` / `::: tip` / `::: warning` … `:::`; title: `::: {.warning title="小样本"}` | auto |
| side note | `::: aside` … `:::` | auto |
| compare / columns | `::: {.compare #cmp-x}` then `### 左` … `### 右` … `:::` (`.columns` = 2–4 plain columns) | required |
| tabs | `::: {.tabs #tab-x}` then `### 标签 A` … `### 标签 B` … `:::` | required |
| details | `::: {.details summary="展开"}` … `:::` | auto |

Nesting: outer block uses more colons (`::::` outside, `:::` inside). With attributes always write `::: {.name #id k=v}` (Pandoc does not accept `::: name {#id}`).
Raw HTML is allowed for small things; `<script>`, `<style>`, `<iframe>`, `on*=` and `javascript:` fail the build.

**Comment anchors — do not break them.** Comments attach to: `slug` (page), `##` ids (`s1`…), block ids (`fig-x`…), tables `sN-table-K`, blockquotes `sN-note-K` (counted per section), plus the quoted text. Never rename a published slug or id. Adding a table/blockquote before an existing one in the same section shifts K — append instead, or accept that text-quote re-anchoring takes over.

## 3. Build fails on / 构建会失败

missing `##` id · duplicate id · unknown block name · block without required id · unknown `[@key]` · stray/unclosed `:::` · missing asset file · bad front matter · forbidden HTML. Nothing is written when it fails.

## 4. 发布 (publish)

```bash
cd /workspace/thoughts
python3 tools/build.py            # self-test + build; must print "wrote …"
git add -A && git commit -m "content: …" && git push origin main
```

Workers Builds deploys on every push to `main` (push trigger works again since 2026-10-08 20:00 SGT). Check that a build started (`GET /accounts/{id}/builds/workers/d42aa8aeff1b40bd8880f336b28b58ef/builds`, `trigger.type = push_event`). **Fallback only** if no build starts within ~2 min — start one manually with the FULL 40-char hash (a short hash fails at clone):

```
POST /accounts/78ce0b34c6db20e5e523f110c50e4a1d/builds/triggers/ff3de99f-16bf-4dda-a022-c80b4a4c7da6/builds
{"branch": "main", "commit_hash": "<git rev-parse HEAD>"}
```

Then check: `GET /accounts/{id}/builds/builds/{build_uuid}` until `status=stopped`, `build_outcome=success`; logs at `…/builds/{build_uuid}/logs`.
Verify: `curl -s https://thoughts.ycjian.com/<slug> | grep '<title>'`.

Never commit secrets (`/home/box/.config/thoughts/secrets.env`).

## 5. 例子 (example)

`tools/examples/components.md` uses every block (built by the self-test only, not published).

## 6. 评论：agent 与 Max 平级 (comments: agents and Max are peers)

角色 roles: **owner** = Max（浏览器，徽章 `Max`）· **agent** = 你（API/CLI，徽章 `agent` + 名字）· **anon** = 匿名访客（只能发，需要 Turnstile，徽章 `匿名`）。
owner 和 agent 都能发、回复、编辑、删除、解决/重开**任何**评论。Owner and agent can create, reply, edit, delete, resolve/reopen any comment.

CLI: `tools/comments.py`（只用标准库 stdlib only）。令牌 token: `$THOUGHTS_AGENT_TOKEN`，否则读 `/home/box/.config/thoughts/secrets.env` 的 `AGENT_TOKEN`。**不要打印、提交或贴出令牌 never print/commit/paste the token.**

```bash
C="python3 tools/comments.py --name <your-agent-name>"
$C open                                   # 所有未解决的线程 all unresolved threads
$C open --page wrop-metrics-zh            # 一页 one page
$C list --status all --since 2d --author-role owner   # since: 30m / 2h / 3d / 2026-10-08 / ms epoch
$C show <id>                              # 线程 + 回复 thread + replies
$C add --page wrop-metrics-zh --anchor s3 --quote "页面上原样的一句" "问题…"   # 贴在文字上 text anchor
$C add --page wrop-metrics-zh --anchor s5-fig-1 --element "这张图…"            # 贴在元素上 element anchor
$C reply <id> "回复…"
$C edit <id> "改后的文字"
$C resolve <id>    /  $C reopen <id>
$C delete <id>                            # 连同回复一起删 deletes replies too
$C --json open                            # 机器可读 machine-readable
```

`--quote` 必须是页面上**原样**出现的文字（在 `--anchor` 那一节里），否则页面上贴不上（仍会出现在评论列表里）。`--anchor` = section id (`s3`, `intro`) or a `data-anchor-id` (`s5-fig-1`, `s2-table-1`)。

**工作流 workflow**

1. 开工前 before editing: `$C open` — 看 Max 的未解决评论。Read open threads first.
2. Max 评论 → 你改 `content/*.md` → build → push → 确认上线 → `$C delete <id>`（已处理完、无需留档）或 `$C reply <id> "已改：…"` + `$C resolve <id>`。改不了 can't fix: `$C reply <id> "没改，因为…"`，**不要** resolve，留给 Max。
3. 你要问 Max: `$C add … "问题"`（贴在相关文字上）。之后 `$C show <id>` 看回复；按回复改完 → push → `$C delete <id>`。
4. 回复会自动重开已解决的线程。A reply reopens a resolved thread.
5. 不要删匿名访客的评论，除非 Max 要求。Don't delete anonymous comments unless Max asks.
6. 限速 rate limit: 每个角色 10 分钟最多 60 条新评论。60 new comments / 10 min per role.

API (all JSON; token only in `Authorization: Bearer …`; no CORS — same-origin pages or server-side callers only):

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/me` | `{role, name}`；无效令牌 401 |
| GET | `/api/comments?page=&status=open\|resolved\|all&since=&author_role=&limit=` | 匿名必须带 `page` |
| GET | `/api/comments/:id` | 线程 + 回复 |
| POST | `/api/comments` | `{page, body, anchor_type:"text", anchor_id, quote, prefix, suffix}` 或 `{page, body, parent_id}`；agent 可带 `author_name` |
| PATCH | `/api/comments/:id` | `{body}` 和/或 `{resolved: true\|false}`（只对线程根） |
| DELETE | `/api/comments/:id` | 连同回复 |
| POST | `/api/comments/:id/resolve` · `/reopen` | |

