---
title: 用 Wan 重跑 WROP：能跑多快、要花多少钱
slug: wrop-wan-speed
short: Wan 重跑速度
description: 澄清论文里的 Wan 3.0 Prime 与开源 Wan/VACE 的区别，估算 API 与 8×B300 质量安全重跑 300/600 道的时间和费用，并与 H3 对照。
chips: [Wan 3.0 Prime, VACE-14B, API 约 $230, 自跑约 $180, 估算非实测]
order: 36
updated: 2026-10-10
---

日期：2026-10-09（新加坡时间）。本文和 [H3 加速调研](wrop-h3-nvidia-speed.md) 配套。所有“估算”都是推算，不是实测。

## 0. 结论 {#s0}

- **论文里的 Wan 是 Wan 3.0 Prime，不是“Wan Extended”。** 它在表 1 里走 FAL API，类型是“参考视频生成”（reference-to-video），输出 1280×720、30 fps、90 帧。
- **“Extend”这个词来自别处。** 同一张表里有 LTX-2.3 Extend 和 Grok Imagine (video extend)。另外，Wan 3.0 有一个“视频续写”模式（video extension），第三方平台把它挂成 `wan-3.0/video-extend` 接口。论文没有用这个模式。
- **Wan 3.0 Prime 没有公开权重，所以不能在 8×B300 上跑。** 它只能走 API。Wan 能下载的最新权重仍是 Wan 2.2（2025-07）和 2026 年的 Animate-2 等专用模型。我们查了 Hugging Face 的 Wan-AI 组织，确认如此。
- **只想重跑论文里的同一个模型：走 API。** 300 道约 **$230**，600 道（新旧 prompt 各一遍）约 **$460**。不用 GPU。墙钟时间取决于并发数，大约 1–5 小时。旧 prompt 的结果已经在论文的 HF 数据集里，所以只跑新 prompt 时是 300 道、约 $230。
- **想在 8×B300 上自己跑 Wan：只能换成开源的 Wan2.1-VACE-14B（或 Wan2.2-VACE-Fun）。** 质量安全的中间估算（BF16、默认 50 步、8 个单卡副本、720p）：**每段约 58 秒，300 道约 5.6 小时、约 $180；600 道约 11 小时、约 $345。** 换成 480p：每段约 18 秒，300 道约 $60。
- **和 H3 比：自己跑 Wan 比 H3 慢约 1.7 倍、贵约 1.8 倍。** H3 质量安全中间值是每段约 33 秒、300 道约 $100。原因是 Wan 的 VAE 压缩率低：同样 5 秒 720p，Wan 的序列约 7.6 万 token，H3 约 3.8 万 token。
- **NVIDIA 对 Wan 有官方优化，但最快的那条不算质量安全。** MLPerf v6.1 里，NVIDIA DGX B300（8 卡）跑 Wan2.2 文生视频是每段约 16–18 秒。这条用了 FP8，而且只跑 20 步（官方默认 40 步）。它只用 VBench 总分证明质量（≥ 参考的 99%），没有证明物体恒存不变。所以它放在第 4 节。

## 1. 名字对照：哪个是哪个 {#s1}

| 名字 | 是什么 | 有没有权重 | 发布 | 和 WROP 的关系 |
|---|---|---|---|---|
| **Wan 3.0 Prime**（`wan3.0-video-prime`） | Wan 3.0 的“加速版”。阿里说能力和标准版一致，“明显更快”，但没给倍数 | **没有**，只有 API | 新加坡区 2026-08-20 上架 | **论文表 1、表 2 用的就是它**（Elo 1723.6，第 1 名并列） |
| Wan 3.0（`wan3.0-video`） | 标准版，一个模型包含文生、图生、参考生成、编辑、续写 | 没有 | 2026-08-06/07 公测 | 论文没用 |
| “Wan 3.0 video-extend” | Wan 3.0 的续写模式。阿里文档：传 `reference_video` + 带“续写/extend”意图的 prompt 即可触发 | 没有 | 第三方接口 2026-10-04 上架（SandBase） | 论文没用。若改用它，接口类型就从“参考生成”变成“真续写”，不能和表 2 直接比 |
| Wan 2.5 / 2.6 / 2.7 | 商业 API | 没有（2.5 曾说会开源，没兑现） | 2025–2026 | 无 |
| **Wan 2.2**（T2V-A14B、I2V-A14B、TI2V-5B） | 开源 MoE（两个 14B 专家，按步数切换） | **有**，Apache 2.0 | 2025-07-28 | 没有“视频参考续写”权重 |
| **Wan2.1-VACE-14B** | 开源“全能编辑”模型，支持 `firstclip` 视频续写、重绘、参考 | **有**，Apache 2.0 | 2025-05-14 | **论文的 Wan-VACE 14B 就是它**（重绘模式，832×480 / 16 fps / 57 帧，Elo 1506.7，第 6 名） |
| Wan2.2-VACE-Fun-A14B | 阿里 PAI 团队（非 Wan 官方）把 VACE 接到 Wan 2.2 | 有 | 2025-09-10 | 可替代 VACE-14B，未核实质量 |

**论文结果的接口名有点矛盾。** 表 1 写 Wan 3.0 Prime 是“参考视频生成”。但论文 HF 数据集的文件夹叫 `results/wan-3.0-prime-video-edit/`。Wan 3.0 Prime 在聚合平台上有三个相关接口：`reference-to-video`、`video-edit`、`video-extend`。所以论文到底调了哪个接口，没法百分之百确定。重跑前要先定下来。

## 2. 质量安全的速度 {#s2}

### 2.1 质量安全的标准（和 H3 报告一样）

只算这几种：
1. 多副本并行（8 张卡各跑一份模型）。模型不变。
2. 序列并行 / CFG 并行（Ulysses、Attention2D 等）。NVIDIA 测过：并行带来的偏差在“同一张卡重跑两次”的噪声范围内。
3. 算子融合、`torch.compile`、换注意力内核。只有舍入级差别。
4. BF16，官方默认步数（Wan2.2-A14B 40 步，Wan2.1-14B / VACE 50 步），开 CFG。

**一个重要事实：快内核本身就不是逐位相同的。** NVIDIA TensorRT-LLM 测过：同一张卡、同一个种子，用 FA4 重跑一次，LPIPS 就差 0.121；FA4 换成 PyTorch SDPA，差 0.21；开关 `torch.compile`，差 0.24。只有关掉快内核（SDPA + 不编译）才逐位相同。所以“质量安全”只能指“没有改算法”，不能指“像素完全一样”。这一点对 H3 报告同样适用。

### 2.2 公开测速（BF16、默认步数）

| 来源（日期） | 模型 | 设置 | 硬件 | 每段时间 |
|---|---|---|---|---|
| Wan2.2 官方 README（2025-07） | T2V-A14B / I2V-A14B | 720p，81 帧，40 步 | 8×H100 | 155.1 秒 / 159.0 秒 |
| 同上 | 同上 | 480p，81 帧，40 步 | 8×H100 | 51.5 秒 / 52.9 秒 |
| 同上 | 同上 | 720p，81 帧 | 1×H100（带 offload） | 1041.5 秒 / 1055.9 秒 |
| Wan2.1 官方 README（2025-02） | T2V-14B / I2V-14B | 720p，81 帧，50 步 | 8×H100 | 287.9 秒 / 238.8 秒 |
| NVIDIA TensorRT-LLM VisualGen 博客 25 | Wan2.2 T2V-A14B | 720p，80 帧，40 步，BF16，FA4 | **1×B200** | **373.35 秒**（去噪 370.8 秒） |
| 同上 | 同上 | 同上，CFG 并行 | 2×B200 | 183.0 秒 |
| 同上 | 同上 | 同上 | 72×GB200（整机柜） | 9.20 秒 |
| SGLang PR #28304（2026-06-16 合并） | Wan2.2 T2V-A14B | 测试预设（文中未写分辨率） | 4×B200 | 107.6 秒 |
| NVIDIA Sol-Engine（只算无损融合部分） | Wan2.2-A14B | 720p，81 帧，40 步 | 1×GB200 | 449.67 秒 → 约 398 秒（融合 1.13 倍） |

**没有任何人公开 8×B300 的 BF16 测速。** 我们从下面三点推出 1×B300 的单步时间：
- 1×B200 BF16：370.8 ÷ 40 ≈ **9.3 秒/步**（720p、81 帧、含 CFG）。
- 1×B300 FP8（VibeHPC，MLPerf 负载，20 步）：单段 122.5 秒，约 5.8–6.1 秒/步。FP8 比 BF16 快约 1.1–1.3 倍，所以 B300 BF16 约 6.5–7.8 秒/步。
- **中间取 7.5 秒/步**（低 6.5，高 9.3）。

### 2.3 映射到 WROP

WROP 每道题：输入 60 帧（24 fps，2.5 秒），目标 60 帧（2.5 秒）。

**推荐的开源跑法：Wan2.1-VACE-14B 续写（firstclip / 自定义 mask）。**
- 把输入从 24 fps 重采样到 Wan 的 16 fps：40 帧。
- 一次生成 81 帧：前 40 帧给定，后 41 帧由模型生成（约 2.56 秒）。正好覆盖 WROP 的目标长度。只需跑一次。
- 这是真续写（和 PWM-WROP 同一类），不是论文里 Wan-VACE 的重绘模式。
- VACE-14B 比普通 14B 多 8 个 VACE 块（第 0、5、…、35 层），计算多约 20%。序列长度不变。
- 默认 50 步，CFG 5.0，shift 16。

**每段时间估算（8 个单卡副本，BF16，默认步数）**

| 情况 | 跑法 | 每段有效时间 | 算法 |
|---|---|---|---|
| 低 | VACE-14B 续写，720p | 约 48 秒 | (50 × 6.5 × 1.15 + 8) ÷ 8 |
| **中（推荐）** | **VACE-14B 续写，720p** | **约 58 秒** | (50 × 7.5 × 1.2 + 10) ÷ 8 |
| 高 | 官方仓库代码，不编译，慢约 1.2 倍 | 约 86 秒 | (50 × 9.3 × 1.2 × 1.2 + 15) ÷ 8 |
| 中，480p | VACE-14B 续写，832×480 | 约 18 秒 | 480p/720p 实测比约 0.31（Wan2.2 表） |
| 中，论文原样 | Wan-VACE-14B 重绘，832×480 / 57 帧 | 约 11 秒 | 再乘约 0.62（57 帧 vs 81 帧） |

单卡副本可行吗？可以。Wan2.1-VACE-14B 的 DiT 文件约 63 GB（按 FP32 存，转 BF16 约 32 GB）+ T5（约 11 GB）+ VAE，整个仓库约 75 GB。放一张 288 GB 的 B300 绰绰有余。NVIDIA Sol-Engine 也在单张 GB200（192 GB）上跑过 Wan2.2-A14B 两个专家。

**注意 TensorRT-LLM VisualGen 没有写支持 VACE。** 它支持 Wan2.2 T2V/I2V。VACE 用官方 Wan2.1 仓库或 Diffusers 的 `WanVACEPipeline` 跑。所以“高”那一行（不编译）的风险是真实存在的。

## 3. 300 道和 600 道：时间和费用 {#s3}

价格：National Compute .edu 价，8×B300 一台 **$32/小时**。一次最多租 4 小时。每次租机按约 0.4 小时算准备时间（下载约 75 GB 权重到本地 NVMe、加载、预热、冒烟测试）。

### 3.1 自己跑（开源 Wan，8×B300）

| 情况 | 每段 | 300 道：生成 / 总时间 / 租几次 / 费用 | 600 道：生成 / 总时间 / 租几次 / 费用 |
|---|---|---|---|
| 低（720p 续写） | 48 秒 | 4.0 小时 / 4.8 小时 / 2 次 / 约 $155 | 8.0 小时 / 9.2 小时 / 3 次 / 约 $295 |
| **中（720p 续写，推荐）** | **58 秒** | **4.8 小时 / 5.6 小时 / 2 次 / 约 $180** | **9.6 小时 / 10.8 小时 / 3 次 / 约 $345** |
| 高（720p，不编译） | 86 秒 | 7.1 小时 / 7.9 小时 / 2 次 / 约 $255 | 14.3 小时 / 15.9 小时 / 4 次 / 约 $510 |
| 中（480p 续写） | 18 秒 | 1.5 小时 / 1.9 小时 / 1 次 / 约 $60 | 3.0 小时 / 3.4 小时 / 1 次 / 约 $110 |
| 中（论文原样重绘） | 11 秒 | 1.0 小时 / 1.4 小时 / 1 次 / 约 $45 | 1.9 小时 / 2.3 小时 / 1 次 / 约 $75 |
| 第一次搭环境调试 | — | +1–3 小时，+$32–96 | 同左 |

**但是：这测的不是论文里的 Wan 3.0 Prime。** 它适合做“同一个模型、新旧 prompt 对比”。不适合和表 2 的 Wan 3.0 Prime 分数直接比。

### 3.2 走 API（论文同款 Wan 3.0 Prime）

| 项目 | 数字 | 来源 |
|---|---|---|
| fal 价格 | 720p 每秒 $0.14；**输入参考视频的秒数也计费** | fal 接口页 |
| 阿里国际站价格 | 720p 每秒 $0.127199 | 阿里云 Model Studio |
| WROP 每道 | 2.5 秒参考 + 3 秒输出 = 5.5 秒 × $0.14 ≈ **$0.77** | 自算 |
| 300 道 | **约 $230**（阿里直连约 $210） | 自算（2 道 90 帧题按 3.75+4 秒算） |
| 600 道 | **约 $460** | 自算 |
| 单个任务时间 | 没有官方数字。第三方实测（5 秒 720p）：97 秒、108 秒；OpenRouter P50 177 秒 | UlazAI 2026-08-27、wan-3.run、OpenRouter |
| 300 道墙钟时间 | 10 个并发约 1 小时；2 个并发约 5 小时（并发上限未查到） | 自算 |

注意：
- 论文说关掉了服务器端 prompt 改写。fal 的 `enable_prompt_expansion` 默认是开的，必须手动关。fal 说关掉能省 20–60 秒。
- 旧 prompt 的 Wan 3.0 Prime 结果已经在论文的 HF 数据集里（`results/wan-3.0-prime-video-edit/`）。只跑新 prompt：300 道、约 $230。但为了排除“后端版本变了”，最好新旧各跑一遍：600 道、约 $460。
- API 后端随时会更新。今天跑的 Wan 3.0 Prime 不一定和论文当时一样。

## 4. 激进 / 质量未验证的加速（不进推荐报价） {#s4}

| 方案 | 作者 / 日期 | 做了什么 | 公开速度 | 质量证据 | 支持视频续写吗 |
|---|---|---|---|---|---|
| **MLPerf 配置**（TensorRT-LLM VisualGen） | NVIDIA 等，MLPerf v6.1 | FP8 + **20 步**（官方默认 40） | **NVIDIA DGX B300（8 卡）：单段 17.98 秒；吞吐 0.0622 段/秒 ≈ 16.1 秒/段**。VibeHPC 同机型 0.0784 段/秒 ≈ 12.8 秒/段 | VBench 6 项均分 70.20，参考 70.48（参考本身是 BF16 + 20 步）；门槛 ≥ 99% | 只有文生视频（T2V）。映射到 VACE 720p 约 19 秒/段，300 道约 2 小时、约 $65（未验证能跑 VACE） |
| TRT-LLM GEMM 量化 / SAGE / Skip Softmax | NVIDIA 博客 28 | FP8、NVFP4、INT8 注意力、稀疏 softmax | 1×B200：1.07–1.54 倍 | 对 BF16 的 LPIPS：0.11（BF16+保守 Skip Softmax）到 0.49 | 只测 T2V |
| TRT-LLM NVFP4 + 8 卡 | NVIDIA 博客 25 | NVFP4 + CFG2 × Ulysses4 | 8×B200：54.1 秒（720p，40 步） | NVFP4 单卡 LPIPS 0.37 | 只测 T2V |
| Sol-Engine Wan2.2-A14B | NVIDIA SANA 团队 | 融合 + EasyCache（约 14/40 步复用）+ PISA 稀疏注意力（密度 0.10） | 1×GB200：449.67 → 207.01 秒（2.17 倍） | 页面没有质量数字 | 只测 T2V |
| Sol-Engine Wan2.2-TI2V-5B | 同上 | 融合 + EasyCache（约 47% 步复用） | 1×GB200：70.25 → 24.35 秒（2.89 倍）；其中无损融合 1.52 倍 | 无 | 5B 模型，不同模型 |
| SGLang Cache-DiT | SGLang | 跨步缓存 | 文档说最高 7.4 倍 | “质量损失很小”，没给数字 | 只测 T2V |
| LightX2V Wan2.2 蒸馏 LoRA | ModelTC | 4 步 + 去 CFG | 去噪计算少约 20 倍 | 未见对原版的数字 | 社区常和 VACE 混用，未验证 |
| TurboDiffusion | 清华，arXiv 2512.16093（2025-12） | rCM 3–4 步蒸馏 + SLA 稀疏注意力 + W8A8 | Wan2.2-I2V-A14B 720p：1×RTX 5090 上 4549 → 38 秒（120 倍，不含编码/解码） | 论文没有定量质量数字 | 只有 T2V / I2V |
| AnyFlow | NVIDIA，arXiv 2605.13724（2026-05） | 任意步数流映射蒸馏（Wan2.1 14B） | 4 步 | **证据最好的一个**：VBench T2V 84.04（4 步）vs 84.10（32 步）；I2V 87.87（4 步）vs 原版 Wan2.1-I2V 87.71（50×2） | 只有 T2V / I2V，没有 VACE |
| 降到 480p / 少帧 | — | 改输入 | 约 3 倍 | 会改变模型行为 | 见第 3.1 节 480p 行，算“换题”不算加速 |
| **Wan 3.0 Prime 本身** | 阿里 | “加速版”，方法未公开 | 第三方：比标准版快约 1.9–3.1 倍 | 只有“能力一致”这句话 | 论文用的就是它，所以对重跑不是额外损失 |

**激进方案的大概成本（只供参考）：** 用 MLPerf 那套 FP8 + 20 步，如果能接上 VACE，300 道约 2 小时、约 $65。用 4 步蒸馏，300 道不到 1 小时（含准备）、约 $30。但这样测的已经不是原版 Wan。

## 5. 和 H3 并排比较 {#s5}

| 项目 | MiniMax H3（质量安全中间值） | Wan（开源 VACE-14B 自跑，质量安全中间值） | Wan 3.0 Prime（API，论文同款） |
|---|---|---|---|
| 和论文同一个模型吗 | 是（H3 开源权重；论文走 FAL，后端设置未知） | **否**（论文的 Wan 3.0 Prime 无权重） | **是**（但 API 后端可能已更新） |
| 接口类型 | 参考视频生成（Ref2VA） | 真续写（firstclip） | 参考视频生成（或 video-edit，待确认） |
| 输出 | 1344×768，124 帧 | 1280×720，16 fps，41 帧新内容 | 1280×720，30 fps，90 帧 |
| 每段有效时间（8×B300） | 约 33 秒 | 约 58 秒（480p 约 18 秒） | 不用 GPU；单任务约 100–180 秒 |
| 300 道 | 约 3.2 小时、约 $100 | 约 5.6 小时、约 $180 | 约 1–5 小时、约 $230 |
| 600 道（新旧各一遍） | 约 6.5 小时、约 $200 | 约 10.8 小时、约 $345 | 约 $460 |
| 激进最快 | Sol-H3 约 1.65 秒/段（T2VA，无质量数字） | MLPerf FP8+20 步约 16 秒/段（T2V，VBench ≥ 99%） | — |
| 许可证 | 不覆盖美国、欧盟、英国、韩国 | Apache 2.0，无地区限制 | 按 API 条款 |
| 最大未知 | 视频参考的真实代价（1.3–3.5 倍） | B300 单步时间、VACE 代码效率 | 账号并发上限、论文用的是哪个接口 |

**为什么 Wan 自跑更慢？**
1. Wan 的 VAE 压缩是 8×8×4，再加 2×2 patch：5 秒 720p 约 75,600 token。H3 同样 5 秒约 38,247 token。注意力的计算随 token 数平方增长。
2. VACE 多 8 个块，多约 20% 计算。
3. 默认 50 步加 CFG，每步跑两遍模型。

**一句话建议：**
- 想要“论文同款 Wan”：走 API，600 道约 $460，不用租机。
- 想要“自己可控、可重复”的开源对照：VACE-14B 720p 续写，600 道约 $345。先在 480p 跑 5 道冒烟测试（约 $10）确认流程。
- H3 仍是 8×B300 上最便宜的质量安全方案。

## 6. 还没确定的事 {#s6}

1. **论文调的是 Wan 3.0 Prime 的哪个接口。** 表 1 说参考生成，文件夹名说 video-edit。
2. **B300 的 BF16 单步时间。** 没人公开。我们从 B200 BF16 和 B300 FP8 推算，范围 6.5–9.3 秒/步。
3. **VACE 续写的代码效率。** TensorRT-LLM 不支持 VACE。官方仓库没有 FA4，Blackwell 上可能慢 1.2–1.5 倍。
4. **API 并发上限。** fal 和阿里都没查到明确数字。墙钟时间差 5 倍以上。
5. **16 fps 重采样。** Wan 开源模型是 16 fps，WROP 是 24 fps。输入从 60 帧降到 40 帧，会丢一点运动信息。

## 7. 来源 {#s7}

- WROP 论文第 4.2–4.3 节、表 1、表 2：本地 `gen-splits/paper.txt`；结果文件夹名：`gen-splits/object-permanence-benchmark.api.json`
- fal Wan 3.0 Prime 参考生成接口（价格、参数、参考视频计费）：<https://fal.ai/models/alibaba/wan-3.0-prime/reference-to-video/llms.txt>
- 阿里云 wan3.0-video-prime 型号页（国际站价格）：<https://www.alibabacloud.com/help/en/model-studio/wan3-0-video-prime>
- 阿里云 Wan3.0 使用指南（续写/编辑任务的触发方式）：<https://docs.modelstudio.console.alibabacloud.com/en/model-studio/wan3-video-generation-guide>
- 阿里云社区《Wan3.0 vs. Wan3.0-Prime》（2026-10-07，“没有公开速度数字”）：<https://www.alibabacloud.com/blog/wan3-0-vs--wan3-0-prime-speed-price-and-which-one-your-workflow-needs_603618>
- Wan 3.0 发布（2026-08-13 社区文）：<https://www.alibabacloud.com/blog/wan3-0-30-second-ai-video-generation-from-any-input_603452>
- 第三方 Prime 计时：<https://ulazai.com/wan-3-0-video-prime/>、<https://wan-3.run/wan-3-0-prime>、<https://openrouter.ai/alibaba/wan-3.0-prime>
- Wan 3.0 / Prime video-extend 第三方接口：<https://www.sandbase.ai/model/alibaba/wan/3.0/prime/video-extend>、<https://wavespeed.ai/docs/docs-api/alibaba/alibaba-wan-3.0-video-extend>
- Hugging Face Wan-AI 组织模型列表（API 查询，2026-10-09）：<https://huggingface.co/Wan-AI>
- Wan2.2 官方 README 与测速表：<https://github.com/Wan-Video/Wan2.2>
- Wan2.1 官方 README 与测速表、`generate.py` 默认步数：<https://github.com/Wan-Video/Wan2.1>
- VACE 用户指南（firstclip 续写）：<https://github.com/ali-vilab/VACE/blob/main/UserGuide.md>；VACE-14B 配置：<https://huggingface.co/Wan-AI/Wan2.1-VACE-14B>
- Wan2.2-VACE-Fun-A14B：<https://huggingface.co/alibaba-pai/Wan2.2-VACE-Fun-A14B>
- TensorRT-LLM 博客 25（NVL72 扩展、1×B200 基线、并行质量、内核噪声）：<https://nvidia.github.io/TensorRT-LLM/latest/blogs/tech_blog/blog25_Scaling_Video_Generation_Across_NVL72_Rack_with_TensorRT-LLM.html>
- TensorRT-LLM 博客 28（量化 / SAGE / Skip Softmax 的速度与 LPIPS）：<https://github.com/NVIDIA/TensorRT-LLM/blob/main/docs/source/blogs/tech_blog/blog28_Accelerating_Video_Generation_with_GEMM_Quantization_Attention_Quantization_and_Skip_Softmax_Attention_in_TensorRT-LLM.md>
- MLCommons 文生视频基准说明（2026-03-10）：<https://mlcommons.org/2026/03/texttovideo-inference/>
- MLPerf Inference v6.1 结果汇总：<https://raw.githubusercontent.com/mlcommons/inference_results_v6.1/main/summary.csv>
- NVIDIA MLPerf v6.0 博客（2026-04-01）：<https://developer.nvidia.com/blog/nvidia-platform-delivers-lowest-token-cost-enabled-by-extreme-co-design/>
- VibeHPC B300 Wan2.2 优化：<https://vibehpc.com/LLMInference/wan-2-2-optimization/>
- NVIDIA Sol-Engine Wan 页面：<https://nvlabs.github.io/Sana/Sol-Engine/docs/pipelines/wan14b/>、<https://nvlabs.github.io/Sana/Sol-Engine/docs/pipelines/wan5b/>
- SGLang Wan2.2 cookbook：<https://docs.sglang.io/cookbook/diffusion/Wan/Wan2.2>；PR #28304：<https://github.com/sgl-project/sglang/pull/28304>
- TurboDiffusion：<https://arxiv.org/abs/2512.16093>；AnyFlow：<https://arxiv.org/abs/2605.13724>
- H3 对照数字：[H3 加速调研](wrop-h3-nvidia-speed.md)
