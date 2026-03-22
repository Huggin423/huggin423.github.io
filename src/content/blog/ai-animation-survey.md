---
title: 'AI 生成动画技术调查：SVG 与 Spine'
pubDate: 2026-03-18
description: '调查当前 AI 生成结构化动画数据（SVG 动画、Spine 骨骼动画）的主要技术路线，对比各方法的原理、优劣与工程可行性。'
tags: ['AI', 'Animation', 'SVG', 'Spine', 'Survey']
category: 'Tech Talk'
---

## 背景与问题定义

AI 生成动画，本质上不是生成像素帧序列（光栅视频），而是生成能被动画引擎解析和渲染的**结构化数据文件**。这类格式通常是 JSON、XML 或专有二进制格式，描述了动画的骨骼、关键帧、变换参数等语义信息，具备可编辑性和可缩放性。

常见的结构化动画格式包括：

| 格式 | 文件类型 | 渲染方式 | 主要应用场景 |
|------|----------|----------|-------------|
| Lottie | JSON | 矢量逐帧 | UI 动效、插图动画 |
| SVG Animation | XML + CSS/JS | 矢量路径变形 | Web 动效 |
| Spine | 二进制/JSON | 骨骼蒙皮 | 游戏角色动画 |
| 3D (GLTF/FBX) | 二进制/JSON | 3D 骨骼+网格 | 游戏、影视 |

本文聚焦 **SVG 动画** 和 **Spine 骨骼动画** 这两种格式，调查当前 AI 生成这类数据的技术路线。

---

## 一、SVG 动画

### 1.1 格式结构简介

SVG（Scalable Vector Graphics）是基于 XML 的矢量图形格式。SVG 动画通过以下几种机制实现：

- **SMIL（Animate 标签）**：在 SVG 内部用 `<animate>`、`<animateTransform>` 等标签定义关键帧，浏览器原生渲染。
- **CSS Animation**：通过 `@keyframes` 控制 SVG 元素的样式属性变化。
- **JavaScript（GSAP/anime.js 等）**：用脚本驱动 SVG 属性插值，灵活性最高但与格式强耦合。

SVG 动画的核心结构可以概括为：

```
SVG
├── <defs>（可复用定义：渐变、遮罩、滤镜）
├── <g>（图层/分组）
│   ├── <path d="...">（贝塞尔路径，核心几何元素）
│   ├── <circle>、<rect> 等基本形状
│   └── <animate> / <animateTransform>（关键帧）
└── ...
```

生成难点：
- `<path d="...">` 的路径字符串（SVG path data）语义密度极高，一条复杂路径可能有数百个控制点，模型难以精确生成。
- 动画关键帧与几何形状强耦合，稍有偏差就会产生拓扑错误（路径扭曲、穿插）。

### 1.2 当前 AI 生成方法

#### 方法一：LLM 直接生成 SVG 代码

**代表工作**：GPT-4o 直接输出 SVG XML 
**原理**：将 SVG 作为文本序列，利用大模型的代码生成能力直接输出 XML。

**优点**：
- 零训练成本，直接可用
- 支持自然语言描述驱动

**缺点**：
- LLM 对 SVG 的路径坐标容易产生"坐标幻觉"（coordinate hallucination），数值精度极差
- 现有 LLM 上下文长度有限，处理超过 10k token 的复杂 SVG 时容易截断失败
- 路径结构冗余、无法生成分层语义清晰的复杂 SVG

---

#### 方法二：基于优化的矢量化方法（Optimization-based）

**代表工作**：
- DiffVG
- LIVE
- VTracer · [官方文档](https://www.visioncortex.org/vtracer-docs)
- VectorFusion · [arXiv:2211.11319](https://arxiv.org/abs/2211.11319)
- SVGDreamer · [arXiv:2312.16476](https://arxiv.org/abs/2312.16476)

**原理**：以 DiffVG 为基础，利用可微分光栅化器将 SVG 渲染为位图，再通过梯度回传迭代优化贝塞尔控制点和颜色参数。VectorFusion 和 SVGDreamer 进一步引入文本引导：

- **VectorFusion**：将 Score Distillation Sampling (SDS) 扩展到开源 Latent Diffusion 模型，通过 SDS Loss 将文本对齐信号注入 SVG 路径优化循环，并用 path reinitialization 防止退化。初始化阶段先生成一张光栅参考图，再以此为起点优化。
- **SVGDreamer**：针对 VectorFusion 的过平滑、颜色过饱和、多样性不足问题，提出 VPSD（Vectorized Particle-based Score Distillation）——将 SVG 建模为控制点和颜色的**分布**而非常量，并引入奖励模型对粒子重加权。同时提出 SIVE（语义驱动图像矢量化），利用扩散模型的 cross-attention map 初始化控制点，实现前景/背景分离，提升可编辑性。

**优点**：
- 无需 SVG 训练数据，从单张图重建效果好
- VectorFusion / SVGDreamer 支持文本条件生成，风格多样（图标、像素艺术、线稿）
- SVGDreamer 的 SIVE 支持对前景对象单独编辑

**缺点**：
- 计算开销极大（DiffVG 约 322k token 等价序列，VectorFusion 约 66k，SVGDreamer 约 132k），不适合批量生成
- 输出路径无结构、锚点冗余，可编辑性差（尽管 SVGDreamer 有改善）
- 过优化会导致路径缠绕、颜色过饱和
- 只适用于静态 SVG，不支持动画生成

---

#### 方法三：结构化编码 + 自回归生成（OmniSVG）

**代表工作**：
- OmniSVG（NeurIPS 2025，复旦大学 & StepFun）· [arXiv:2504.06263](https://arxiv.org/abs/2504.06263)
- StarVector（Stability AI 等）· [arXiv:2312.11556](https://arxiv.org/abs/2312.11556)
- IconShop（香港城市大学）· [arXiv:2304.14400](https://arxiv.org/abs/2304.14400)
- Chat2SVG（香港城市大学）· [arXiv:2411.16602](https://arxiv.org/abs/2411.16602)

**各工作的核心差异**：

**IconShop**：最早的自回归 SVG 图标生成方法之一。将 SVG 简化为三种指令（M/L/C），将路径和文本描述 tokenize 后用 Transformer 做 next-token prediction。仅支持单色图标（monochrome icon），不支持彩色和复杂插画。

**Chat2SVG**：混合框架，分两阶段：①先用 LLM（GPT-4）从基本几何图元生成一个有语义的 SVG 模板（Template Generation）；②用 SDEdit + ControlNet 对模板光栅化图像做细节增强，生成 target image；③再用双阶段优化（Latent Optimization + Point Optimization）将 SVG 路径对齐到 target image。本质是"LLM 生成骨架 + 扩散模型补充细节 + 优化对齐"的三段式流程。支持自然语言编辑指令。

**StarVector**：Image-to-SVG 为主要任务，架构为 CLIP ViT 图像编码器 + StarCoder LLM，直接输出原始 SVG XML 代码（非参数化 token，而是直接生成 `<path d="M...">` 字符串）。提供 1B（StarCoder-1B + ViT-B/32）和 8B（StarCoder2-7B + SigLip）两个版本，8B 版本上下文窗口 16k。训练数据约 400 万 SVG（含文字描述和配对 caption）。局限是直接生成原始 SVG XML 字符串，对复杂图形序列长度容易超出上下文限制。

**原理**：不直接生成原始 SVG XML，而是将 SVG 参数化为紧凑的离散 token 序列，再以预训练多模态大模型（VLM）为骨干做自回归生成。与 OmniLottie 的核心思路一致。

OmniSVG 的具体做法：

1. **SVG 简化**：使用 picosvg 将所有 SVG 属性（group、transform 等）去除，统一为 5 种原子路径指令：M（MoveTo）、L（LineTo）、C（Cubic Bézier）、A（Elliptical Arc）、Z（ClosePath），以及 F（Fill，颜色）。

2. **坐标参数化**：将 2D 坐标 `(x, y)` 合并为单个 token：$\text{token} = x \times w + y$，大幅缩短序列长度。颜色（Hex）同样通过特殊 token 编码，与坐标 token 区间分离。

3. **路径展平**：将分层 SVG 的多条路径拼接为一个扁平的命令序列，首尾加 `<SOP>` 和 `<EOS>` 标记。

4. **VLM 骨干**：以 Qwen2.5-VL 为基础，新增 4 万个 SVG 专属词表（原始 VLM 词表约 15 万），通过可学习 Embedding 层将 SVG token 提升到与文本/图像相同的表示空间。

5. **多模态条件生成**：支持 Text-to-SVG、Image-to-SVG、Character-Reference SVG 三种任务，训练目标为标准 next-token prediction：
$$
\theta^* = \arg\max_{\theta} \prod_{i=1}^{L} P(x_{s,i} \mid x_{s,<i}, x_c)
$$

**数据集**：MMSVG-2M，共 200 万标注 SVG 资产，涵盖：
- **MMSVG-Icon**：来自 Iconfont 的图标
- **MMSVG-Illustration**：来自 IconScout 的插画
- **MMSVG-Character**：来自 Freepik 的动漫角色（部分合成）

**评测基准**：MMSVG-Bench，覆盖 Text-to-SVG（FID、CLIP Score、Aesthetic、HPS）和 Image-to-SVG（DINO Score、SSIM、LPIPS、MSE）。

**量化结果**（MMSVG-Icon，Text-to-SVG）：

| 方法 | Token数 | FID↓ | CLIP↑ | Aesthetic↑ |
|------|---------|------|-------|-----------|
| VectorFusion | 66.2k | 250.77 | 0.240 | 4.76 |
| SVGDreamer | 132.0k | 308.94 | 0.207 | 4.26 |
| Chat2SVG | 0.6k | 190.87 | 0.299 | 4.41 |
| IconShop | 2.0k | 213.28 | 0.288 | 4.55 |
| **OmniSVG (4B)** | **3.8k** | **130.56** | 0.276 | **4.60** |

**优点**：
- 序列长度极短（约 3.8k token），生成效率远优于优化方法
- 支持多模态输入，Text-to-SVG / Image-to-SVG 均可
- 可生成超过 30k token 的复杂 SVG（如动漫角色）
- 输出路径有语义结构，可编辑性强

**缺点**：
- 复杂样本推理仍需生成数万 token，速度较慢
- 目前为**静态 SVG 生成**，不支持动画时序（OmniLottie 做了从静态 SVG 扩展到 Lottie 动画的桥接，思路可参考）
- 仅支持矢量风格图片作为 Image-to-SVG 输入，对自然图片效果差
- 训练数据依赖，需要大量高质量 SVG 语料

---

#### 方法四：SVG 动画专项生成（VLM + CSS/JS 驱动）

> 以下三个方向是 2025 年集中出现的新成果，专注于 **SVG 动画**（而不仅是静态 SVG 生成），是与调查最直接相关的部分。

---

**4a. Vector Prism（2025.12，KAIST）· [arXiv:2512.14336](https://arxiv.org/abs/2512.14336)**

**核心问题**：SVG 文件为渲染效率优化，视觉上同属一个部件的元素往往被拆分为多个低层次 `<path>` 节点（例如手臂可能有数十个 path），VLM 直接处理时无法识别哪些元素应该联动，导致动画破碎。

**方法**（三步）：
1. **多视角弱预测**：用 M 种不同渲染方式（高亮、裁剪、孤立背景等）分别展示同一 path 元素，让 VLM 预测其语义标签，得到 M 个噪声预测
2. **统计聚合（Dawid-Skene 模型）**：通过两两预测的一致性矩阵估计每种渲染方式的可靠度 $p_i$，再用加权投票（$w_i = \log\frac{(k-1)\hat{p}_i}{1-\hat{p}_i}$）融合，得到稳定的语义分组标签
3. **重组 + 动画生成**：按语义分组重新组织 SVG 结构，再交由 VLM 为每个语义组生成 CSS/JS 动画代码

**意义**：论文的核心发现是：SVG 动画的瓶颈不在"代码生成能力"，而在"语义结构恢复"——只要解决了分组问题，现有 VLM 的代码生成能力已经足够。

---

**4b. Decomate（NeurIPS 2025 Workshop）· [arXiv:2511.06297](https://arxiv.org/abs/2511.06297)**

**定位**：面向 UI/UX 设计师的**协作式** SVG 动画系统（Co-Creative），强调低门槛和迭代精炼，而非端到端全自动。

**工作流**：
1. **语义分解**：MLLM 分析原始 SVG，将无结构的 path 重组为语义有意义的"可动画组件"（与 Vector Prism 思路相近，但实现更轻量）
2. **运动指定**：系统为每个组件推荐运动提示词，设计师通过自然语言修改/确认
3. **动画生成**：输出 production-ready 的 HTML/CSS/JS 动画代码，支持多轮对话式精炼

**与 Vector Prism 的核心区别**：Vector Prism 聚焦语义分组算法的精确度（学术方向）；Decomate 聚焦设计工作流集成（工程/HCI 方向），输出更接近实际可部署的产品形态。


---

**4c. MoVer（SIGGRAPH 2025，Stanford）· [arXiv:2502.13372](https://arxiv.org/abs/2502.13372)**

**定位**：不改进生成模型，而是在生成之外建立**程序化验证层**，对 LLM 生成的 SVG 动画做可执行的正确性检查。

**MoVer DSL**：基于一阶逻辑，定义了一套描述动画时空属性的谓词系统，包括：
- **对象谓词**：`shp(o, "circle")`、`clr(o, "orange")`、`id(o, "H")`
- **运动谓词**：`type(m, "trn")`（平移）、`dir(m, "cw")`（顺时针）、`mag(m, 90)`（幅度90度）
- **时序谓词**：支持 Allen 区间代数的 13 种时序关系（before/during/overlaps 等）
- **后置条件**：`post(m, spatial_relation)`（运动结束后的空间关系）

**验证 Pipeline**：
1. LLM 根据文本 prompt 同时生成 SVG 动画和对应的 MoVer 验证程序
2. 执行引擎对动画运行 MoVer 程序，输出每条谓词的 true/false 验证报告
3. 将验证报告自动反馈给 LLM，驱动其修正动画
4. 迭代至所有谓词通过或达到上限

**量化结果**：5600 条测试 prompt，无迭代 58.8% 通过，最多 50 次迭代后 **93.6%** 通过。

**意义**：这是一种"测试驱动的动画生成"方法，思路独立于具体生成模型，可以套在任何 LLM 上。核心贡献是 DSL 的设计和执行引擎，而非模型本身。

**效果截图**：（待补充）

---

#### 方法五：InternSVG——统一 SVG 理解/编辑/生成（含动画）

**代表工作**：InternSVG（ICLR 2026，上海交大 & 上海AI实验室 & 南京大学等）· [arXiv:2510.11341](https://arxiv.org/abs/2510.11341)

**这是目前已知唯一同时支持 SVG 动画生成与理解/编辑的统一自回归模型**。

**三大核心贡献**：

**① SAgoge 数据集**：目前规模最大、领域最全的 SVG 多模态数据集，覆盖：
- Icons（图标）
- Long-sequence Illustrations（长序列插画）
- Scientific Diagrams（科学图表/化学结构图）
- **Dynamic Animations（动态 SANI 动画）** ← MMSVG-2M 不包含这一类

任务分布：SVG 理解（描述、多选问答）、SVG 编辑（低级颜色修改、高级语义编辑）、SVG 生成（Text-to-SVG、Image-to-SVG、**Video-to-SANI**）

**② SArena 评测基准**：基于 SAgoge，覆盖上述所有任务，是目前最完整的 SVG 综合评测体系。

**③ InternSVG 模型**：
- 以 MLLM 为骨干（具体骨干未在摘要中披露，待精读确认）
- 使用 SVG-specific special tokens + subword-based embedding initialization
- **两阶段训练**：阶段一从短静态 SVG 建立基础能力，阶段二引入长序列插画和复杂动画，利用正向迁移（positive transfer）提升整体性能
- 统一建模使理解能力反哺生成能力

**与 OmniSVG 的关键区别**：

| | OmniSVG | InternSVG |
|---|---|---|
| 发表 | NeurIPS 2025 | ICLR 2026 |
| 任务 | 静态 SVG 生成 | 理解 + 编辑 + 生成（含动画） |
| 数据集 | MMSVG-2M（静态） | SAgoge（含动画） |
| 优势 | 静态生成质量最高 | 通才，唯一支持动画生成 |

---

#### 方法六：VectorTalker——音频驱动 SVG 人脸动画

**代表工作**：VectorTalker（西安交通大学 & 蚂蚁集团 & 清华大学）· [arXiv:2312.11568](https://arxiv.org/abs/2312.11568)

**任务**：单张人像图 + 语音音频 → 矢量风格 talking head 动画（one-shot audio-driven）

**两阶段方法**：

**阶段一：Progressive Vectorization（渐进式矢量化）**
- 核心思路：coarse-to-fine 重建，先用 N 级图像平滑构建一个图像金字塔，从最模糊（大结构）开始逐层精化到最清晰（细节）
- 避免了随机初始化时路径陷入局部最小值（过早收敛到细小结构）的问题
- 输出：高质量 SVG 表示（与 DiffVG/LIVE 相比，结构更清晰）

**阶段二：Landmark-Driven Deformation（关键点驱动变形）**
- 用人脸关键点作为中间运动表示，从音频预测关键点位移
- 关键工程细节：对贝塞尔曲线做**曲线分段（Curve Segmentation）**处理——一条贝塞尔曲线的控制点可能跨越多个三角形网格区域，若直接做三角形仿射变形会导致曲线形状扭曲。分段后每段只受一个三角形控制，保证变形合理性
- 支持日式漫画、卡通、写实三种风格统一处理

**与 Spine 的类比**：VectorTalker 的"关键点 → 路径变形"本质上与 Spine 的"骨骼关键帧 → 蒙皮变形"结构类似，区别在于 VectorTalker 针对人脸定制，且驱动源是音频而非手动关键帧。

**效果截图**：（待补充）

---

#### 方法七：视频转 SVG 动画

**原理**：先用视频生成模型（如 Sora、Wan）生成光栅视频，再通过矢量化（vectorization）和运动轨迹提取将其转为 SVG 动画。

**优点**：
- 可借助成熟的视频生成模型获得高质量运动
- 生成流程相对直接

**缺点**：
- 光栅→矢量转换会丢失语义，路径质量难以保证
- 层次结构（哪些元素是独立动画对象）难以恢复
- 文件体积可能很大

---

## 二、Spine 骨骼动画

### 2.1 格式结构简介

Spine 是游戏行业广泛使用的 2D 骨骼动画工具，其导出格式（`.json` 或 `.skel` 二进制）描述了：

```
Spine JSON
├── bones（骨骼层级树：位置、旋转、缩放）
├── slots（插槽：骨骼绑定的渲染层）
├── skins（换肤数据）
├── animations
│   └── <animation_name>
│       ├── bones（关键帧：rotate/translate/scale）
│       └── slots（关键帧：attachment/color）
└── ...
```

核心概念：
- **骨骼（Bone）**：具有层级父子关系的变换节点，构成骨架。
- **蒙皮（Skin/Attachment）**：绑定到骨骼上的图片区域或网格顶点。
- **关键帧（Keyframe）**：记录某帧下骨骼的变换值，相邻关键帧之间自动插值（支持 Bezier 缓动）。

生成难点：
- 骨骼层级是树状结构，父子变换有级联关系，生成时需保持拓扑合法性。
- 关键帧动画的缓动曲线参数（Bezier 控制点）对动画质感影响极大，且难以用自然语言描述。
- 蒙皮数据（图片绑定、网格权重）与骨骼强耦合，纯生成难以保证美术资产对齐。

### 2.2 当前 AI 生成方法

> **注**：Spine 格式的 AI 生成研究相比 Lottie/SVG 明显更少，目前大部分工作集中在游戏角色动画生成的更广泛领域，Spine 格式的直接支持较为有限。

#### 方法一：LLM 直接生成 Spine JSON

**原理**：类比 LLM 生成代码的方式，直接输出合法的 Spine JSON 结构。

**优点**：无需额外训练，可快速验证

**缺点**：
- Spine JSON 结构复杂，骨骼层级关系模型难以保证正确
- 数值精度问题与 Lottie/SVG 类似
- 无法处理蒙皮资产绑定问题

---

#### 方法二：运动重定向（Motion Retargeting）

**原理**：利用已有的骨骼动画数据（如人体动捕数据、其他格式动画），通过运动重定向技术将动作迁移到 Spine 骨骼上。

**代表技术**：基于 IK（逆向运动学）的重定向、深度学习运动风格迁移
**参考数据集**：AMASS（动捕数据集）· [arXiv:1904.03278](https://arxiv.org/abs/1904.03278)

**优点**：
- 可复用大量现有运动数据
- 动作质量有保障

**缺点**：
- 强依赖源骨架与目标骨架的结构相似性
- 工程集成复杂，通常需要手工配置骨骼映射

---

#### 方法三：视频驱动骨骼动画（Pose Estimation）

**原理**：对输入视频做 2D 姿态估计（如 OpenPose、MediaPipe），提取每帧人体关节点位置，映射为 Spine 骨骼关键帧。

**参考工具**：[OpenPose](https://github.com/CMU-Perceptual-Computing-Lab/openpose) · [MediaPipe Pose](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)

**优点**：
- 可以将任意真人视频转为动画驱动源
- 技术路线相对成熟

**缺点**：
- 仅适用于人形骨骼，非人形角色（四足兽、奇幻生物）支持有限
- 姿态估计误差会传导到动画，需要后处理平滑
- 无法处理遮挡帧

---

#### 方法四：文本/视频条件骨骼动画生成

**代表工作**：
- MDM (Motion Diffusion Model) · [arXiv:2209.14916](https://arxiv.org/abs/2209.14916)
- MotionGPT · [arXiv:2306.14795](https://arxiv.org/abs/2306.14795)
（均针对 3D，但方法可迁移参考）

**原理**：用扩散模型或自回归模型，将文本描述（"向前走三步然后跳跃"）作为条件，直接生成骨骼关键帧序列。目前主流工作在 3D 人体（SMPL 格式），2D Spine 格式的直接支持较少。

**优点**：
- 文本驱动，创作门槛低
- 可生成语义上连贯的动作序列

**缺点**：
- 目前主要针对 3D 人体骨架（SMPL），迁移到 Spine 2D 需要格式适配
- 训练数据稀缺（公开的 Spine 动画数据集几乎没有）


---

#### 方法五：AI 辅助 2D 角色绑定与动画系统（工程方向）

**代表工作**：
- Spiritus（2025.03）· [arXiv:2503.09127](https://arxiv.org/abs/2503.09127)
- HumanRig（2024.12）· [arXiv:2412.02317](https://arxiv.org/abs/2412.02317)

这两个工作代表了工业界/系统层面的方向，与 Spine 最直接相关：

**Spiritus**：
- 输入：自然语言描述
- 流程：AIGC 文生图 → 自动分割 → 分层服装处理 → **动态网格-骨骼绑定** → BVH 动作数据 + 运动扩散模型 → 实时动画
- 关键亮点：集成了 BVH 数据 + motion diffusion model，实现了自然语言到 2D 角色动画的完整链路，并支持角色间动画资源复用
- 这是最接近"从零生成一个可用的 Spine 风格 2D 骨骼角色动画"的工程路径

**HumanRig**（自动绑定）：
- 针对 3D 人形角色的自动骨骼绑定，提供了 11,434 个 T-pose 网格的大规模数据集
- 核心方法：Prior-Guided Skeleton Estimator（PGSE）+ Mesh-Skeleton Mutual Attention Network
- 对 2D Spine 的意义：**自动绑定**（将图片/网格自动生成骨骼层级和蒙皮权重）是 Spine 工作流最耗时的部分，3D 方向的方法论可以向 2D 迁移


---

## 三、横向对比

### SVG 各方法对比（含动画）

| 方法类别 | 代表工作 | 静态SVG质量 | 支持动画 | 动画机制 |
|---------|---------|-----------|---------|---------|
| LLM 直接生成 | GPT-4o | 简单图形尚可 | 间接支持 | 输出 HTML/CSS/JS |
| 优化方法 | DiffVG、VectorFusion、SVGDreamer | 较好 | 不支持 | — |
| 自回归生成（静态） | OmniSVG (4B) | 最优 | 不支持 | — |
| 自回归生成（含动画） | InternSVG | 较好 | **支持** | 训练数据含动画序列 |
| VLM + 语义分组 | Vector Prism | — | **支持** | 语义分组 + VLM 生成 CSS/JS |
| VLM + 交互系统 | Decomate | — | **支持** | 文本指定运动 + 生成 CSS/JS |
| LLM 生成 + 验证迭代 | MoVer Pipeline | — | **支持** | DSL 验证 + 自动修正 |
| 特定场景 | VectorTalker | — | **支持**（人脸） | 音频驱动路径变形 |

### SVG vs Spine 宏观对比

| 维度 | SVG 动画 | Spine 骨骼动画 |
|------|----------|---------------|
| **数据格式** | XML/文本，人可读 | JSON/二进制，结构较复杂 |
| **核心生成难点** | 路径数值精度、坐标幻觉、路径拓扑 | 骨骼层级合法性、关键帧缓动、蒙皮绑定 |
| **LLM 直接生成** | 简单图形可行，复杂 SVG 差 | 骨架结构尚可，动作质量差 |
| **优化方法** | 成熟（DiffVG/VectorFusion），但慢且不支持动画 | 无对应方法 |
| **结构化编码方法** | 相对成熟（OmniSVG，NeurIPS 2025） | 研究几乎空白 |
| **开放数据集** | 有（MMSVG-2M 200万、FIGR-8-SVG 等） | 几乎没有公开数据集 |
| **与视频生成结合** | 可行但矢量化转换损耗大 | Pose Estimation 路线可行 |
| **动画生成支持** | 2025年开始有专项工作（InternSVG、Vector Prism、Decomate、MoVer） | 工程路径有（Spiritus），学术研究空白 |
| **工程可行性** | 较高，有 OmniSVG / InternSVG 开源代码 | 中等，Spiritus 提供了工程参考 |

---

## 四、结论与待深入方向

### 主要结论

1. AI 生成结构化动画的核心挑战在于**格式的紧凑化表示**：原始格式对 LLM 不友好，主流方法（OmniSVG、OmniLottie、InternSVG）都在做"格式→紧凑 token 序列"的预处理，是最有效的学术方向。
2. **优化方法**（DiffVG/VectorFusion）在静态 SVG 重建上效果好，但计算成本高、不支持动画，工程价值有限。
3. **SVG 动画生成**在 2025 年开始出现专项工作，形成了两条技术路线：
   - **模型层**：InternSVG 把动画纳入统一训练（2025.10）；DeepSVG（2020）最早尝试 SVG 动画插值
   - **Pipeline 层**：Vector Prism 做语义恢复 + VLM 生成 CSS/JS；Decomate 做交互式动画；MoVer 用 DSL 做验证循环
4. SVG 动画生成的核心瓶颈是**语义结构**：SVG 的 XML 层次结构与视觉语义分组不一致，VLM 难以判断哪些 path 应该联动（Vector Prism 的核心发现）。
5. **Spine 骨骼动画**的学术研究几乎空白，公开数据集是最大瓶颈。但工程方向有 Spiritus（文本→2D 角色动画全链路），以及 HumanRig（自动绑定）可作参考。
6. **"视频→结构化动画"**的逆向流程（Pose Estimation 驱动 Spine / VectorTalker 的 landmark 驱动）是工程上最现实的 Spine 动画生成路径。
