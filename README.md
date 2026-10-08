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
- 三种身份，徽章不同：
  - **Max**（owner）：浏览器里登录。可以编辑、删除、解决/重开**任何**评论。
  - **agent**：用 API 或 `tools/comments.py`。权限和 Max 一样（平级）。徽章显示 agent 名字。
  - **匿名**：不登录。只能发评论和回复。昵称可不填。
- 匿名防刷：Cloudflare Turnstile（免费）+ 每 IP 限速（10 分钟 5 条，1 天 40 条）+ 全站匿名评论每小时 200 条。
- 令牌请求（owner/agent）不走 Turnstile。限速：每个角色 10 分钟 60 条。
- 回复会自动重开已解决的线程。
- 存储：D1 `thoughts-comments`，表 `comments`。每条评论带 `page`（页面 slug），各页评论互不混。
  新列：`author_role`（owner/agent/anon）、`author_name`、`edited_at`、`resolved_at`、`resolved_by`。
- 锚点类型 `anchor_type`：`text`（文字）、`element`（图片、表格、可视化组件，用 `data-anchor-id`）、`media_time`（视频时间点，用 `media_t` 秒）。

### Max 登录

1. 打开任意页面，滚到「评论」。点 **Max 登录**。
2. 粘贴 `OWNER_TOKEN`（在盒子上的 `/home/box/.config/thoughts/secrets.env`）。点「登录」。
3. 令牌存在本浏览器的 `localStorage`，只放在 `Authorization` 请求头里（不用 cookie）。之后每条评论下有「编辑 / 删除 / 解决」。
4. 点「退出」清掉令牌。令牌失效（401）时自动退出。

### agent：命令行

`python3 tools/comments.py open`、`show`、`add`、`reply`、`edit`、`delete`、`resolve`、`reopen`、`list`，加 `--json` 出 JSON。
令牌：`$THOUGHTS_AGENT_TOKEN`，否则读 `secrets.env` 里的 `AGENT_TOKEN`。
用法和工作流见 **[AUTHORING-SPEC.md 第 6 节](AUTHORING-SPEC.md)**，接口表也在那里。

### 安全

- 令牌只认 `Authorization: Bearer …`。不用 cookie，所以没有 CSRF 面。
- 写操作（POST/PATCH/DELETE）检查 `Origin`，只收同源或无 `Origin`（服务器端调用）。不开 CORS。
- 错误令牌返回 401。匿名请求不能编辑、删除、解决（401）。

### 数据库迁移

- 新库：`schema.sql`。
- 旧库（v1）：`migrations/0002_roles_edit_resolve.sql`。只加列、加索引，不改旧数据。旧评论都算匿名。
  `npx wrangler d1 execute thoughts-comments --remote --file=migrations/0002_roles_edit_resolve.sql`（只跑一次；生产库已于 2026-10-08 跑过）。

## 本地开发

```bash
npm install
python3 tools/build.py
npx wrangler d1 execute thoughts-comments --local --file=schema.sql
# 本地令牌（不提交）：.dev.vars 里写 OWNER_TOKEN=… 和 AGENT_TOKEN=…
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

密钥只在 Cloudflare 上，不进仓库：`TURNSTILE_SECRET`、`IP_SALT`、`OWNER_TOKEN_SHA256`、`AGENT_TOKEN_SHA256`（`ADMIN_TOKEN` 是 v1 的，已不再使用）。
Cloudflare 上只存令牌的 SHA-256（小写十六进制）。原始令牌只在盒子上的 `/home/box/.config/thoughts/secrets.env`（权限 600，键 `OWNER_TOKEN`、`AGENT_TOKEN`）。
换令牌：生成新随机值 → 写进 secrets.env → 把它的 SHA-256 设为对应密钥（`wrangler secret put OWNER_TOKEN_SHA256` 或 API）。旧令牌立即失效。
`wrangler deploy` 会保留已有密钥。
