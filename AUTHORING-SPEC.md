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
- Files (images, video, csv/json): put in `content/assets/`, refer as `/name.ext`. Keep video small (whole site ≤ ~2.5 MB; Workers Free script limit 3 MB).

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

Workers Builds should deploy on push. **If no build starts within ~2 min** (push trigger currently unreliable), start one manually — FULL 40-char hash:

```
POST /accounts/78ce0b34c6db20e5e523f110c50e4a1d/builds/triggers/ff3de99f-16bf-4dda-a022-c80b4a4c7da6/builds
{"branch": "main", "commit_hash": "<git rev-parse HEAD>"}
```

Then check: `GET /accounts/{id}/builds/builds/{build_uuid}` until `status=stopped`, `build_outcome=success`; logs at `…/builds/{build_uuid}/logs`.
Verify: `curl -s https://thoughts.ycjian.com/<slug> | grep '<title>'`.

Never commit secrets (`/home/box/.config/thoughts/secrets.env`).

## 5. 例子 (example)

`tools/examples/components.md` uses every block (built by the self-test only, not published).
