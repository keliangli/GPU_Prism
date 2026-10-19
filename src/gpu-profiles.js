import { components as baseComponents, sources as baseSources, levels } from './data.js';

// Product specifications describe the SXM variant shown here. PCIe/NVL variants
// can have different memory, clocks and interconnect bandwidth.
export const GPU_PROFILES = {
  h20: {
    id: 'h20', name: 'H20', family: 'hopper', formFactor: 'SXM5',
    memoryGB: 96, memoryType: 'HBM3', memoryBandwidth: '按具体配置核对',
    nvlinkBandwidth: '按具体配置核对', activeSMs: null,
    subtitle: '从大模型推理，走进 Hopper。',
    description: '从 96 GB HBM3 显存出发，探索权重、KV Cache、片上存储和执行单元如何配合完成推理。',
    focus: '96 GB 显存 · 推理与 KV Cache', accent: '#729dff'
  },
  h200: {
    id: 'h200', name: 'H200', family: 'hopper', formFactor: 'SXM5',
    memoryGB: 141, memoryType: 'HBM3e', memoryBandwidth: '4.8 TB/s',
    nvlinkBandwidth: '900 GB/s', activeSMs: 132,
    subtitle: '更大的显存，把数据留在 GPU。',
    description: 'Hopper 计算架构搭配 141 GB HBM3e 与 4.8 TB/s 显存带宽，重点观察大模型容量、KV Cache 与数据供给的关系。',
    focus: '141 GB HBM3e · 显存容量与带宽', accent: '#fa927e'
  },
  h100: {
    id: 'h100', name: 'H100', family: 'hopper', formFactor: 'SXM5',
    memoryGB: 80, memoryType: 'HBM3', memoryBandwidth: '3.35 TB/s',
    nvlinkBandwidth: '900 GB/s', activeSMs: 132,
    subtitle: '理解 Hopper，建立计算架构坐标。',
    description: '从 80 GB HBM3 和 132 个启用 SM 认识 Hopper：第四代 Tensor Core、异步搬运 TMA，以及计算与通信的协同。',
    focus: '132 个 SM · Hopper 计算与互联', accent: '#b49af7'
  },
  h800: {
    id: 'h800', name: 'H800', family: 'hopper', formFactor: 'SXM5',
    memoryGB: 80, memoryType: 'HBM', memoryBandwidth: '3.35 TB/s',
    nvlinkBandwidth: '400 GB/s', activeSMs: null,
    subtitle: '沿着数据路径，理解同架构的差异。',
    description: '80 GB 显存、3.35 TB/s 显存带宽与 400 GB/s NVLink，沿 Hopper 数据路径理解计算、存储与多卡通信之间的关系。',
    focus: '80 GB 显存 · 400 GB/s NVLink', accent: '#4ac8da'
  }
};

export const gpuList = ['h20', 'h200', 'h100', 'h800'].map(id => GPU_PROFILES[id]);

export function getGpu(id) {
  return Object.hasOwn(GPU_PROFILES, id) ? GPU_PROFILES[id] : GPU_PROFILES.h20;
}

export function parseGpuRoute(hash) {
  const match = /^#\/gpu\/([^/]+)(?:\/([^/]+))?\/?$/.exec(hash);
  if (!match || !Object.hasOwn(GPU_PROFILES, match[1])) return null;
  return { gpuId: match[1], level: Object.hasOwn(levels, match[2]) ? match[2] : 'package' };
}

const productSources = {
  h20: [],
  h100: [
    { title: 'NVIDIA H100 Tensor Core GPU', label: 'H100 SXM：80 GB、3.35 TB/s 显存带宽、900 GB/s NVLink', url: 'https://www.nvidia.com/en-us/data-center/h100/', kind: 'NVIDIA 官方产品规格' },
    { title: 'NVIDIA HGX AI Factory · System Components', label: 'HGX H100 的 80 GB HBM3 与 HGX H200 的 141 GB HBM3e', url: 'https://docs.nvidia.com/enterprise-reference-architectures/hgx-ai-factory-h100-h200-b200/latest/components.html', kind: 'NVIDIA 官方系统参考架构' }
  ],
  h200: [
    { title: 'NVIDIA H200 Tensor Core GPU', label: 'H200 SXM：141 GB HBM3e、4.8 TB/s 显存带宽、900 GB/s NVLink', url: 'https://www.nvidia.com/en-us/data-center/h200/', kind: 'NVIDIA 官方产品规格' },
    { title: 'NVIDIA DevTech · CUDA Programming and Optimization', label: 'H200 SXM：132 个 SM 与 50 MB L2（第 4 页）；Hopper SM 结构（第 5 页）', url: 'https://developer-blogs.nvidia.com/wp-content/uploads/2024/08/CUDA-Programming-and-Optimization.pdf', kind: 'NVIDIA 官方技术课件' }
  ],
  h800: [
    { title: 'NVIDIA AI Enterprise · Hopper H800', label: 'H800 SXM5 80GB 产品支持与 MIG 配置', url: 'https://docs.nvidia.com/ai-enterprise/release-8/latest/infra-software/vgpu/reference/hopper-h800.html', kind: 'NVIDIA 官方产品文档' },
    { title: 'NVIDIA H800 Tensor Core GPU · 2023 产品手册', label: 'SXM：80 GB、3.35 TB/s 显存带宽、400 GB/s NVLink；NVIDIA 原版手册，第三方镜像', url: 'https://serverflow.ru/upload/iblock/88a/2fg6cfwqo83oxx9nynevdxkdllj1hbmg/%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F%20NVIDIA%20H800.pdf', kind: 'NVIDIA 产品手册（第三方镜像）' }
  ]
};

// Preserve base source indices: all original component references remain valid,
// while model-specific specification overrides refer to appended sources.
export function getGpuSources(id) {
  const gpu = getGpu(id);
  return [...baseSources, ...productSources[gpu.id]].map(source => ({ ...source }));
}

function adaptCopy(value, modelName) {
  if (typeof value === 'string') return value.replaceAll('Hopper 或 H20', 'Hopper').replaceAll('H20', modelName);
  if (Array.isArray(value)) return value.map(item => adaptCopy(item, modelName));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, adaptCopy(item, modelName)]));
  return value;
}

export function getGpuComponents(id) {
  const gpu = getGpu(id);
  const components = adaptCopy(baseComponents, gpu.name);
  const productSource = gpu.id === 'h20' ? 0 : baseSources.length;
  const bandwidthSource = gpu.id === 'h800' ? baseSources.length + 1 : productSource;
  const architectureSource = gpu.id === 'h200' ? baseSources.length + 1 : 1;
  const hasBandwidth = !gpu.memoryBandwidth.startsWith('按');

  components.gpu.description = `${gpu.name} 使用 Hopper 架构，GPU 核心集成 SM、片上缓存与互联逻辑。模型权重和激活数据从 ${gpu.memoryType} 进入片上存储，再由执行单元完成计算。`;
  components.gpu.stats = [['架构', 'Hopper'], ['形态', gpu.formFactor], ['显存', `${gpu.memoryGB} GB ${gpu.memoryType}`]];
  components.gpu.source = productSource;
  components.hbm.title = `${gpu.memoryType} 高带宽显存`;
  components.hbm.shortTitle = `${gpu.memoryType} 显存`;
  components.hbm.description = `HBM 把多层 DRAM 垂直堆叠，通过中介层与 GPU 核心相连。${gpu.name} ${gpu.formFactor} 的 ${gpu.memoryGB} GB ${gpu.memoryType} 用于容纳模型权重、激活值与随上下文增长的 KV Cache。`;
  components.hbm.stats = [['总容量', `${gpu.memoryGB} GB`], ['类型', gpu.memoryType], hasBandwidth ? ['显存带宽', gpu.memoryBandwidth] : ['用途', '权重 / KV Cache']];
  components.hbm.source = gpu.id === 'h100' ? baseSources.length + 1 : hasBandwidth ? bandwidthSource : productSource;
  components.substrate.stats[0] = ['模块', gpu.formFactor];
  components.substrate.source = productSource;

  if (!gpu.nvlinkBandwidth.startsWith('按')) {
    components.nvlink.stats = [['NVLink 带宽', gpu.nvlinkBandwidth], ['作用', 'GPU ↔ GPU'], ['场景', '多卡并行']];
    components.nvlink.insight = `${gpu.name} ${gpu.formFactor} 的产品规格列出最高 ${gpu.nvlinkBandwidth} NVLink 总带宽。它与显存带宽属于不同数据路径；多卡吞吐仍受通信量、拓扑和通信与计算重叠情况影响。`;
    components.nvlink.source = bandwidthSource;
  }

  if (gpu.activeSMs !== null) {
    components.gpc.stats = [['启用 SM', `${gpu.activeSMs} / GPU`], ['层级', 'GPU → GPC → SM'], ['布局', '逻辑示意']];
    components.gpc.insight = `${gpu.name} 的公开配置包含 ${gpu.activeSMs} 个启用 SM。本图的集群数量、SM 方块与排布仍为教学抽象，不按方块数量还原物理芯片。`;
    components.gpc.source = architectureSource;
    components.sm.insight = `${gpu.name} 的 SM 基于 Hopper 架构。图中展示计算、调度和存储的功能关系，方块数量不表示物理执行单元数量，内部位置与连线经过简化。`;
    components.l2.stats = [['容量', '50 MB'], ['共享范围', '整个 GPU'], ['用途', '数据复用']];
    components.l2.source = architectureSource;
    components.cuda.stats = [['FP32 CUDA Core', '16,896 / GPU'], ['每个 SM', '128 FP32 CUDA Core'], ['执行方式', 'SIMT']];
    components.cuda.insight += ` ${gpu.name} 的数量按 ${gpu.activeSMs} 个 SM × 每 SM 128 个 FP32 CUDA Core 计算；图中方块仍为功能示意。`;
    components.cuda.source = architectureSource;
    components.tensor.stats = [['Tensor Core', '528 / GPU'], ['代际', '第四代'], ['精度示例', 'FP8 / BF16 / FP16']];
    components.tensor.insight += ` ${gpu.name} 的数量按 ${gpu.activeSMs} 个 SM × 每 SM 4 个 Tensor Core 计算。`;
    components.tensor.source = architectureSource;
  }

  if (gpu.id === 'h800') {
    components.hbm.insight += ' 本页已核实 80 GB 容量；未独立核实所选 H800 的 HBM 代际，因此只标注 HBM。';
    components.gpc.insight += ' H800 的启用 SM 总数未由本页资料直接核实，不从 H100 配置推断。';
  }

  if (gpu.id === 'h20') {
    components.registerFile.insight = '资源计算器综合寄存器、线程块、线程、Warp 与共享内存预算，仍忽略分配粒度、SM 分区、编译器和其他约束。Hopper 参考数值不作为 H20 产品实测规格，也不预测运行时间。';
  } else {
    components.registers.insight = 'Hopper 调优指南列出每 SM 65,536 个 32 位寄存器。这里使用 Hopper 公开架构资源预算，解释寄存器需求如何影响驻留度；实际内核仍受分配粒度、编译器和其他资源约束。';
    components.registerFile.stats = [['Hopper 公开架构', '65,536 × 32 bit / SM'], ['每线程上限', '255 个寄存器'], ['驻留 Warp 上限', '64 / SM']];
    components.registerFile.insight = '资源计算器采用 Hopper 公开架构资源预算，综合寄存器、线程块、线程、Warp 与共享内存限制。它仍忽略分配粒度、SM 分区、编译器和其他约束；理论驻留上限不代表实际运行速度。';
    if (gpu.id === 'h800') {
      components.registerFile.stats = [['Hopper / H100 参考', '65,536 × 32 bit / SM'], ['每线程上限（参考）', '255 个寄存器'], ['驻留 Warp（参考）', '64 / SM']];
      components.registerFile.insight += ' 这些值未逐项核实为 H800 的实装资源。';
      components.registers.insight += ' 本页未将这些参考值认定为 H800 的实装规格。';
    }
  }

  return components;
}
