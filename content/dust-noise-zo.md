---
title: Dust / Noise：无反向传播预训练与 Boost → Cut
slug: dust-noise-zo
short: Dust / Noise
description: Q Labs 的 Dust 与 Noise、Boost → Cut 加速、bitter lesson 相关原话、以及零阶优化的学术背景。只记已核实事实。
chips: [Dust, Noise, Boost → Cut, 零阶优化]
order: 50
updated: 2026-10-19
---

依据 Q Labs 论文与仓库、Noise 榜与 PR、Boost → Cut 作者帖与草稿论文、相关 X 原话。时间一律标台北时间（UTC+8）。榜单与开放 PR 会变；本文快照到 2026-10-19 约 18:37。

## 1. 一句话结论 {#s1}

> Dust 用激活扰动估计信用，不用反向传播。Noise 是固定设定下的无反传竞速赛。Boost → Cut 是当前已合并的 Track 1 纪录（val 约 3.945，约 8 分钟）。它对 Dust 旧纪录约 9.4 倍墙钟加速；其中约 2.3 倍来自稀疏神经元捷径。作者草稿仍报：相对反向传播约 136 倍 FLOPs、约 4.4 倍显存。PR #17（CutBI）自称 val 3.728，**尚未合并、维护者未核实**。

| 项 | 状态（2026-10-19） |
|---|---|
| Dust 论文 | [qlabs.sh/research/dust](https://qlabs.sh/research/dust/)，无 arXiv 编号 |
| Noise 官方榜 Track 1 | Boost → Cut，val **3.945**，约 8 分钟 |
| Noise 官方榜 Track 2 | Boost，val **4.123**，约 5 分钟 |
| 反传参考（README） | SGD **5.007**；Adam + lr cooldown **3.769** |
| PR #17 CutBI | 自称 val **3.728** / 518 s；**开放、未合并** |
| 「不用 Adam / 纯零阶搜索」那段记忆原话 | **未找到** |

## 2. Dust：方法与结果 {#s2}

> 论文标题：*Dust: Pretraining Transformers Without Backpropagation*。作者：Samip Dahal、Bishwas Mandal、Serdar Gülbahar、Akshay Vegesna。日期写「October 2026」。代码：[qlabs-eng/dust](https://github.com/qlabs-eng/dust)。[@dust-paper; @dust-code]

### 核心做法 {#s2-method}

> 不扰动权重，而扰动每层线性层的输出。每个 token 独立加高斯噪声。用该 token 上 loss 的变化给噪声打分。奖励加权的噪声，再与输入做外积，得到权重梯度估计。论文称这是一种 node perturbation。[@dust-paper]

> 一次前向可并行评估大量扰动（「虚拟种群」）。论文宣称相对 EGGROLL 量级约 **10³–10⁴** 倍更高效。[@dust-paper; @eggroll]

### 设定与头条结果 {#s2-results}

> FineWeb、4096 BPE、batch 16k token、单 epoch、SGD+momentum。基座模型 8 层 × 宽 512。[@dust-paper]

> 用 SGD 时，Dust 在小数据预算上可接近甚至低于反传。用 Adam 时，作者也报 Dust 的拟合极限可接近反传。独立复现指出：SGD 下接近；AdamW 下 Dust 仍落后约 0.5 nat，且 GPU 小时约是反传的 2000 倍量级（Benhao Huang / @huskydogewoof，2026-10-07）。[@dust-paper]

> Samip 发布帖（2026-10-06 03:41）：「first zeroth-order method to pretrain transformers to approach and sometimes even *exceed* backprop」。[@samip-dust4]

## 3. Noise：无反传预训练竞速 {#s3}

> 页面：[qlabs.sh/noise](https://qlabs.sh/noise/)。仓库：[qlabs-eng/noise](https://github.com/qlabs-eng/noise)。发布约 2026-10-13 04:17。[@noise-page; @noise-repo]

### 规则（固定什么） {#s3-rules}

> 模型固定：37.7M GPT，最终权重必须严格载入 `utils/model.py`。数据固定：FineWeb 子集 `data/train.pt`，至多一个 epoch。评分：`utils/eval.py` 在 `data/val.pt` 上的平均 next-token 交叉熵。硬件：一台 **8×H100**。

> **禁止反向传播**：禁止 autograd（正/反向模式），禁止手写反向。学习信号只能来自前向评估。初始化、batch、如何使用前向次数自由。纪录用 PR 提交。

### 两条赛道 {#s3-tracks}

| 赛道 | 目标 |
|---|---|
| Track 1 | 单 epoch 后最低 validation loss（无时间上限） |
| Track 2 | 达到 val loss **4.2** 的最短训练时间 |

> README 反传参考：SGD **5.007**；Adam + lr cooldown **3.769**。目标写明：大幅超过反传。

### 官方榜快照（已合并纪录） {#s3-board}

> 以下为 README 已合并条目（2026-10-19 晚间仍如此）。数字会变。

**Track 1（val loss ↓）**

| # | Val | 说明 | 时间 | 贡献者 |
|---|---:|---|---|---|
| 1 | 5.954 | EGGROLL + Adam，128k antithetic | 5 h 20 min | – |
| 2 | 5.058 | Dust + SGD，16k population | 1 h 19 min | – |
| 3 | 4.167 | Dust + Adam，24k，lr cooldown | 1 h 46 min | – |
| … | … | 中间若干工程改进 | … | … |
| 8 | 3.991 | 降到 16k population | 1 h 12 min | @serdardoesml |
| **9** | **3.945** | **Boost → Cut** | **约 8 min** | **@spicylemonade** |

**Track 2（到 4.2 的时间 ↓）**

| # | Val | 说明 | 时间 | 贡献者 |
|---|---:|---|---|---|
| 1 | 4.167 | Dust + Adam | 1 h 46 min | – |
| … | … | … | … | … |
| **4** | **4.123** | **Boost（仅阶段一）** | **约 5 min** | **@spicylemonade** |

::: {.warning title="开放 PR 不是纪录"}
PR #14–#17 等作者自报数字**未写入**上表。维护者未合并前，不当作官方纪录。见 §6。
:::

## 4. Boost → Cut：当前已合并纪录 {#s4}

> 作者：@spicey_lemonade（GitHub `spicylemonade`）。帖：[2026-10-18 09:52](https://x.com/spicey_lemonade/status/2111636408540799141)。代码：[boost-cut](https://github.com/spicylemonade/boost-cut)。Noise PR **#11**（Track 1）与 **#12**（Track 2）于当日约 15:48 由 `serdardoesml` 合并；@cs_serdar 写「insane, reproduced and merged!」。[@boost-cut-post; @boost-cut-code]

### 两阶段规则 {#s4-method}

> **Boost（前 30% epoch）**：每个 attention / MLP 层只对着「紧挨其后的 residual 读出头」（logit lens 当训练目标）学。每个 token 的信用用前向差分精确测量。

> **Cut（后 70%）**：端到端信用。attention 输出固定为 clean 值。每个 token 只通过 MLP 中输出贡献最大的 **128 / 2048** 个单元传信用；其余单元固定。Keys 用 closed-form 单 key 实验。

> 优化器仍叠在估计之上：纪录配方用 **ANVIL II + Adam**。规则合规说明：每个学习信号都是扰动下 loss 的实测变化；无 autograd、无反向（autograd 仅用于分析核对）。

### 2.3× 与 9.4×：已澄清 {#s4-2p3x}

> 原帖写「2.3x speedup」。附图 y 轴是平滑 **training** loss，不是 val；蓝线约 7.6 min，粉线 Dust 纪录约 72 min · val 3.991。

> 作者答复 @kdpisda（[2026-10-19 02:25](https://x.com/spicey_lemonade/status/2111886525734764840)）：

> 「9.4x for the total method (lots of engineering). 2.3x from the sparse-neuron shortcut inspired by Nick’s essay, compared to the method without that shortcut. But yes, it’s a 9.4x speedup over Dust baseline in total.」

| 数字 | 含义 |
|---|---|
| **约 2.3×** | 相对「关掉稀疏神经元捷径」的同方法加速（Cammarata 启发） |
| **约 9.4×** | 整套 Boost → Cut 相对 Dust 旧纪录的墙钟加速 |

[@boost-cut-2p3x]

### 与 Cammarata 文章的关系 {#s4-cammarata}

> 文章：[Neural Networks Are Already Clean](https://www.goodfire.com/research/already-clean)（Goodfire，Nick Cammarata；X 发布约 2026-10-15 23:40）。作者自述用到两点：**Strong routes**（弱激活几乎可消、功能骑在强激活上）与 **circuit racing / head start**（解释为何 Boost 先跑）。[@cammarata-essay]

### 相对反传的代价（作者草稿） {#s4-cost}

> 草稿论文在仓库 `llm-slop-review/draft.md`（README：LLM 代写、仍在审）。自报：

| 对比 | 数字 |
|---|---|
| 相对 Dust 旧纪录 | 约 **24×** 更少的矩阵 FLOPs |
| 相对反向传播 FLOPs | 仍约 **136×** |
| 相对反向传播显存 | 约 **4.4×** |
| Loss 差距（7.3M–243M） | 持续约 **0.23–0.26** nats（243M 终配待跑完） |
| 同模型同优化器反传 test | **3.706 ± 0.009**；Boost → Cut test **3.935 ± 0.012** |

> 结论口径：比别的零阶快很多；比反传仍慢很多、loss 仍高一截。

### Leo Gao 的批评 {#s4-critique}

> [@nabla_theta](https://x.com/nabla_theta/status/2111738788988977454)（2026-10-18 16:38）回复「mech interp 就是换名的能力研究」：

> 「i strongly predict this tweet is looking at an extremely poorly optimized baseline, and the ideas in the essay do not help well tuned training stacks. it's like dropping entire layers from shitty models.」

> 这是预测，不是他给出的实测。含义：加速是相对粗糙的 Dust 纪录算的；在已调好的训练栈上，「砍弱激活」未必有用。[@leo-gao-critique]

### 隔夜反应（Q Labs） {#s4-overnight}

> Samip（[2026-10-19 03:30](https://x.com/industriaalist/status/2111902667895411183)）：约 10× 加速；认为接下来会出现很多「不像反传」的信用分配算法。

> Bishwas（[同日 03:54](https://x.com/bishmdl76/status/2111908825423131131)）：一周已有趣进展；年底前再提 **1000×** 效率「pretty sure」。

## 5. Bitter lesson / Adam：记忆原话未找到 {#s5}

::: {.warning title="NOT FOUND"}
未找到与记忆完全对应的原文：「大家以为 Adam 近最优 → 后来发现不用 Adam、纯零阶搜索也行」。检索范围含 Samip 帖、Dust/Noise 线程、Boost → Cut 回复、Cammarata 近帖、Dust 论文与 Noise 页/README。X 全文检索偏关键词，释义帖仍可能漏网。以下是**最接近的已核实原话**。
:::

> Samip，Dust 线程 4/4：[@samip-dust4]

> 「the bitter lesson will strike optimization research too, and zeroth-order methods (i.e. the simplest form of optimization) might eventually replace backprop altogether!」

> Samip 谈 Adam：[@samip-adam]

> 「adam wasn't the main focus of the paper b/c i think optimizers will have to coevolve around zeroth-order optimization too (everything today has been built for backprop)」

> 他还用过字面短语「maximally bitter-lesson-pilled bet」（2026-07）与「super bitter-lesson-pilled idea」（2026-08）。Dust 论文与 Noise 页都写：算力增大时，基于搜索的更通用算法可能压过依赖可微与反传的归纳偏置。

::: note
**与记忆相反的一点**：Noise 每条已合并纪录，都在零阶估计之上继续用 Adam、ANVIL II 或 SGD。没有人用「纯搜索、不用一阶优化器」刷出当前纪录。
:::

## 6. 开放 PR（未合并，勿当纪录） {#s6}

> 2026-10-19 约 18:37 再查：官方 README 榜仍止于 Boost → Cut。下列为作者自报；**维护者未合并**。[@noise-pr17]

| PR | 作者 | 自报 | 状态 |
|---|---|---|---|
| **#17** CutBI | Euraba | Track 1 val **3.728** / **518 s**（约 8.6 min）。同 Boost 阶段；加 attention「externalities」反向归纳。信用与真梯度余弦自称 **0.988**。若属实，会低于 Boost → Cut（3.945），也低于 README 反传 Adam（**3.769**） | **开放** |
| #16 | Lazarus-931 | Track 1 **3.914** / 5 min；Track 2 **4.176** / 83 s | **开放** |
| #15 / #14 | Euraba | Track 2 压时间（157 s / 261 s 等） | **开放** |
| #10 | yanghu819 | 自称 3.9804，但硬件为 8×B300（规则写 8×H100） | **开放** |

> #17 评论：@kroggen 写「No way! You have beaten backprop + Adam (3.769)」。作者称评测与 README 一致。**在合并前只记为作者主张。**

## 7. 学术史（仅背景） {#s7}

> 这些是 Dust/Noise 之前或并行的零阶 / ES 工作。不是本页核心。

| 工作 | 一句话 | 关联 |
|---|---|---|
| Salimans et al. 2017 [@es-salimans] | 权重空间 ES，可扩到大量并行 worker | Dust 对标的权重空间基线 |
| MeZO [@mezo] | 两次前向的 ZO-SGD，微调级省显存 | LLM 规模 ZO 先例；非预训练 |
| Vegesna & Dahal [@vegesna-dahal] | 激活空间搜索再回归 | Q Labs 前作 |
| ES at Scale [@es-at-scale] | 十亿参数级全参 ES 微调 | 近期 LLM ES |
| EGGROLL [@eggroll] | 低秩结构化 ES，冲吞吐 | Dust 宣称相对它 10³–10⁴× 更高效 |

## 8. 仍未知 / 待跟 {#s8}

- Dust 论文 venue / arXiv：**未知**。
- ANVIL II（@Alaxarr）主文：**未知**。
- Noise 设定下反传的墙钟：Q Labs **未公布**；boost-cut 草稿另有自比。
- Boost → Cut 在 243M 的终配：草稿写 pending。
- PR #17 等是否合并：需再查。
- 「不用 Adam」那段记忆原文：若有截图 / 长文 / 播客线索，可再挖。

### 主要入口 {#s8-links}

- [Dust 论文](https://qlabs.sh/research/dust/) · [Dust 代码](https://github.com/qlabs-eng/dust)
- [Noise](https://qlabs.sh/noise/) · [Noise 仓库](https://github.com/qlabs-eng/noise)
- [Boost → Cut](https://github.com/spicylemonade/boost-cut) · [作者帖](https://x.com/spicey_lemonade/status/2111636408540799141)
- [Cammarata 文章](https://www.goodfire.com/research/already-clean)
