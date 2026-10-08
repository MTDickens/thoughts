---
title: 组件样例（self-test，不发布）
slug: components
short: 组件
description: 所有组件的样例。build 自检用。
chips: [样例]
updated: 2026-10-08
---

这页演示全部组件。它只在 build 自检里渲染，不会上线。

## 1. 文字和引用 {#c1}

普通段落，带 **粗体**、`代码` 和链接 [Cloudflare](https://developers.cloudflare.com/)。Elo 换算见 [@elo-wiki]，LPIPS 见 [@zhang2018; @elo-wiki]。

带旁注的句子[旁注：短补充，宽屏显示在右侧。]{.aside}，然后继续。

| 指标 | 值 | 越高越好 | 出处 |
|---|---:|---|---|
| Elo | 1723.6 | 是 | 表 2 |
| 合计 | 1 | — | — |

::: note
默认标题的说明框。
:::

::: {.warning title="小样本"}
本节数字来自 g26 小样本，仅供参考。
:::

::: tip
提示框。
:::

::: aside
块级旁注。
:::

## 2. 图、视频、可视化 {#c2}

::: {.figure #fig-demo src=/demo.svg}
图 1：示意图。
:::

::: {.video #vid-demo src=/demo.mp4 t=1}
视频 1：测试画面，从第 1 秒开始。
:::

::: {.viz #viz-elo kind=bar src=/data/demo.csv x=model y=elo}
图 2：前五名 Elo。
:::

## 3. 对比、分栏、标签页 {#c3}

::: {.compare #cmp-demo}
### 冻结最后一帧
SSIM 0.961，但答错。

### PWM-WROP
SSIM 0.970，答对。
:::

::: {.columns #cols-demo}
### 左栏
一些文字。

### 中栏
一些文字。

### 右栏
一些文字。
:::

::: {.tabs #tab-demo}
### 人工指标
Elo、置信区间。

### 自动指标
MSE、PSNR、SSIM、LPIPS。
:::

::: {.details summary="展开看细节"}
折叠起来的内容。
:::
