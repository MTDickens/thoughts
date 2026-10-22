---
title: Dust / Noise：无反向传播预训练与 Boost → Cut
slug: dust-noise-zo
short: Dust / Noise
description: Q Labs 的 Dust 与 Noise、Boost → Cut 加速、bitter lesson 相关原话、以及零阶优化的学术背景。只记已核实事实。
chips: [Dust, Noise, "Track 1 3.722", "Track 2 2.5 s", "开放 #41 1.66 s", 零阶优化]
order: 50
updated: 2026-10-22
---

依据 Q Labs 论文与仓库、Noise 榜与 PR、Boost → Cut 作者帖与草稿论文、相关 X 原话。时间一律标台北时间（UTC+8）。榜单与开放 PR 会变；本文快照到 2026-10-22 约 18:00。

## 1. 一句话结论 {#s1}

> Dust 用激活扰动估计信用，不用反向传播。Noise 是固定设定下的无反传竞速赛。相对上午约 11:25 快照，**官方已合并榜未变**。**Track 1 官方纪录**仍为 Future-token probes（val **3.722**，约 **1 h 22 min**；README #12，@NotDesigned），仍低于 README 反传 Adam 参考 **3.769**。**Track 2 官方纪录**仍为 Faster credit kernels + bf16 权重梯度（val **4.184**，**2.5 s**；README #20）。新开放：PR **#41**（@RobertTLange，自称 Track 2 **4.185** / **1.66 s**，在 #39 上再加速更新；尚未合并）。仍开放：PR **#40**（CharlesDDDD，自称 Track 1 **3.676** / **35 min**）、PR **#35**（hoo0681，自称 **3.736** / 12 h，**8×H200**）、PR **#10**（B300 curriculum）。Relay / CutBI 族仍关闭未合并。

| 项 | 状态（2026-10-22 约 18:00） |
|---|---|
| Dust 论文 | [qlabs.sh/research/dust](https://qlabs.sh/research/dust/)，无 arXiv 编号 |
| Noise 官方榜 Track 1 | Future-token probes，val **3.722**，约 1 h 22 min（README #12） |
| Noise 官方榜 Track 2 | Faster credit kernels，val **4.184**，**2.5 s**（README #20） |
| 反传参考（README） | SGD **5.007**；Adam + lr cooldown **3.769** |
| PR #23 value path | **已合并**为 Track 1 #11：val **3.777** / 约 18 min（标题从 3.830/829 s 改到 3.777/1071 s）[@noise-pr23] |
| PR #20 Relay | 自称 val **3.7044** / **147 s**；**关闭（未合并）** |
| 仍开放 | **#41** 自称 Track 2 4.185 / 1.66 s；**#40** 自称 3.676 / 35 min；**#35** 自称 3.736（8×H200）；**#10** B300 curriculum |
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

> 以下为 README 已合并条目（2026-10-22 约 11:25 核对）。数字会变。[@noise-repo]

**Track 1（val loss ↓）**

| # | Val | 说明 | 时间 | 贡献者 |
|---|---:|---|---|---|
| 1 | 5.954 | EGGROLL + Adam，128k antithetic | 5 h 20 min | – |
| … | … | 中间若干工程改进 | … | … |
| 9 | 3.945 | Boost → Cut | 约 8 min | @spicylemonade |
| 10 | 3.896 | Own queries in Cut（PR #19） | 约 10 min | @hoo0681, @Lazarus-931 |
| 11 | 3.777 | Exact values + value path in Cut（PR #23） | 约 18 min | @CharlesDDDD |
| **12** | **3.722** | **Future-token probes，input-path key/gate credit** | **约 1 h 22 min** | **@NotDesigned** |

> README 反传 Adam 参考是 **3.769**。官方 Track 1 纪录 **3.722** 已低于该参考。

**Track 2（到 4.2 的时间 ↓）**

| # | Val | 说明 | 时间 | 贡献者 |
|---|---:|---|---|---|
| 1 | 4.167 | Dust + Adam | 1 h 46 min | – |
| … | … | … | … | … |
| 7 | 4.176 | Identity-path credit（PR #16） | 1 min 23 s | @Lazarus-931 |
| … | … | 随后多轮 JAX / 结构化起点 / moment kernels | … | … |
| 19 | 4.184 | 400 updates，重调 rates | 2.7 s | @erodola |
| **20** | **4.184** | **Faster credit kernels，bf16 权重梯度** | **2.5 s** | **@Euraba** |

::: {.warning title="关闭的 PR 不是纪录"}
Relay 族（#20/#21/#22）与 CutBI（#17）已关闭未合并。作者自报数字**不要**当作官方纪录。见 §6。开放中的 #40/#35/#10 也还不是纪录。
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

> 2026-10-20 约 10:14–10:25（台北）：维护者关闭 Relay 族，并合并 Own queries 与早期 Track 2 压时间条目。此后到 2026-10-22：PR #23 合并为 Track 1 #11；Future-token probes 写入 #12；Track 2 连刷到 **2.5 s**。下列以 GitHub / README 为准。[@noise-pr20; @noise-pr23; @noise-repo]

### 已合并（写入 README） {#s6-merged}

| PR / README | 作者 | 官方 README 结果 | 备注 |
|---|---|---|---|
| **#19** Own queries | hoo0681（+ Lazarus-931） | Track 1 #10：val **3.896** / 约 10 min | 2026-10-20 约 10:25 合并 |
| **#16** Identity-path | Lazarus-931 | Track 2 #7：val **4.176** / **83 s** | 同日合并；后续 Track 2 已远快于此 |
| **#23** value path | CharlesDDDD | Track 1 #11：val **3.777** / 约 **18 min** | 2026-10-20 约 19:06 合并；标题从 3.830/829 s 改为 3.777/1071 s |
| Future-token probes | NotDesigned | Track 1 **#12**：val **3.722** / 约 **1 h 22 min** | 当前 Track 1 官方纪录；低于反传 Adam **3.769** |
| Faster credit kernels | Euraba | Track 2 **#20**：val **4.184** / **2.5 s** | 当前 Track 2 官方纪录 |

### 已关闭未合并 {#s6-closed}

| PR | 作者 | 自报 | 关闭原因（摘要） |
|---|---|---|---|
| **#20** Relay | erodola | Track 1 **3.7044** / **147 s**；自称对齐同设定反传约 **3.712** | 维护者：按上层估计向下链式传信用，重新引入端到端可微假设；对含不可微部件的网络不通用。**不合并**。 |
| #21 | erodola | Track 2 **4.1686** / **68.4 s** | 同族，关闭 |
| #22 Fast-Relay | isaac0804 | Track 2 **4.0731** / **41.0 s** | 同族，关闭 |
| #17 CutBI | Euraba | Track 1 **3.728** | 作者自关：深度反向归纳接近手写反传 |
| #31 | NotDesigned | Track 1 **3.719**（2× RTX 5090） | 关闭；官方 #12 写 3.722 / 1 h 22 min（8×H100 设定） |

> Relay 作者曾争辩：不对非线性做解析转置雅可比，故不是 reverse-mode autodiff。维护者裁定仍不合并。**自报数字不当纪录。**[@noise-pr17]

### 仍开放 {#s6-open}

| PR | 作者 | 自报 | 备注 |
|---|---|---|---|
| **#41** | RobertTLange | Track 2 val **4.185** / **1.66 s**（8×H100） | 2026-10-22 约 16:23 开放。跟进已合并的 #39：同估与同常数，换更快更新（内核更少 launch、eager glue 编译掉、双 all-to-all 重叠、bf16 梯度栈）。同作业里 #39 约 2.44 s。若合并，将压过官方 2.5 s。[@noise-pr41] |
| **#40** | CharlesDDDD | Track 1 val **3.676** / **35 min**（8×H100） | 2026-10-22 约 10:47 开放。在 #12 测量上加 GPU 分片与 end merge（仅前向）。若合并，将压过 3.722。@NotDesigned 已问 floor 与 merge 消融；作者回了表。[@noise-pr40] |
| **#35** | hoo0681 | Track 1 val **3.736** / 约 12 h（**8×H200**） | 自称相对 #23 初版增益；硬件不是规则里的 8×H100；且 3.736 **高于** 当前官方 3.722；`mergeable_state: dirty`。[@noise-pr35] |
| #10 | yanghu819 | Track 1 约 **3.9804**（短到长 context curriculum） | 硬件为 **8×B300**；未声称官方 H100 纪录。 |

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
- 维护者承诺澄清的规则边界（块间信用传递 / 不可微部件）：**待 README 更新**。
- Own queries 在 8×H100 上的正式墙钟：作者自报 H200；README 写约 10 min。
- **PR #41** 是否合并（自称 Track 2 4.185 / 1.66 s）：**待裁定**。
- **PR #40** 是否合并（自称 3.676 / 35 min）：**待裁定**。
- **PR #35** 在 8×H100 上能否复现、是否合规：**待裁定**。
- 「不用 Adam」那段记忆原文：若有截图 / 长文 / 播客线索，可再挖。

### 主要入口 {#s8-links}

- [Dust 论文](https://qlabs.sh/research/dust/) · [Dust 代码](https://github.com/qlabs-eng/dust)
- [Noise](https://qlabs.sh/noise/) · [Noise 仓库](https://github.com/qlabs-eng/noise)
- [Boost → Cut](https://github.com/spicylemonade/boost-cut) · [作者帖](https://x.com/spicey_lemonade/status/2111636408540799141)
- [PR #41 Track 2 1.66 s](https://github.com/qlabs-eng/noise/pull/41) · [PR #40 Track 1 3.676](https://github.com/qlabs-eng/noise/pull/40)
- [Relay PR #20](https://github.com/qlabs-eng/noise/pull/20) · [作者帖](https://x.com/EmanueleRodola/status/2112218292634939901)
- [PR #23 value path](https://github.com/qlabs-eng/noise/pull/23)（已合并为 Track 1 #11，3.777）
- [PR #40 Noise with merge](https://github.com/qlabs-eng/noise/pull/40)（开放，自称 3.676）
- [Cammarata 文章](https://www.goodfire.com/research/already-clean)
