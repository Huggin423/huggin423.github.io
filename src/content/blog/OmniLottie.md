## OmniLottie

OmniLottie是一种新的生成矢量动画Lottie文件的框架。用户可以根据多模态输入（文本、文本+图片、视频）获得相应的Json文件。论文认为，现有的方法大多是生成栅格动画（raster vedios?）（像素点），不可编辑；直接让大模型生成LottieJson容易失败或不令人满意：
- Lottie JSON冗余太多，包含大量括号、字段名、层级嵌套、固定结构元数据，这些token容易占用大量模型容量。
- 原始JSON token很长，训练和推理困难。
- 格式脆弱，少任何括号、字段错位、层级错乱都会导致不可解析/渲染

作者提出的解决方法是：不直接生成原始Json，而是先把Lottie编程结构化且紧凑的token序列，再用预训练视觉语言模型做自回归生成。

这里需要对Lottie有一定的了解，Lottie是由多个图层组成的。
1. Base Layer Properites：描述图层身份和时间信息
2. Visual Layer Properites：控制图层外观和渲染方式
3. Specific Layer Properites：图层类型特有属性，这里主要是一些其他元素信息

### MMLottie-2M 数据集

为了训练视觉语言模型，作者使用两类数据源构建数据集。
1. 真实Lottie动画数据。从多个网站爬取并做了清晰，只保留可参数化、可渲染、适合学习的Lottie文件
2. 从SVG合成辅助动画数据。Lottie本身结构复杂，内容与动作耦合严重。作者使用OmniSVG，把静态SVG转为Lottie，在人为加上简单动画，方便作为基础训练样本。

数据有进行标准化：
- 空间归一化：512 * 512
- 时间归一化：0-16 timestamp，时间步

单纯的SVG+简单动作的合成动画与真实Lottie动画存在差距，作者从真实Lottie中提取运动轨迹，形成动作签名，对这些签名进行聚类，产生一批典型动作模板，将这些模板注入到SVG转换得到的静态Lottie上。

除此之外，作者自己设计了一套MMLottie-Bench评测基准，主要是看视觉质量和是否忠实遵循输入条件。这里我不太清楚，但直觉上应该是合理的。

### 核心方法

#### 建模

可以把一个 Lottie 动画重新建模为：
$
\mathcal{L} = \{{\mathcal{M}, \mathcal{L}_1, \mathcal{L}_2, ... , \mathcal{L}_n}\}
$，其中 _M_ 表示全局元信息，_Li_表示各个图层。

图层可以进一步表示为：
$
\mathcal{L}_i = (\tau_i, \mathcal{A}_{\tau_i}, T_i, \mathcal{E}_i)
$，其中 $\tau_i$ 支持五类核心 layer：
- Precomposition
- Solid
- Null
- Shape
- Text

这种表示方式更适合自回归模型逐token生成

#### 编码过程

1. 解析JSON，建模为元信息+图层信息
2. 量化元信息，把数值参数离散化，变为token。（这里有一些构造tokenizer（词表编号）的细节）
3. 每个图层加上一个layer type token，然后把该层的参数按顺序编码进去
4. 文本字段特殊处理，遇到文本内容、字体名、引用ID之类的，不做数值量化，直接使用原始Qwen tokenizer编码
5. 加结束标记，\<end\>这类的结构token，方便解码

#### 解码过程

模型先生成token，反向恢复为 command sequence，再还原为 Lottie JSON。token可以恢复成连续参数值：
$$
p = \frac{\mathrm{token} - o_t}{s_t}
$$

#### 编码过程中的数值参数离散化

$$
\mathrm{token}(x,t) = \lfloor x \cdot s_t \rfloor + o_t 
$$

这样做可以不同参数类型分配不同token区间，便于模型学习。
这里的离散化是因为大语言模型原生处理的是离散token序列，不能直接处理任意浮点数，常用做法是把连续值转成有限个桶或编号。

#### 选择多模态大模型生成token

使用Qwen2.5-VL作为backbone，在此基础之上新增一套Lottie vocabulary embeddings，相当于扩大了最初的嵌入，方便模型感知到有关Lottie的内容。

模型的输入可以是交错的多模态，输出是一个自回归生成的Lottie token序列。

训练的目标和普通的语言模型一样，使用next-token prediction。以下是标准的自回归交叉熵训练。
$$
\theta^* = \arg\min_{\theta} - \sum_{i=1}^{L} \log P\!\left(x_s^{[i]} \mid x_c, x_s^{<i}; \theta\right)
$$