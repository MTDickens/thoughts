# thoughts

`thoughts.ycjian.com` 的源码。现在放两篇：

| 网址 | 原文 |
|---|---|
| `/` | 首页，列出全部页面 |
| `/wrop-improvement-directions` | `content/wrop-improvement-directions.md` |
| `/wrop-metrics-zh` | `content/wrop-metrics-zh.md`（图片 `content/assets/wrop-metrics-g26-sheet.png`） |

加新页面：在 `content/` 放一个带 YAML 头的 `.md`。写法见 **[AUTHORING-SPEC.md](AUTHORING-SPEC.md)**（给 agent 的速查表）。首页自动生成。

## 结构

| 路径 | 作用 |
|---|---|
| `content/*.md` | 原文（YAML 头 + Markdown + `:::` 指令）。一文件一页。 |
| `content/assets/` | 页面引用的图片、视频、数据。原样发布。 |
| `content/refs.yaml` | 共享文献表，`[@key]` 引用。 |
| `AUTHORING-SPEC.md` | 写法速查（给 agent）。 |
| `tools/vendor/` | 构建依赖（markdown-it-py、mdit-py-plugins、mdurl、PyYAML，均 MIT），构建不联网。 |
| `tools/examples/` | 全部组件的样例。只给 build 自检用，不发布。 |
| `tools/template.html` | 文章页骨架。 |
| `tools/index-template.html` | 首页骨架。 |
| `tools/build.py` | 自检 → 校验 → 生成 `public/<slug>.html` 和首页 → 打包成 `src/site.gen.js`。校验不过就失败，不写文件。 |
| `public/` | 页面、样式、脚本、图标。 |
| `src/worker.js` | Cloudflare Worker。出页面，也出评论接口。 |
| `src/site.gen.js` | 生成文件。不要手改。 |
| `schema.sql` | D1 表结构。 |
| `wrangler.toml` | 部署配置。 |

## 评论

- 读者选中文字。点「评论」。评论贴在那段文字上。
- **完全开放**（Max 2026-10-08 的选择，接受被乱改的风险）：任何人不登录就能发、回复、编辑、删除（连回复）、解决/重开**任何**评论。没有人机验证，没有登录。
- 昵称可不填（显示「匿名」），存在本浏览器 `localStorage`（`thoughts.nick`）。Max 想署名就填 `Max`。编辑和解决会记录并显示操作人的昵称。
- agent 用 `tools/comments.py` 带令牌发评论：徽章 `agent` + 名字，限速更宽。见 **[AUTHORING-SPEC.md 第 6 节](AUTHORING-SPEC.md)**（命令、工作流、接口表）。
- 防滥用：
  - 写操作只收 JSON，且 `Origin` 必须是本站或为空（挡住跨站表单/脚本）。不开 CORS。
  - 限速（表 `write_log`）：每 IP 10 分钟 5 条新评论、1 天 40 条、10 分钟 30 次写操作；全站访客每小时 200 条新评论、300 次写操作；agent 令牌 10 分钟 120 次写操作。超了返回 429。
  - 长度：评论 2000 字，昵称 40 字，引文 1000 字。
  - IP 只存加盐哈希（`IP_SALT`）。`write_log` 保留 30 天，可查谁（哪个 IP 哈希）改过/删过什么。
- 存储：D1 `thoughts-comments`。表 `comments`（每条带 `page`，各页互不混）和 `write_log`。
  - `author_role`：`visitor`（访客）或 `agent`。旧数据里的 `anon` 当访客，`owner` 显示为 Max。
- 锚点类型 `anchor_type`：`text`（文字）、`element`（图片、表格、可视化组件，用 `data-anchor-id`）、`media_time`（视频时间点，用 `media_t` 秒）。

### 被乱改了怎么办

- 查日志（Cloudflare 控制台 → D1 → `thoughts-comments` → Console）：
  `SELECT datetime(at/1000,'unixepoch') t, ip_hash, role, action, comment_id FROM write_log ORDER BY at DESC LIMIT 50;`
- 删掉的评论无法恢复（没有备份）。需要的话用 D1 Time Travel 回到某个时间点（`npx wrangler d1 time-travel restore thoughts-comments --timestamp=…`，免费版保留 7 天；整库回滚，之后的新评论也会丢。见 https://developers.cloudflare.com/d1/reference/time-travel/）。
- 想收紧：改 `src/worker.js` 里的 `RATE`，或恢复 Turnstile（见 git 历史 `7247853`）。

### 数据库迁移

- 新库：`schema.sql`。
- 旧库按顺序：`migrations/0002_roles_edit_resolve.sql`、`migrations/0003_open_comments.sql`。都只加表/列/索引。生产库已于 2026-10-08 跑过。

## 本地开发

```bash
npm install
python3 tools/build.py
npx wrangler d1 execute thoughts-comments --local --file=schema.sql
# 本地 agent 令牌（不提交）：.dev.vars 里写 AGENT_TOKEN=…（或 AGENT_TOKEN_SHA256=…）
npx wrangler dev
THOUGHTS_URL=http://127.0.0.1:8787 THOUGHTS_AGENT_TOKEN=… python3 tools/comments.py open
```

## 部署

### 自动部署（Cloudflare Workers Builds）

- 推送到 `main`，Cloudflare 自动构建并部署 Worker `thoughts`。
- 构建命令：`python3 tools/build.py`。部署命令：`npx wrangler deploy`。根目录：`/`。
- 构建日志：Cloudflare 控制台 → Workers & Pages → `thoughts` → Deployments。
- 部署不会删密钥。自定义域和 D1 绑定来自 `wrangler.toml`。
- wrangler 固定为 4.30.0（`package.json`）。它在 Node 18–24 上都能跑。

改内容的流程：改 `content/` 或 `public/` → 跑 `python3 tools/build.py` → 提交 → `git push`。

推送触发构建已恢复（2026-10-08 20:00 重新授权 GitHub 后）。只有推送后 2 分钟内没有构建，才用 API 手动起构建（见 AUTHORING-SPEC.md 第 4 节）。

### 手动部署

```bash
python3 tools/build.py
npx wrangler deploy
```

密钥只在 Cloudflare 上，不进仓库：`IP_SALT`、`AGENT_TOKEN_SHA256`（agent 令牌的 SHA-256，小写十六进制）。
原始 agent 令牌只在盒子上的 `/home/box/.config/thoughts/secrets.env`（权限 600，键 `AGENT_TOKEN`）。
换令牌：生成新随机值 → 写进 secrets.env → 把它的 SHA-256 设为 `AGENT_TOKEN_SHA256`。旧令牌立即失效。
`wrangler deploy` 会保留已有密钥。
