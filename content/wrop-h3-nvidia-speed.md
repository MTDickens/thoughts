---
title: MiniMax H3 在 NVIDIA 上能跑多快：对 WROP 重跑的影响
slug: wrop-h3-nvidia-speed
short: H3 加速
description: 查 NVIDIA Sol-H3 等 MiniMax H3 加速方案，分清质量安全和质量未验证两类，并按质量安全的最快跑法重算 300 道 WROP 考题的时间和费用。
chips: [Sol-H3, 8×B300, 质量安全中间值约 $100, 估算非实测]
order: 35
updated: 2026-10-09
---

日期：2026-10-09（新加坡时间）。本文补充[重跑成本估算](wrop-rerun-cost.md)。所有“估算”都是推算，不是实测。

## 0. 结论 {#s0}

- **你记得的 NVIDIA 方案是 Sol-H3。** 作者是 NVIDIA Research（Efficient AI 团队和新加坡实验室）。页面：<https://nvlabs.github.io/Sana/Sol-Engine/Sol-H3/>。它在一台 8×B300 上 **1.653 秒**生成 5 秒视频，比 50 步原版（18.25 秒）快 11 倍。据 RuntimeWire 报道，MiniMax 官方在 2026-09-07 转发过（未直接核实原帖）。
- **不改输出的加速，基本已经用完了。** SGLang 的无损路径（BF16，只做算子融合）在 8×B300 上已经是约 19 秒/段（T2VA）。NVIDIA 自己的无损融合也只到 18.25 秒。没有一种公开方法能在“输出不变”的前提下再快 2 倍以上。
- **带视频参考会明显变慢。** 在 8×H200 上，带视频参考的 Ref2VA 比 T2VA 慢 3.4–3.6 倍。WROP 的参考视频只有 2.5 秒，按序列长度推算大约慢 2 倍。

::: {.tip title="推荐跑法：8 个单卡副本，无损 BF16"}
每张 B300 各跑一份完整的 H3 Ref2VA 模型（SGLang `quality: "lossless"`，BF16，50 步，稠密注意力），一共 8 份同时跑。这样不改模型输出，吞吐也最高。

**新的中间估算（只用质量安全的方案）：每段约 33 秒，300 道约 3.2 小时，约 $100（约 ¥730）。** 以前的中间值是约 $170。保守估算约 7 小时、约 $220。
:::

::: {.warning title="Sol-H3：质量未验证，不进推荐报价"}
**Sol-H3 不能用于 WROP 评测。** 它的快主要来自三件事：4 步蒸馏（FastH3）、稀疏注意力、INT8/FP8 传输。三件事都会改变模型输出。它的公开测速也只测了文生视频（T2VA），没有测带参考视频的模式。所以它放在第 4 节“质量未验证”。
:::

::: {.note title="更正：之前的 27–29 秒是文生视频，不是参考视频"}
**之前引用的 27–29 秒不是带参考视频的数字。** SGLang 的 8×B300 测试脚本对 12 个配置都发送 `"task":"t2va","conditions":[]`，也就是没有参考视频。Ref2VA 那两行只是“用 Ref2VA 权重跑文生视频”。
:::

## 1. 质量安全的标准 {#s1}

只有满足下面任一条，才算“质量安全”：

1. 输出和参考实现逐位相同（bit-exact）。
2. 只有舍入级别的差别（例如算子融合、换注意力内核、改并行方式）。
3. 有公开的对比数据，证明和 BF16 原版几乎一样。

目前没有一条近似加速满足第 3 条。原因是：公开的对比数据都显示 SSIM 只有 0.93–0.97，或 LPIPS 在 0.1–0.3。对 WROP 这种看物体位置和出现时间的评测，这个差别太大。

## 2. 所有加速路径一览 {#s2}

| 路径 | 谁做的 | 类型 | 公开测速 | 质量证据 | 分类 |
|---|---|---|---|---|---|
| SGLang `quality: "lossless"`（默认） | SGLang / MiniMax 官方文档 | 只融合算子 | 8×B300 T2VA 19.04 秒 | 去噪路径和 exact 相同；只有 VAE 解码有舍入差别 | **质量安全** |
| SGLang `quality: "exact"` | SGLang | 参考实现 | 与 lossless 接近（4×H200 上 75.10 秒） | 逐位相同 | **质量安全** |
| Sol-Engine 无损部分（算子融合 + 图捕获） | NVIDIA SANA 团队 | 只融合算子 | 8×GB200：27.2 → 19.5 秒（比 Diffusers 快 1.39 倍，和 SGLang 的 19.3 秒差不多） | 写明“lossless” | **质量安全**（但比 SGLang 没快） |
| Sol-H3 的 “Base H3 Dense 50 步” | NVIDIA | 稠密注意力 + 融合 | 8×B300 T2VA 18.25 秒；4×B300 35.3 秒；1×B300 129.9 秒 | 稠密、50 步，未说明是否逐位相同 | **质量安全**（推断） |
| 多副本并行（8 个单卡副本） | 部署方式 | 不改模型 | 1×B300 129.9 秒 ÷ 8 ≈ 16.2 秒/段，比 8 卡一起跑多出约 12% 吞吐 | 同一模型，只有舍入差别 | **质量安全** |
| 跨节点 Ring 并行 | SGLang | 并行方式 | 8×H200 → 2×8×H200：V2V 去噪快 47% | 结果确定，但不和单节点逐位相同 | 质量安全；但只有一台机器，用不上 |
| NVIDIA TensorRT-Model-Connect（H3 原生 TensorRT） | NVIDIA | 编译引擎 | **没有公开测速** | PR #1034 写明“真实权重的画面/音频对齐测试没有跑” | 未成熟，不可用 |
| NVIDIA Dynamo / TensorRT-LLM / NIM | NVIDIA | — | 只支持 MiniMax **M3**（语言模型），不支持 H3 | — | 不适用 |

## 3. 每道题要多久（质量安全） {#s3}

**基准：T2VA，1344×768，124 帧，50 步，BF16 无损**

| 硬件 | 时间 | 来源 |
|---|---|---|
| 8×B300（Ulysses 8） | 18.25 秒（NVIDIA）/ 19.04 秒（SGLang） | Sol-H3 页面；SGLang cookbook |
| 4×B300 | 35.33 秒 | Sol-H3 页面 |
| 1×B300 | 129.90 秒 | Sol-H3 页面 |
| 8×H200 | 37.6 秒 | SGLang PR #35850 |

注意：SGLang PR #34841 在 8×B300 上测到的无损值是 24.50 秒，比 cookbook 的 19.04 秒慢。不同版本差约 25%。

**参考视频带来的额外时间**

| 证据 | T2VA | 带视频参考 | 倍数 |
|---|---|---|---|
| SGLang PR #35850，8×H200，整段时间 | 37.55 秒 | 133.51 秒 | 3.56 倍 |
| SGLang cookbook，8×H200，每步去噪 | 0.749 秒 | 2.572 秒 | 3.43 倍 |
| vLLM-Omni，4×B300，两段视频参考，362 帧 | 约 195 秒（Sol 的 4×B300 T2VA 15 秒） | 784 秒 | 约 4 倍 |

这些测试的参考视频长度都没有写明。SGLang 最多截取和输出一样长的参考视频（5 秒）。

**按序列长度推算 WROP 的情况**

- 5 秒 T2VA 每层注意力有 38,247 个 token（NVIDIA H3-DataCenter 页面）。
- 粗算：线性层约占 42% 计算，注意力约占 58%。
- 如果参考视频是 5 秒：序列 ×2，推算慢约 3.2 倍。这和实测的 3.4–3.6 倍对得上。
- WROP 的参考视频是 2.5 秒（60 帧）：序列约 ×1.5，推算慢约 **1.9–2.1 倍**。
- 如果参考视频按原始的低分辨率编码，token 更少，可能只慢约 1.3 倍。这一点没有核实。

**每道题估算（8×B300）**

| 情况 | 跑法 | 每段有效时间 | 依据 |
|---|---|---|---|
| 低 | 8 个单卡副本，参考视频代价 1.3 倍 | 约 21 秒 | 129.9 × 1.3 ÷ 8 |
| **中（推荐）** | 8 个单卡副本，参考视频代价 2.0 倍 | **约 33 秒** | 129.9 × 2.0 ÷ 8 |
| 中（不分副本） | 1 个 8 卡 Ulysses 服务 | 约 38 秒 | 19.04 × 2.0 |
| 保守 | 1 个 8 卡服务，参考视频代价 3.5 倍 | 约 67 秒 | 19.04 × 3.5，按 H200 实测比例 |

单卡副本可行吗？B300 有 288 GB 显存。H3 的 DiT（BF16 约 66 GB）、Qwen3-VL-32B 文字编码器（约 64 GB）和 VAE 放一张卡上约 140 GB，放得下。NVIDIA 已经实测过 1×B300 跑 50 步稠密 H3。但单卡跑 Ref2VA 没有人公开测过。

## 4. 质量未验证 / 激进加速（只供参考，不用于成本中间值） {#s4}

::: {.warning title="只供参考"}
这一节的方案都会改变模型输出，或者没有和原版对比的质量数字。它们不用于第 6 节的推荐报价。
:::

| 方案 | 作者 / 日期 | 做了什么 | 公开速度 | 质量证据 | 支持带参考视频吗 |
|---|---|---|---|---|---|
| **Sol-H3** | NVIDIA Research，2026-09（MiniMax 09-07 转发） | FastH3 4 步蒸馏 + Sol-Attn 稀疏注意力 + INT8 QKV / FP8 输出传输 + 并行 VAE + AdaLN 预计算 | 8×B300 T2VA 5 秒：**1.653 秒**（11.04 倍）；10 秒 3.732 秒；15 秒 6.612 秒 | 页面没有给和原版的数值对比 | 引擎支持 Ref2VA，但测速只有 T2VA；Ref2VA 要换 LightX2V 的少步 LoRA |
| Sol-Engine H3 配方 | NVIDIA SANA 团队，2026-08-03 | 融合 + FirstBlockCache 跨步缓存 + Sol-Attn | 8×GB200：6.88 秒（3.95 倍）；“保质”档 3.16 倍 | LPIPS（对原版）：保质档 0.210，极速档 0.293 | 未测 |
| Sol-Engine H100/A100 | NVIDIA，2026-08-09 | 同上 | 4×H100：81.47 → 22.89 秒（3.56 倍） | 只给了视频样例，没有数值 | 未测 |
| FastH3 Preview v1 | Hao AI Lab（UCSD）+ NVIDIA FastGen，2026-08-27 | DMD2 4 步蒸馏 + VSA 90% 稀疏注意力 | 8×B200 5 秒：6.84 秒；单卡最高 14 倍 | SGLang 文档：难动作和细节上有质量差距 | **不支持**（只有 T2VA；Ref2VA 还在做） |
| FastH3 8-Step V2 | FastVideo，在 SGLang | 8 步蒸馏 + VSA 80% 稀疏 | 4×GB300 5 秒：5.20 秒 | 同上 | **不支持**（拒绝 ref2va 请求） |
| SGLang `quality: "high"`（Cache-DiT） | SGLang | 跨步缓存 | 4×H200：1.40 倍；8×B300（PR #34841）：8.54 秒，比无损快 2.87 倍 | 4×H200：SSIM 0.931，PSNR 28.16 dB；B300：LPIPS 0.300（均值）/ 0.408（最大） | 只接受审核过的 T2VA 形状 |
| vLLM-Omni Cache-DiT `high` | vLLM-Omni | 跨步缓存 | 4×H200：1.35 倍 | SSIM 0.971 | 未说明 |
| SGLang SubBlock 稀疏注意力 | SGLang PR #35850，2026-08-26 合并 | 75% 稀疏 | 8×H200 Ref2VA：133.5 → 92.0 秒（1.45 倍） | Ref2VA SSIM 0.941；T2VA 只有 0.758 | **支持** |
| SGLang 在线 FP8 | SGLang | 权重量化 | 8×B300：29.12 → 27.12 秒（约 7%） | 文档写明“近似”，没有质量数字 | 支持 |
| LightX2V Turbo LoRA | LightX2V | 4 步蒸馏 LoRA | 约 12 倍少的去噪步数 | 文档：“更激进的速度/质量取舍” | 有单独的 Ref2V 文件，但未验证 |
| Alibaba PAI PDD 加速 LoRA | 阿里 PAI | 8 步并行解码蒸馏 | 约 6 倍少的去噪步数 | 没有公开数字 | **有 Ref2VA 8 步版本** |
| larryvrh Turbo LoRA | 社区 | 8 步蒸馏 | — | 无 | 只有 FL2VA |
| VDN-H3（Video DeltaNet） | UC Berkeley | 混合线性注意力 + 8 步 DMD2 | 8×B200 FP8 14 秒视频：去噪 11.2 秒 | 自称“近无损”，未见对原版的数字 | **不支持** |
| “H3 Super Acceleration” | NVIDIA Sol-Engine，2026-08-22 | 4 步 H3 草稿 + 3 步 LTX-2.5 精修 | 1×GB200：22.2 倍 | 换了一部分模型 | 不适用 |
| Sol-H3 论文（arXiv 2609.35110） | NVIDIA | 先低分辨率、后高分辨率的两阶段 | 最高 30 倍 | 未见数字 | 不明 |
| Comfy-Org / 社区 INT8、NVFP4、剪枝权重 | Comfy-Org、rockerBOO、vonkaiser 等 | 量化 + AdaLN 剪枝 | 单卡可跑 | MiniMax 文档：和官方 BF16 “不是同一数值基线” | 有 Ref2VA 版本 |
| fal “H3 Max” | fal（二手来源） | 后训练 | 号称 GB200 NVL72 上约 35 倍 | 无 | 只在托管 API |
| 降到 WROP 的 320×192 或减少步数 | — | 改输入 | — | H3-Base 只在 768 短边上发布质量；其他设置会改变行为 | 不推荐 |

**激进方案的大概成本（只供参考）：** 如果用 8 步 Ref2VA 加速 LoRA（PAI PDD），每段约 6–8 秒，300 道约 1 小时（含准备），约 $30–40。但这样测的已经不是论文里的 H3。

## 5. 哪条路适合 WROP {#s5}

- WROP 给 H3 的是：60 帧输入视频（作为参考）+ 文字 prompt。H3 输出 124 帧（5.2 秒，H3 最短 4 秒）。论文第 4.3 节和表 1。
- 所以必须用 **Ref2VA 权重 + `task: "ref2va"` + 视频参考**。
- 不要用 FL2VA 的首帧模式代替。那样只给一张图，丢掉了运动信息，等于换了题。
- 所有 NVIDIA 的快速方案（Sol-H3、FastH3）的公开测速都是 T2VA。只有 SGLang SubBlock（有损）测过 Ref2VA。
- 论文是通过 FAL 托管 API 跑的 H3。FAL 后端用哪种设置（步数、是否加速）不知道。所以本地无损重跑也不一定和论文完全一样。仍然建议新旧 prompt 在同一环境各跑一遍。

## 6. 300 道题：新估算 {#s6}

价格：National Compute .edu 价，8×B300 一台 **$32/小时**。每次最多租 4 小时。

| 情况 | 每段 | 生成时间 | 准备时间 | 总时间 | 费用 |
|---|---|---|---|---|---|
| 低（质量安全） | 约 21 秒 | 约 1.8 小时 | 约 0.5 小时 | 约 2.3 小时 | 约 $75 |
| **中（质量安全，推荐）** | **约 33 秒** | **约 2.7 小时** | **约 0.5 小时** | **约 3.2 小时（一次租期内）** | **约 $100（约 ¥730）** |
| 中，不分副本 | 约 38 秒 | 约 3.2 小时 | 约 0.5 小时 | 约 3.7 小时 | 约 $120 |
| 保守 | 约 67 秒 | 约 5.6 小时 | 约 1–1.5 小时（要租两次） | 约 7 小时 | 约 $220 |
| 第一次搭环境调试 | — | — | +1–3 小时 | — | +$32–96 |
| 新旧 prompt 各跑 300 道（中） | — | 约 5.4 小时 | 约 1 小时 | 约 6.5 小时（两次租期） | 约 $200 |

准备时间包括：下载 Ref2VA 权重（约 135 GiB，只能放本地 NVMe）、加载（约 2 分钟）、预热（约 40 秒）、冒烟测试。

**和之前的估算比**：之前中间值是每段 40 秒、约 4–4.5 小时、约 $130–150（标题写约 $170）。现在每段约 33 秒、约 3.2 小时、约 $100。变化来自两点：多副本多出约 12% 吞吐；准备时间按一次租期算。

## 7. 还没确定的事 {#s7}

1. **参考视频的真实代价**。WROP 这种 2.5 秒视频参考，没有任何公开测速。1.3–3.5 倍的范围是总时间最大的变量。最便宜的办法：租机后先跑 5 道题实测。
2. **Ref2VA 权重本身是否更慢**。SGLang 表里，没有参考时 Ref2VA 权重也要 29.1 秒（FL2VA 是 19.0 秒）。原因没有写。如果这是固定开销，中间值会升到约 50 秒/段（约 $150）。H200 的实测比例不支持这个说法，但不能排除。
3. **单卡副本跑 Ref2VA**。没有公开实测。主机内存要够同时加载 8 份权重。如果不行，就用 1 个 8 卡服务（中，不分副本）。
4. **SGLang 版本差别**。同一台 8×B300，不同版本测到 19.04 秒和 24.50 秒。
5. **许可证地域**。H3 社区许可证不覆盖美国、欧盟、英国、韩国。National Compute 机房位置还不知道。

## 来源 {#sources}

- Sol-H3（8×B300）：<https://nvlabs.github.io/Sana/Sol-Engine/Sol-H3/>
- Sol-Engine H3（8×GB200，2026-08-03）：<https://nvlabs.github.io/Sana/Sol-Engine/H3/>
- Sol-Engine H3 H100/A100（2026-08-09）：<https://nvlabs.github.io/Sana/Sol-Engine/H3-DataCenter/>
- Sol-Engine 代码：<https://github.com/NVlabs/Sana/tree/sol-engine>
- RuntimeWire 报道（2026-09-07）：<https://runtimewire.com/article/nvidia-sol-h3-minimax-video-faster-than-playback>
- Reactor 上线公告：<https://www.reactor.inc/blog/fast-h3-sol-engine>
- FastH3 Preview v1（2026-08-27）：<https://haoailab.com/blogs/fasth3-preview/>
- SGLang H3 cookbook（B300 测试表和测试脚本、质量档位、跨节点、FastH3/VDN）：<https://docs.sglang.io/cookbook/diffusion/MiniMax/MiniMax-H3>
- SGLang PR #34841（B300 Cache-DiT，LPIPS）：<https://github.com/sgl-project/sglang/pull/34841>
- SGLang PR #35850（8×H200 T2VA/FL2VA/Ref2VA 无损对比，2026-08-26 合并）：<https://github.com/sgl-project/sglang/pull/35850>
- MiniMax H3 自部署文档（2026-08-26 审阅）：<https://platform.minimax.io/docs/guides/local-deploy-h3>
- vLLM-Omni H3 配方：<https://github.com/vllm-project/vllm-omni/blob/main/recipes/MiniMaxAI/MiniMax-H3.md>
- NVIDIA TensorRT-Model-Connect PR #1034（草稿，未做真实权重测试）：<https://github.com/NVIDIA/TensorRT-Model-Connect/pull/1034>；PR #1025（Windows RTX）：<https://github.com/NVIDIA/TensorRT-Model-Connect/pull/1025>
- Dynamo 只支持 M3：<https://github.com/ai-dynamo/dynamo/releases/tag/v1.3.0-minimax-m3-dev.1>
- explainx 关于 “Fast H3 v1” 的二手报道（把 FastH3 说成 MiniMax 自己发布，不准确）：<https://explainx.ai/blog/minimax-fast-h3-v1-blackwell-realtime-open-video-august-2026>
- WROP 论文第 4.2–4.3 节、表 1：本地 `gen-splits/paper.txt`
