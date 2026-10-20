# INFAR · GPU 架构图鉴

**在线查看**：<https://keliangli.github.io/GPU_Prism/>

> 从封装到 SM 内部，用可交互的 3D 模型理解 GPU 硬件如何协同完成一次计算。

INFAR 是一个纯前端的 GPU 硬件架构学习站点。当前收录 NVIDIA H20、H200、H100、H800 的 SXM 型号，提供从封装、芯片、SM 到共享内存、寄存器文件、Warp 执行流水线的六层探索视图；其中三个深层视图附带可调参数的原理实验，把公开的 CUDA / Hopper 访问模型「跑」起来看。

它面向的是「理解硬件关系」而不是「背规格」：每个组件都能点开看说明、在推理场景中的意义和参考来源；每个模型也都明确标注了示意范围。

## 目录

- [项目概览](#项目概览)
- [页面与路由](#页面与路由)
- [深层实验](#深层实验)
- [交互与快捷键](#交互与快捷键)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [技术栈与实现要点](#技术栈与实现要点)
- [内容与模型边界](#内容与模型边界)
- [数据来源](#数据来源)
- [部署](#部署)
- [扩展新的 GPU](#扩展新的-gpu)

## 项目概览

| 项目 | 说明 |
| --- | --- |
| 形态 | 纯静态前端站点，无后端、无账号、不采集用户数据 |
| 收录 GPU | NVIDIA H20 / H200 / H100 / H800（Hopper 架构，SXM 型号） |
| 探索层级 | 6 层：封装总览、芯片架构、SM 微架构、共享内存、寄存器文件、Warp 执行流水线 |
| 原理实验 | 3 个：共享内存 bank 冲突、寄存器资源预算、Warp 指令推进 |
| 运行依赖 | 浏览器需支持 WebGL；无 WebGL 时自动降级为组件列表浏览 |
| 技术栈 | Vite 7 + 原生 ES 模块 + Three.js 0.180（无 UI 框架） |
| 测试 | `node --test`（模型层单元测试） |

## 页面与路由

站点为 SPA，使用 hash 路由，深链接可直接访问任意层级。

以下路由中的 `h20` 可替换为 `h200`、`h100`、`h800`；每款 GPU 都提供完整六层视图。

| GPU | 显存 | 显存带宽 | NVLink 带宽 | 已核实启用 SM |
| --- | --- | --- | --- | --- |
| H20 SXM5 | 96 GB HBM3 | 按具体配置核对 | 按具体配置核对 | 未在此列示 |
| H200 SXM | 141 GB HBM3e | 4.8 TB/s | 900 GB/s | 132 |
| H100 SXM | 80 GB HBM3 | 3.35 TB/s | 900 GB/s | 132 |
| H800 SXM5 | 80 GB HBM | 3.35 TB/s | 400 GB/s | 未在此列示 |

H800 容量与模块形态来自 NVIDIA 当前产品支持文档；带宽来自 NVIDIA 2023 年原版产品手册的第三方镜像。该手册未注明 HBM 代际，页面使用「HBM」表述。所有参数限定表中型号，不能直接套用到 PCIe 或 NVL 版本。

| 路由 | 视图 | 内容 |
| --- | --- | --- |
| `#/gpus` | GPU 图鉴 | GPU 目录、架构筛选（全部 / Hopper / Blackwell）与名称搜索 |
| `#/gpu/h20` | 封装总览 | 基板、GPU 核心、HBM3 堆栈、NVLink、PCIe 的 3D 排布 |
| `#/gpu/h20/die` | 芯片架构 | 计算集群（GPC）、SM 阵列、L2 缓存与 HBM 接口 |
| `#/gpu/h20/sm` | SM 微架构 | Tensor Core、CUDA Core、调度器、寄存器文件、共享内存、LSU、TMA、屏障 |
| `#/gpu/h20/shared` | 共享内存 | 32 bank 的逐 lane 地址映射与冲突实验 |
| `#/gpu/h20/registers` | 寄存器文件 | 寄存器阵列、操作数收集、写回与资源预算实验 |
| `#/gpu/h20/warp` | Warp 执行流水线 | 取指到写回的 7 个功能阶段与单指令推进实验 |

## 深层实验

### 共享内存：一个 Warp，32 条访存请求

- **访问模式**：stride 取 1、2、4、8、16、32、33（加一列 padding）、0（同址广播）
- **起始 word 偏移**：0–31，用于观察地址平移如何改变落到的 bank
- **演示公式**：`word = offset + lane × stride`，`bank = word mod 32`
- **反馈**：无 bank 冲突 / _N_ 路 bank 冲突 / 同址广播；32 个 bank 网格显示每格被多少条 lane 命中、涉及多少个不同 word
- **联动**：点击 bank 单元格或 3D 中的 bank，会同步高亮并切换右侧检查器内容

### 寄存器文件：寄存器用得多，并行上下文会怎样

- **可调参数**：每线程寄存器 16–255、线程块 128 / 256 / 512 / 1024、每线程块共享内存 0–128 KiB（步长 8）
- **参考模型**：65,536 个 32-bit 寄存器、64 Warp、2,048 线程 / SM、228 KiB 共享内存（Hopper/H100 公开参考值）
- **输出**：驻留线程块上限、驻留 Warp 上限（/64）、理论 Warp 占用率、寄存器预算条与当前生效的限制项
- **联动**：寄存器用量会改变 3D 中寄存器阵列点亮的行数

### Warp 执行流水线：一条指令，如何抵达执行单元

- **7 个功能阶段**：取指 / 译码 → 依赖检查（scoreboard）→ Warp 调度 → 指令发射 → 操作数收集 → 计算 / 访存 → 结果写回
- **4 个示例 Warp**：各自带指令与等待原因（源操作数就绪、等待前序加载写入、等待线程块同步）
- **操作方式**：点「下一阶段」逐步推进；点流水线中已通过的阶段直接回看；对等待中的 Warp 点「模拟等待完成」解除依赖；点「重置」回到取指
- **联动**：推进到哪一阶段，3D 中对应功能块即高亮，检查器同步显示该阶段说明

## 交互与快捷键

| 操作 | 效果 |
| --- | --- |
| 左键拖动 | 旋转视角 |
| 右键拖动 | 平移视角 |
| 滚轮 | 缩放 |
| 点击模型 / 标签 / 组件列表 | 打开右侧组件检查器（概览、与推理的关系、参考来源） |

| 按钮 | 效果 |
| --- | --- |
| 透视 / 俯视 / 侧视 | 切换相机预设 |
| 标签 | 显示或隐藏跟随组件的浮动标签 |
| 自动旋转 | 持续缓慢旋转模型（系统开启「减少动态效果」时自动关闭） |
| 分层展开 | 按层级炸开模型，观察封装与内部结构 |
| 演示数据流 | 沿数据路径播放流动点 |
| 全屏 | 全屏查看 3D 视口 |

| 键盘 | 效果 |
| --- | --- |
| `1`–`6` | 切换六个探索层级 |
| `R` | 重置视角 |
| `E` | 分层展开 / 收起 |
| `+` `-` | 缩放 |
| `?` | 打开探索指南 |
| `Esc` | 关闭弹层（弹层内 `Tab` 循环聚焦） |

## 快速开始

### 环境要求

需要 Node.js 20.19+ 或 22.12+（Vite 7 的要求），无需后端服务。

### 本地开发

```sh
npm install
npm run dev
```

默认在 <http://127.0.0.1:5173/> 启动开发服务器。

### 构建与预览

```sh
npm run build
npm run preview
```

构建产物输出到 `dist/`，为可直接托管的纯静态文件。

### 运行测试

```sh
node --test
```

测试覆盖 `src/hardware-models.js` 中的 bank 映射、寄存器资源预算与指令推进逻辑。

## 目录结构

```text
.
├── index.html                 页面骨架（#app / #modal-root / #toast）
├── public/favicon.svg
├── src
│   ├── main.js                路由、状态、页面模板与全局事件
│   ├── gpu-scene.js           Three.js 场景：模型构建、拾取、相机、标签、动画
│   ├── deep-scenes.js         共享内存 / 寄存器 / Warp 三个深层视图的 3D 结构与实验高亮
│   ├── deep-lab.js            三个实验的交互面板与参数状态
│   ├── hardware-models.js     纯逻辑模型：bank 映射、资源预算、指令推进（可单测）
│   ├── data.js                组件说明、资料来源、层级与各层组件列表
│   ├── gpu-profiles.js        四款 GPU 的产品规格、来源与组件内容适配
│   ├── icons.js / palette.js  图标与配色词汇
│   └── style.css / deep.css / color-theme.css
├── test/hardware-models.test.js
└── .openai/hosting.json       静态托管配置（静态目录 = dist）
```

`src/hardware-models.js` 刻意与渲染解耦，浏览器与 `node --test` 共用同一份逻辑。

## 技术栈与实现要点

- **Vite 7 + 原生 ES 模块**：无框架，DOM 由模板字符串直接渲染，路由为 hash 路由
- **Three.js 0.180**：正交相机、OrbitControls、RoundedBoxGeometry、RoomEnvironment + PMREM 环境光照、`mergeGeometries` 静态几何批处理
- **渲染性能**：几何按「材质 + 组件 id」合批以降低 draw call；浮动标签的可见性与尺寸读取分离，尺寸仅在容器变化时重测；悬停拾取合并到每帧一次，拖动期间不做拾取
- **可访问性**：组件标签为可聚焦按钮，弹层内含焦点循环与 `Esc` 关闭，尊重 `prefers-reduced-motion`
- **外部请求**：运行时仅 `src/style.css` 顶部从 Google Fonts 引入字体；断网时回退到系统等宽 / 无衬线字体，其余资源全部本地打包。站点无后端、不采集数据

## 内容与模型边界

H20 产品信息参考 NVIDIA 官方 vGPU 文档与 Dell XE9680 规格；H100、H200 参考 NVIDIA 当前产品页、HGX 系统文档与 DevTech 技术课件；H800 参考 NVIDIA vGPU 文档和 NVIDIA 原版产品手册镜像。内部原理参考 NVIDIA Hopper 架构与 CUDA 调优文档。来源链接可在网页「数据来源」中打开。

3D 模型是功能关系的教学示意，不能作为实际芯片的 CAD、floorplan 或核心数量依据。不同版本与服务器配置可能有差异。没有将 H100 的 SM 数量、L2 容量与计算峰值套用于 H20。

共享内存示例限定一个 Warp 的每个活跃 lane 读取一个对齐的 32-bit word，并区分不同地址冲突与同址读取广播；不覆盖向量或更宽访问。寄存器资源模型采用 Hopper 公开架构参考容量，综合寄存器、线程、Warp、线程块与共享内存预算，仍忽略寄存器分配粒度、SM 分区和其他硬件约束；在 H20 页面明确作为参考模型，不代表实测占用率。寄存器 bank、端口、操作数收集与执行阶段的物理数量、位置和时序未公开，图中均为功能抽象；流水线步进表示因果关系，不代表真实流水线深度或时钟周期。

## 数据来源

站点「数据来源」弹层中可点击访问，共性架构来源见 `src/data.js`，型号产品来源见 `src/gpu-profiles.js`：

1. NVIDIA AI Enterprise · Hopper vGPU —— H20 SXM5 96GB 产品与 MIG 配置
2. NVIDIA Hopper Architecture In-Depth —— SM、Tensor Core、TMA 与存储层级
3. NVIDIA Hopper Tuning Guide —— Hopper 编程模型、异步传输与优化
4. Dell PowerEdge XE9680 —— H20 96GB SXM5 与 NVLink 多卡配置
5. CUDA C++ Best Practices Guide —— 共享内存 bank、广播、冲突与局部内存
6. CUDA Programming Guide —— Warp、线程、寄存器与共享内存访问模型
7. PTX ISA · Asynchronous Operations —— TMA、mbarrier 与异步矩阵计算的指令语义
8. NVIDIA Nsight Compute · Profiling Guide —— Warp 就绪、发射与依赖等待的可观测状态
9. NVIDIA H100 / H200 官方产品页与 HGX AI Factory 系统组件文档 —— 容量、类型、带宽与互联
10. NVIDIA DevTech · CUDA Programming and Optimization —— H100 / H200 的 132 个 SM 与 50 MB L2
11. NVIDIA AI Enterprise · Hopper H800 —— H800 SXM5 80GB 与 MIG 配置
12. NVIDIA H800 Tensor Core GPU 2023 产品手册（第三方镜像）—— H800 SXM 的显存与 NVLink 带宽

## 部署

站点通过 **GitHub Pages** 发布，线上地址：<https://keliangli.github.io/GPU_Prism/>

每次 push 到 `main` 都会触发 [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)：先 `npm ci` 与 `node --test`，再构建并以当前 Pages 子路径作为 `--base` 发布 `dist`。首次使用需在仓库 Settings → Pages 把 Source 设为 “GitHub Actions”。

本地构建：

```sh
npm run build
```

产物在 `dist/`（已在 `.gitignore` 中，不入库）。仓库内的 `.openai/hosting.json` 声明静态目录为 `dist`，供其他静态托管使用。

## 扩展新的 GPU

站点数据驱动的部分与渲染部分分离，新增一颗 GPU 大致需要：

1. 在 `src/gpu-profiles.js` 中增加型号配置、公开产品来源与必要的组件内容适配；同属 Hopper 的型号可复用六层功能模型；
2. 如果属于不同架构，在 `src/gpu-scene.js` 中按层级构建相应 3D 结构，并在 `src/data.js` 补充架构组件（深层视图可参考 `src/deep-scenes.js`）；
3. 目录与路由通过 GPU 配置读取型号。检查各层标题、显存与带宽、来源索引和实验说明，避免继承其他型号的专用文字或未核实规格。

---

本项目为独立架构学习项目，非 NVIDIA 官方产品。
