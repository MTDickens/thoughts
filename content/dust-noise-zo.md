---
title: Dust / Noise：无反向传播预训练与 Boost → Cut
slug: dust-noise-zo
short: Dust / Noise
description: Q Labs 的 Dust 与 Noise、Boost → Cut 加速、bitter lesson 相关原话、以及零阶优化的学术背景。只记已核实事实。
chips: [Dust, Noise, "30M 重置", "Track1 3.338", "Track3 3.211", "Track2 22.9s", 零阶优化]
order: 50
updated: 2026-10-29
---

依据 Q Labs 论文与仓库、Noise 榜与 PR、Boost → Cut 作者帖与草稿论文、相关 X 原话。时间一律标台北时间（UTC+8）。榜单与开放 PR 会变；本文快照到 2026-10-29 约 11:05。

## 1. 一句话结论 {#s1}

> Dust 用激活扰动估计信用，不用反向传播。Noise 是固定设定下的无反传竞速赛。**2026-10-22 起训练数据从 10M token 升到 30M**；旧 10M 赛道整表归档到 `archive/10M/`，不再收新提交。现主榜三条赛道：Track 1（最低 val）、Track 2（到 val **3.5** 的最短时间）、Track 3（架构可改）。**台北 2026-10-26 约 23:58**，维护者同批合并 **#45 / #46 / #47 / #48**。Track 1 现纪录：**3.338 / 56 min**（PR **#46**，CharlesDDDD；forward readout of cross-token credit）。该值**低于**反传 ANVIL II + Adam **3.340**，也低于反传 Adam **3.419**。Track 3 现纪录：**3.211 / 约 2 h 57 min**（PR **#48**，RobertTLange；12×1024 GPT + hashed n-gram value embeddings + Cut-lite）。中间条目：#45 → Track 3 **3.378 / 3 h 50 min**；#47 → Track 3 **3.358 / 27 min**。**台北 2026-10-29 约 06:42**，维护者同批合并 Track 2 **#51 / #52**。Track 2 现官方短墙钟：**3.498 / 22.9 s**（README #4；PR **#52**，RobertTLange；在 #51 的 identity 上改单根 Cut + fused Gluon）。中间条目：#51 → README #3 **3.494 / 2 min 3 s**（conglu1997；paired MLP roots）；#44 → README #2 **3.499 / 8 min 20 s**。相对 #44，#52 约 **×21.8** 更快。另仍开放：**#10**（8×B300 curriculum，非官方 H100）。Relay / CutBI 族仍关闭未合并。[@noise-repo; @noise-pr44; @noise-pr45; @noise-pr46; @noise-pr47; @noise-pr48; @noise-pr51; @noise-pr52; @noise-archive-10m]

| 项 | 状态（2026-10-29 约 11:05） |
|---|---|
| Dust 论文 | [qlabs.sh/research/dust](https://qlabs.sh/research/dust/)，无 arXiv 编号 |
| 训练数据 | **30M** token（14,648 条 × 2048）；旧 **10M** 已归档 [@noise-archive-10m] |
| Noise 主榜 Track 1 | val **3.338** / **56 min**（README #3；PR #46） |
| Noise 主榜 Track 2 | 到 **3.5** 的时间；官方短墙钟 **3.498** / **22.9 s**（README #4；PR #52）；#51 → **3.494** / **2 min 3 s**；#44 → **3.499** / **8 min 20 s** |
| Noise 主榜 Track 3 | val **3.211** / **约 2 h 57 min**（README #5；PR #48） |
| 反传参考（30M README） | Adam + lr cooldown **3.419**；ANVIL II + Adam **3.340** |
| 10M 终局（归档） | Track 1 #14 **3.676** / 35 min；Track 2 #22 **4.186** / **1.6 s** |
| 仍开放 | **#10**（B300 curriculum，约 3.9804；非 H100 官方） |
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

> 模型固定（Track 1/2）：37.7M GPT，最终权重必须严格载入 `utils/model.py`。数据固定：FineWeb 子集 `data/train.pt`（**现为 30M token**：14,648 条 × 2048 预测），至多一个 epoch。评分：`utils/eval.py` 在 `data/val.pt`（1,114,112 预测）上的平均 next-token 交叉熵。硬件：一台 **8×H100**。Track 3 可改 `train/arch/model.py`，但须保持 `utils/eval.py` 接口。[@noise-repo]

> **禁止反向传播**：禁止 autograd（正/反向模式），禁止手写反向。学习信号只能来自前向评估，且对非线性至多走一步。初始化、batch、如何使用前向次数自由。纪录用 PR 提交。

### 两条赛道 {#s3-tracks}

| 赛道 | 目标（30M，现行） |
|---|---|
| Track 1 | 单 epoch 后最低 validation loss（无时间上限） |
| Track 2 | 达到 val loss **3.5** 的最短训练时间 |
| Track 3 | 同 Track 1，但架构可改 |

> 30M README 反传参考：Adam + lr cooldown **3.419**；ANVIL II（块矩阵）+ Adam **3.340**。目标仍写：大幅超过反传。旧 10M 时代 Track 2 目标是 **4.2**；该表见归档。[@noise-repo; @noise-archive-10m]

### 官方榜快照（已合并纪录） {#s3-board}

> 以下为现行 **30M** README（2026-10-29 约 11:05 核对；含同批合并的 Track 2 **#51 / #52**）。数字会变。[@noise-repo; @noise-pr44; @noise-pr45; @noise-pr46; @noise-pr47; @noise-pr48; @noise-pr51; @noise-pr52]

**Track 1（30M，val loss ↓）**

| # | Val | 说明 | 时间 | 贡献者 |
|---|---:|---|---|---|
| 1 | 3.767 | Dust + Adam，24k population，lr cooldown | 5 h 17 min | – |
| 2 | 3.409 | 10M 纪录 #14 配方迁入：Boost → Cut + own queries + exact values + future-token probes + end merge | 约 1 h 43 min | JaydenTeoh, spicylemonade, hoo0681, Lazarus-931, CharlesDDDD, NotDesigned |
| **3** | **3.338** | **沿真实路径的 forward readout 量跨 token 信用；固定 Boost；更低 ANVIL II weight decay** | **56 min** | **CharlesDDDD** |

**Track 2（30M，到 3.5 的时间 ↓）**

| # | Val | 说明 | 时间 | 贡献者 |
|---|---:|---|---|---|
| 1 | 3.409 | 同上配方（迁入） | 约 1 h 43 min | 同上 |
| 2 | 3.499 | 先 identity path，再 Cut-lite（8 rows / update，更快 chain rerun） | 8 min 20 s | RobertTLange |
| 3 | 3.494 | 更短 identity，再 Cut（paired MLP roots；难度分层行序） | 2 min 3 s | conglu1997 |
| **4** | **3.498** | **#3 的 identity，再 Cut（两单根 + fused Gluon chain + overlapped bf16 collectives）** | **22.9 s** | **RobertTLange** |

**Track 3（30M，开放架构）**

| # | Val | 说明 | 时间 | 贡献者 |
|---|---:|---|---|---|
| 1 | 3.767 | Dust + Adam | 5 h 17 min | – |
| 2 | 3.409 | 同上配方 | 约 1 h 43 min | 同上 |
| 3 | 3.378 | embedding 上 quarter-turn previous-token tap；exact future-token probes | 3 h 50 min | dylantirandaz |
| 4 | 3.358 | 6 blocks + hashed n-gram tables；moment-form probes | 27 min | Euraba |
| **5** | **3.211** | **12×1024 GPT + hashed n-gram value embeddings；Cut-lite + input-key probes** | **约 2 h 57 min** | **RobertTLange** |

> Track 1：无反传 **3.338** 已低于反传 Adam **3.419**，也低于 ANVIL II + Adam **3.340**。Track 3：榜首 **3.211**，相对反传参考差距更大（架构已放开）。Track 2：现官方短墙钟为 PR **#52** 的 **22.9 s**（README val **3.498**；PR 自报 **3.4976**）；#51 为中间条目 **3.494 / 2 min 3 s**；#44 为 **3.499 / 8 min 20 s**。

**10M 归档终局（不再收新提交）** [@noise-archive-10m]

| 赛道 | 终局 | 说明 |
|---|---|---|
| Track 1 #14 | **3.676** / 35 min | PR #40 end merge（CharlesDDDD）；其前 #13 first-hop 为 3.707 / 12 h（PR #35） |
| Track 2 #22 | **4.186** / **1.6 s** | PR #42（在 #41 的 1.66 s 上再调 batch）；#21 为 1.7 s（PR #41） |
| 反传参考（10M） | Adam **3.769**；SGD **5.007** | 仅对照旧设定 |

::: {.warning title="关闭的 PR 不是纪录"}
Relay 族（#20/#21/#22）与 CutBI（#17）已关闭未合并。作者自报数字**不要**当作官方纪录。见 §6。现仍开放：**#10**（B300 curriculum，非官方 H100）。
:::

## 4. Boost → Cut：关键基线（已被后续纪录压过） {#s4}

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

## 6. PR 裁定与仍开放项 {#s6}

> 2026-10-20 约 10:14–10:25（台北）：维护者关闭 Relay 族，并合并 Own queries 与早期 Track 2 压时间条目。到 2026-10-22 白天：PR #23 → 10M Track 1 #11；Future-token probes → #12；Track 2 刷到 **2.5 s**。**同日晚间到次日凌晨（UTC）**：合并 **#35 / #40 / #41 / #42**，并把主赛切到 **30M**（旧表进 `archive/10M/`）。下列以 GitHub / README 为准。[@noise-pr20; @noise-pr23; @noise-repo; @noise-archive-10m]

### 已合并（写入 README） {#s6-merged}

| PR / README | 作者 | 官方结果 | 备注 |
|---|---|---|---|
| **#19** Own queries | hoo0681（+ Lazarus-931） | 10M Track 1 #10：val **3.896** / 约 10 min | 2026-10-20 约 10:25 合并 |
| **#16** Identity-path | Lazarus-931 | 10M Track 2 #7：val **4.176** / **83 s** | 同日合并；后续 10M Track 2 已远快于此 |
| **#23** value path | CharlesDDDD | 10M Track 1 #11：val **3.777** / 约 **18 min** | 2026-10-20 约 19:06 合并 |
| Future-token probes | NotDesigned | 10M Track 1 #12：val **3.722** / 约 **1 h 22 min** | 曾低于 10M 反传 Adam **3.769** |
| Faster credit kernels | Euraba | 10M Track 2 #20：val **4.184** / **2.5 s** | 10M 中段纪录 |
| **#35** first hop + VQ | hoo0681 | 10M Track 1 #13：val **3.707** / 约 12 h 34 min | 2026-10-22 约 02:38 合并（归档写 3.707）[@noise-pr35] |
| **#40** end merge | CharlesDDDD | 10M Track 1 #14：val **3.676** / **35 min** | 2026-10-22 约 03:21 合并；成为 10M 终局，并迁入 30M 主榜配方 [@noise-pr40] |
| **#41** faster update | RobertTLange | 10M Track 2 #21：val **4.185** / **1.7 s** | 同批合并 [@noise-pr41] |
| **#42** 16 rows / 250 updates | areu01or00 | 10M Track 2 #22：val **4.186** / **1.6 s** | 同批合并；10M Track 2 终局 [@noise-pr42] |
| 30M 主榜（迁入） | 多方 | Track 1/3 **3.409** / 约 1 h 43 min；Track 2 表上同条为 #1 | 10M #14 配方迁到 30M |
| **#44** identity → Cut-lite | RobertTLange | 30M Track 2：**3.4988** / **约 8.3 min**（README **3.499** / **8 min 20 s**） | 台北 2026-10-24 约 07:54 合并；相对迁入配方约 ×12.3 更快 [@noise-pr44] |
| **#46** forward cross-token readout | CharlesDDDD | 30M Track 1 #3：**3.338** / **56 min** | 台北 2026-10-26 约 23:58 合并；低于反传 ANVIL II + Adam **3.340** [@noise-pr46] |
| **#45** quarter-turn + exact future probes | dylantirandaz | 30M Track 3 #3：**3.378** / **3 h 50 min** | 同批合并 [@noise-pr45] |
| **#47** 6 blocks + hashed n-gram tables | Euraba | 30M Track 3 #4：**3.358** / **27 min** | 同批合并；表项约 336M，README 未设参数上限 [@noise-pr47] |
| **#48** 12×1024 + n-gram value embeddings | RobertTLange | 30M Track 3 #5：**3.211** / **约 2 h 57 min** | 同批合并；现 Track 3 榜首 [@noise-pr48] |
| **#51** identity → paired MLP roots Cut | conglu1997 | 30M Track 2 #3：**3.494** / **2 min 3 s**（PR 自报 **3.4943** / **123.2 s**） | 台北 2026-10-29 约 06:42 合并；相对 #44 约 ×4.1 更快 [@noise-pr51] |
| **#52** #51 identity → 两单根 + fused Gluon | RobertTLange | 30M Track 2 #4：**3.498** / **22.9 s**（PR 自报 **3.4976** / **22.89 s**） | 同批合并；相对 #44 约 ×21.8 更快；现 Track 2 短墙钟 [@noise-pr52] |

### 已关闭未合并 {#s6-closed}

| PR | 作者 | 自报 | 关闭原因（摘要） |
|---|---|---|---|
| **#20** Relay | erodola | Track 1 **3.7044** / **147 s**；自称对齐同设定反传约 **3.712** | 维护者：按上层估计向下链式传信用，重新引入端到端可微假设；对含不可微部件的网络不通用。**不合并**。 |
| #21 | erodola | Track 2 **4.1686** / **68.4 s** | 同族，关闭 |
| #22 Fast-Relay | isaac0804 | Track 2 **4.0731** / **41.0 s** | 同族，关闭 |
| #17 CutBI | Euraba | Track 1 **3.728** | 作者自关：深度反向归纳接近手写反传 |
| #31 | NotDesigned | Track 1 **3.719**（2× RTX 5090） | 关闭；官方 10M #12 写 3.722 / 1 h 22 min（8×H100 设定） |

> Relay 作者曾争辩：不对非线性做解析转置雅可比，故不是 reverse-mode autodiff。维护者裁定仍不合并。**自报数字不当纪录。**[@noise-pr17]

### 仍开放 {#s6-open}

| PR | 作者 | 自报 | 备注 |
|---|---|---|---|
| #10 | yanghu819 | Track 1 约 **3.9804**（短到长 context curriculum） | 硬件为 **8×B300**；未声称官方 H100 纪录。相对现行 Track 1 **3.338** 仍高很多。 |

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
- 30M 设定下反传的墙钟：Q Labs **未公布**（只给了 val）。
- Boost → Cut 在 243M 的终配：草稿写 pending。
- 维护者承诺澄清的规则边界（块间信用传递 / 不可微部件）：**待 README 再更新**（30M README 已写「精神裁定」）。
- 30M Track 2 官方短墙钟：PR **#52**（RobertTLange）于台北 2026-10-29 约 06:42 合并，README **3.498 / 22.9 s**。同批合并 **#51**（conglu1997）为中间条目 **3.494 / 2 min 3 s**。#44 仍在表上为 **3.499 / 8 min 20 s**。[@noise-pr44; @noise-pr51; @noise-pr52]
- 30M Track 1：PR **#46** 已于台北 2026-10-26 约 23:58 合并，官方 **3.338 / 56 min**。[@noise-pr46]
- 30M Track 3：同批合并 **#45 / #47 / #48**；现榜首 **3.211 / 约 2 h 57 min**（#48）。[@noise-pr45; @noise-pr47; @noise-pr48]
- Track 3 参数上限：README 仍未写硬上限；#47 表项约 336M 已入榜。后续规则是否收紧：**待观察**。
- 「不用 Adam」那段记忆原文：若有截图 / 长文 / 播客线索，可再挖。

### 主要入口 {#s8-links}

- [Dust 论文](https://qlabs.sh/research/dust/) · [Dust 代码](https://github.com/qlabs-eng/dust)
- [Noise](https://qlabs.sh/noise/) · [Noise 仓库](https://github.com/qlabs-eng/noise) · [10M 归档](https://github.com/qlabs-eng/noise/blob/main/archive/10M/README.md)
- [Boost → Cut](https://github.com/spicylemonade/boost-cut) · [作者帖](https://x.com/spicey_lemonade/status/2111636408540799141)
- [PR #40](https://github.com/qlabs-eng/noise/pull/40)（已合并，10M #14 / 30M 配方来源） · [PR #42](https://github.com/qlabs-eng/noise/pull/42)（已合并，10M Track 2 1.6 s） · [PR #44](https://github.com/qlabs-eng/noise/pull/44)（已合并，30M Track 2 约 8.3 min） · [PR #46](https://github.com/qlabs-eng/noise/pull/46)（已合并，Track 1 3.338 / 56 min） · [PR #45](https://github.com/qlabs-eng/noise/pull/45)（已合并，Track 3 3.378） · [PR #47](https://github.com/qlabs-eng/noise/pull/47)（已合并，Track 3 3.358 / 27 min） · [PR #48](https://github.com/qlabs-eng/noise/pull/48)（已合并，Track 3 3.211） · [PR #51](https://github.com/qlabs-eng/noise/pull/51)（已合并，Track 2 3.494 / 2 min 3 s） · [PR #52](https://github.com/qlabs-eng/noise/pull/52)（已合并，Track 2 3.498 / 22.9 s）
- [PR #41](https://github.com/qlabs-eng/noise/pull/41) · [PR #35](https://github.com/qlabs-eng/noise/pull/35)（均已合并进 10M 归档）
- [Relay PR #20](https://github.com/qlabs-eng/noise/pull/20) · [作者帖](https://x.com/EmanueleRodola/status/2112218292634939901)
- [Cammarata 文章](https://www.goodfire.com/research/already-clean)
