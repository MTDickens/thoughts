---
title: Physics-IQ vs Object Permanence：名次对照
slug: physiq-vs-wrop
short: 两榜对照
description: Physics-IQ Verified 与 Object Permanence（WROP）两个榜上共有模型的名次对照；Seedance 与 MiniMax H3 名次反转。
chips: [Physics-IQ, WROP, 名次反转, 6 个共有模型]
order: 45
updated: 2026-10-09
---

左边是 DeepMind **Physics-IQ Verified**（真实物理一致性自动分），右边是 **Object Permanence / WROP**（物体恒存人工 Elo）。两边共有 6 个模型用连线标出；连线交叉 = 名次颠倒。

## 1. 一句话结论 {#s1}

> 两个榜测的不是同一件事。共有模型里，**Seedance 2.5 与 MiniMax H3 名次反转**：Physics-IQ i2v 上 Seedance 高于 H3；WROP 上 H3 并列第一、Seedance 第四。Cosmos3 Super / MAGI-1 在 Physics-IQ 偏高、在 WROP 偏低。

交互对照图（可悬停高亮连线）：[打开交互版](/physiq-vs-wrop-rank)。

## 2. 对照图 {#s2}

::: {.figure #fig-rank src=/physiq-vs-wrop-rank.png alt="Physics-IQ Verified 与 Object Permanence 名次对照；共有模型连线，交叉表示名次反转"}
静态快照。悬停交互见 [交互版](/physiq-vs-wrop-rank)。
:::

## 3. Physics-IQ Verified（节选） {#s3}

绝对分 0–100。粗体 = 两边共有。完整 Verified 表约 45 行，见 DeepMind README [@physiq-readme]。

| 模型 | 分数 | 备注 |
|---|---:|---|
| Odyssey-3 Pro + BoN×8 | 66.10 (v2v) | 榜首 v2v |
| Odyssey-3 + BoN×8 | 64.43 (v2v) | |
| FLUX 3 [large] + WMReward BoN | 64.35 (v2v); 54.70 (i2v) | |
| Odyssey-3 Pro | 63.37 (v2v); 49.99 (i2v) | |
| FLUX 3 [large] | 61.11 (v2v); 51.11 (i2v) | |
| **MAGI-1 24B** + GeoPhys BoN | 58.2 (v2v); 33.7 (i2v) | |
| **Cosmos3 Super** | 50.8 (v2v); 42.7 (i2v) | |
| **MAGI-1 24B** | 48.4 (v2v); 30.2 (i2v) | |
| Cosmos3-Nano | 43.0 (v2v); 37.3 (i2v) | |
| **Seedance 2.5** | 42.43 (i2v) | |
| **MiniMax H3** (FL2VA) | 39.8 (i2v) | |
| MiniMax H3 Max | 36.2 (i2v) | 仅 Physics-IQ |
| **Gemini Omni Flash 1.1** | 35.34 (i2v) | |
| **Grok Imagine** Video | 34.8 (i2v) | |
| Hunyuan Video 1.5 | 33.4 (i2v) | |
| Wan 2.2 14B | 32.2 (i2v) | 不是 Wan 3.0 |
| Veo 3.1 Lite / Fast | 31.83 / 29.96 (i2v) | |
| Sora 2 | 26.5 (i2v) | |

## 4. Object Permanence（WROP Elo） {#s4}

全 14 模型。粗体 = 两边共有。排行榜见 [@wrop-leaderboard]。

| 名次 | 模型 | Elo | Score rate | 类型 |
|---:|---|---:|---:|---|
| 1 | Wan 3.0 Prime | 1723.6 | 77.9% | Ref2V |
| 2 | **MiniMax H3** | 1723.6 | 77.9% | Ref2V |
| 3 | PWM-WROP | 1679.5 | 73.1% | Continuation |
| 4 | **Seedance 2.5** | 1649.6 | 69.6% | Ref2V |
| 5 | Runway Aleph 2 | 1518.3 | 52.9% | Edit |
| 6 | Wan-VACE 14B | 1506.7 | 51.0% | Edit |
| 7 | **Gemini Omni Flash 1.1** | 1492.5 | 49.0% | Edit |
| 8 | Kling O3 Pro | 1471.3 | 46.2% | Edit |
| 9 | **Grok Imagine** (video extend) | 1457.0 | 44.2% | Continuation |
| 10 | LTX-2.3 Extend | 1453.4 | 43.1% | Continuation |
| 11 | **Cosmos3 Super** | 1409.2 | 37.3% | Edit |
| 12 | LTX-2.3 Dev | 1398.9 | 36.5% | Edit |
| 13 | HY-OmniWeaving | 1268.5 | 21.0% | Edit |
| 14 | **MAGI-1 24B** | 1248.0 | 19.2% | Continuation |

## 5. 重叠与反转 {#s5}

两边都有：**Seedance 2.5、MiniMax H3、Cosmos3 Super、MAGI-1 24B、Gemini Omni Flash 1.1、Grok Imagine**。

| 模型 | Physics-IQ（本页节选位次 / 分） | WROP 名次 / Elo | 走势 |
|---|---|---|---|
| MiniMax H3 | #10 · 39.8 i2v | #2 · 1723.6 | 大幅上升 |
| Seedance 2.5 | #9 · 42.43 i2v | #4 · 1649.6 | 上升；与 H3 交叉 |
| Gemini Omni Flash 1.1 | #12 · 35.34 i2v | #7 · 1492.5 | 上升 |
| Grok Imagine | #13 · 34.8 i2v | #9 · 1457.0 | 上升 |
| Cosmos3 Super | #6 · 50.8 v2v / 42.7 i2v | #11 · 1409.2 | 下降 |
| MAGI-1 24B | #7 · 48.4 v2v / 30.2 i2v | #14 · 1248.0 | 大幅下降 |

::: note
Physics-IQ = 真实物理视频上的自动一致性分；WROP = 物体恒存 / 固体性题上的盲测人工 Elo。构造不同，名次反转是预期现象，不是噪声。
:::

## 6. 来源 {#s6}

- Physics-IQ Verified：[@physiq-readme]；看板 [@physiq-anates]
- Object Permanence / WROP：[@wrop-leaderboard]；论文 [@wrop-arxiv]
- 官方拼写是 **Seedance** 2.5（不是 Sedance）
- 交互页：[/physiq-vs-wrop-rank](/physiq-vs-wrop-rank)（站点内嵌静态页 + JS）
