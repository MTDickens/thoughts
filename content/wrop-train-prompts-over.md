---
title: WROP 训练提示词：OVER 有多少
slug: wrop-train-prompts-over
short: 训练 OVER
description: 训练数据与 prompt.txt 已公开。抽样 3,000 条后，照搬脚本标签 OVER 约 65%；复核改判后约 80%–94%。另有一处口径待你定。
chips: [训练数据已公开, 抽样 3000, OVER 65%→80%, 待定悬空口径]
order: 37
updated: 2026-10-10
---

日期：2026-10-09（新加坡时间）
范围：只做调查。不改任何作者文件。

## 1. 一句话结论 {#s0}

- **训练数据和训练提示词都已公开。** 视频可以直接下载。每个样本旁边有一个 `prompt.txt`。
- 我们抽了 **3,000 条**训练提示词（150 个出题器 × 20 条）。
- 照搬 197 条脚本审查的标签：**OVER 65.2%**，OK 34.8%，UNDER 0%。
- 197 条脚本审查是 **OVER 72.1%**。训练集更低，原因是权重不同，不是文字不同（见第 5 节）。
- 训练提示词的正文就是那 197 条脚本正文。只换了颜色词，并加了固定前缀。
- 复核发现：197 条审查的 55 条 OK 里，有 23 条含有同类「结果说教」。按同一规则改判后，训练集 OVER 是 **79.6%**。若「不会悬空」也算 OVER，则是 **93.7%**。

## 2. 发布了吗 {#s1}

| 项目 | 结果 | 出处 |
|---|---|---|
| 训练数据 | **已发布**，公开，无门槛（`gated: false`） | https://huggingface.co/datasets/Hokin/object-permanence |
| 文件 | 150 个 tar，每个出题器一个 | `train/<task>_task.tar` |
| 大小 | 共 214,099,660,800 字节（约 214 GB）；单个 0.69–4.07 GB；不压缩 | HF API |
| 校验文件 | `train/checksums.txt`（15,604 字节）：每个 tar 的 sha256、文件名、成员数 50,000 | https://huggingface.co/datasets/Hokin/object-permanence/blob/main/train/checksums.txt |
| 每个样本 | 5 个文件：`input_video.mp4`、`target_video.mp4`、`prompt.txt`、`trajectory.npz`、`metadata.json` | HF 说明页；我们读过的 tar 内容 |
| 视频 | 1280×720，24 fps；输入 60 帧，目标 60 帧 | HF 说明页 |
| 训练提示词 | **已发布。** 在每个样本的 `prompt.txt` 里 | 我们抽到的 3,000 条 |
| `metadata.json` | **没有**提示词正文。只有 `source_script`、`seed` 等参数 | 我们读过的样本 |
| 许可证 | CC BY-NC 4.0 | HF 说明页 |
| GitHub | README 链到 HF 的 "Training data (1.5M)"。仓库里只有出题器脚本，没有数据 | https://github.com/hokindeng/object-permanence |
| 论文 | "We release this 1.5M-sample training corpus"（第 1 页） | https://arxiv.org/abs/2609.28654 |
| 项目网站 | "Data" 链接打开的是同一个 HF 数据集页 | https://www.object-permanence.world/data |

我们怎么确认能下载：

- 150 个 tar 都能不登录访问。HF 跳转到 CDN。CDN 支持按字节范围读取。
- 我们对 150 个 tar 都做了范围读取。150 个全部成功，取到了提示词。
- 我们**没有**下载全部 214 GB。所以没有核对 sha256。

一个重要限制：

- 论文第 7 页说，PWM-WROP 用的是 "an earlier render of the same 150 generators"。
- 所以公开的训练集**不是** PWM-WROP 真正用过的那一份。那一份没有公开。
- 公开的提示词和 PWM-WROP 见过的提示词是否一字不差，无法核实。两者来自同一批出题器。

## 3. 怎么抽样 {#s2}

| 项目 | 做法 |
|---|---|
| 分层 | 按出题器分层。150 个出题器，每个 20 条。共 3,000 条 |
| 随机方式 | 在每个 tar 里随机选字节位置。找到下一个 tar 头。再跳到同一样本或下一个样本的 `prompt.txt` |
| 去重 | 同一样本只取一次 |
| 覆盖 | 样本编号均匀分布在 0–9999（四段分别 768 / 723 / 739 / 770 条） |
| 偏差 | 按字节选位置，大视频的样本被抽中的机会略高。我们认为这对提示词影响很小 |
| 对齐 | 用 `metadata.json` 里的 `source_script` 对到 197 条脚本（2,876 条）。缺 metadata 的用文字对齐（124 条） |
| 覆盖的脚本 | 197 条里抽到 196 条。没抽到：G05 的 `pb_task_00000027`（原标签 OVER） |

## 4. 训练提示词和脚本正文一样吗 {#s3}

| 结果 | 条数 |
|---|---:|
| 有前缀 "Continue this scene as a short video." | 3,000 / 3,000 |
| 去掉前缀后，与 197 条之一相同（忽略颜色词和 a/an） | 2,980 / 3,000 |
| 不完全相同 | 20（全是 G29） |

- G29 的 197 条记录只是代码里的一段模板。真实训练提示词更长。
- 真实 G29 提示词多了一句："It must not disappear, teleport, duplicate, switch to the other ball's track, or emerge from the other ball's exit."
- 所以 G29 在训练集里的 OVER 更重，不是更轻。
- 换颜色词不改变 OVER / OK 判断。197 条审查里每条 OVER 的原话，在对应的 1,957 条训练提示词里都还在（1,957 / 1,957）。

## 5. 结果：照搬 197 条审查的标签 {#s4}

规则和 `prompt-ambiguity-197.md` 一样：

- Max 的惯性规则：已经在动的挡板「移开」就是继续往前走。这不算 UNDER。
- OVER = 文字里说教物体恒存、身份、颜色、不能穿过等结果。

| 类别 | 训练集抽样（3,000） | 197 条脚本 |
|---|---:|---:|
| OK | 1,043（34.8%） | 55（27.9%） |
| **OVER** | **1,957（65.2%）** | **142（72.1%）** |
| UNDER | 0 | 0 |
| MIXED | 0 | 0 |

- 95% 置信区间：65.0%–65.4%。这个区间只含抽样误差，不含判断误差。区间很窄，因为 147 个出题器里 20 条全同一类。
- 只有 3 个出题器内部有 OK 也有 OVER：G05（10/20 OVER）、G06（15/20）、G24（12/20）。
- 另一种算法：假设每个出题器内各脚本出现机会相同。结果是 65.4%。和抽样结果一致。

为什么训练集 OVER（65.2%）比 197 条（72.1%）低：

- 训练集给每个出题器 10,000 条，不管它有几条脚本。
- OVER 多的族（OP-1、OP-2）脚本多。在 197 条里它们占比高。
- OK 多的族（掉落、碰撞）多是一个出题器一条脚本。在训练集里它们的占比变高。
- 文字本身没变少。

## 6. 复核：197 条审查里的 OK 不一致 {#s5}

我们逐条重读了 197 条里的 55 条 OK。有些 OK 含有和 OVER 同类的句子。197 条审查在别处把这类句子算作 OVER。

| 组 | 条数 | 例句 | 197 条审查里的同类 OVER 例子 |
|---|---:|---|---|
| P：恒存 / 身份 / 不能穿过 / 「不是回到原位」 | 23 | G62 "Neither ball changes colour, and both remain present the whole time"；G38 "The same red bob should later emerge"；G73 "none appear or vanish"；G83 "not back to its original world position"；G100 "Both balls remain; neither passes through the other" | G85 "not back to its original position"；G14 "continues to exist while hidden, and emerges onto the same …"；G01 "must not pass through the cap" |
| S：只说「不会悬空」 | 22 | G113 "Nothing remains suspended"；G149 "It is never suspended in mid-air"；G06 "should pass across successfully without falling or stopping" | 197 条的 OVER 原话里**没有**「悬空」这一类。要不要算 OVER，请 Max 定 |
| 仍是 OK | 10 | G24、G67、G71、G72、G98、G108、G110、G111；边界：G88、G128 | — |

明细：`/workspace/hokin-15d/train-prompts/strict-ok-recheck.json`（每条 OK 的改判和原话）。

按复核结果重算：

| 口径 | 训练集 OVER | 197 条脚本 OVER |
|---|---:|---:|
| 照搬 197 条标签 | 65.2% | 142 / 197（72.1%） |
| P 组改为 OVER | **79.6%**（2,387 / 3,000） | 165 / 197（83.8%） |
| P 组 + S 组都改为 OVER | **93.7%**（2,812 / 3,000） | 187 / 197（94.9%） |

UNDER 在三种口径下都是 0。我们没有新增 UNDER。

## 7. 分族结果（训练集抽样） {#s6}

| 族 | 出题器 | 条数 | 照搬标签 | P 改判 | P+S 改判 |
|---|---:|---:|---:|---:|---:|
| OP-1 Baillargeon 遮挡 | 26 | 520 | 92.3% | 100% | 100% |
| OP-2 静态遮挡 | 29 | 580 | 98.6% | 98.6% | 98.6% |
| OP-3 容器恒存 | 35 | 700 | 71.4% | 85.7% | 85.7% |
| OS-1 阻挡 | 20 | 400 | 42.5% | 65.0% | 80.0% |
| OS-2 掉落 | 21 | 420 | 22.6% | 22.6% | 100% |
| OS-3 碰撞 | 19 | 380 | 36.8% | 89.5% | 100% |
| **合计** | **150** | **3,000** | **65.2%** | **79.6%** | **93.7%** |

## 8. 没查到或没做的 {#s7}

- 没有核对 sha256。没有下载全部 214 GB。
- PWM-WROP 真正训练用的「earlier render」没有公开。它的提示词无法核对。
- 第 6 节的改判是我们按同一规则做的判断。作者没有给过判断标准。
- 「不会悬空」算不算 OVER，197 条审查没有先例。我们单列出来。

## 9. 文件 {#s8}

| 文件 | 内容 |
|---|---|
| `/workspace/hokin-15d/train-prompts/sample.py` | 抽样脚本（HF 范围读取） |
| `/workspace/hokin-15d/train-prompts/samples.jsonl` | 3,000 条原始提示词、样本路径、`source_script`、seed |
| `/workspace/hokin-15d/train-prompts/classify.py`、`judge.py`、`strict.py` | 对齐和分类脚本 |
| `/workspace/hokin-15d/train-prompts/judged.json` | 每条的三种口径标签 |
| `/workspace/hokin-15d/train-prompts/strict-ok-recheck.json` | 55 条 OK 的复核明细 |
