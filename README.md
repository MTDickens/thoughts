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
- 匿名。昵称可不填。
- 防刷：Cloudflare Turnstile（免费）+ 每 IP 限速（10 分钟 5 条，1 天 40 条）+ 全站每小时 200 条。
- 存储：D1 `thoughts-comments`，表 `comments`。每条评论带 `page`（页面 slug），各页评论互不混。
- 锚点类型 `anchor_type`：`text`（文字）、`element`（图片、表格、可视化组件，用 `data-anchor-id`）、`media_time`（视频时间点，用 `media_t` 秒）。

### 删除评论

在 Cloudflare 控制台打开 D1 → `thoughts-comments` → Console，执行：

```sql
-- 先找
SELECT id, nickname, body, quote FROM comments ORDER BY created_at DESC LIMIT 20;
-- 隐藏（可恢复）
UPDATE comments SET status = 'hidden' WHERE id = '<id>';
-- 彻底删除（回复也一起删）
DELETE FROM comments WHERE id = '<id>' OR parent_id = '<id>';
```

也可以用命令行：`npx wrangler d1 execute thoughts-comments --remote --command "..."`。

## 本地开发

```bash
npm install
python3 tools/build.py
npx wrangler d1 execute thoughts-comments --local --file=schema.sql
npx wrangler dev
```

## 部署

### 自动部署（Cloudflare Workers Builds）

- 推送到 `main`，Cloudflare 自动构建并部署 Worker `thoughts`。
- 构建命令：`python3 tools/build.py`。部署命令：`npx wrangler deploy`。根目录：`/`。
- 构建日志：Cloudflare 控制台 → Workers & Pages → `thoughts` → Deployments。
- 部署不会删密钥。自定义域和 D1 绑定来自 `wrangler.toml`。
- wrangler 固定为 4.30.0（`package.json`）。它在 Node 18–24 上都能跑。

改内容的流程：改 `content/` 或 `public/` → 跑 `python3 tools/build.py` → 提交 → `git push`。

推送后 2 分钟内没有构建：用 API 手动起构建（见 AUTHORING-SPEC.md 第 4 节）。

### 手动部署

```bash
python3 tools/build.py
npx wrangler deploy
```

密钥只在 Cloudflare 上，不进仓库：`TURNSTILE_SECRET`、`ADMIN_TOKEN`、`IP_SALT`。
`wrangler deploy` 会保留已有密钥。
