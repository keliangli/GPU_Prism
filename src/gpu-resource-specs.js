// Product evidence and Hopper architecture limits are kept separate. The 3D
// teaching geometry is never used to count installed hardware.
export const RESOURCE_SOURCES = {
  hopper: {title:'NVIDIA Hopper 架构详解',url:'https://developer.nvidia.com/blog/nvidia-hopper-architecture-in-depth/'},
  whitepaper: {title:'NVIDIA H100 架构白皮书 v1.04',url:'https://dam-cdn.nvd.orangelogic.com/AssetLink/705n6ur546g0uk43w0117r17n8042d73.pdf'},
  course: {title:'NVIDIA CUDA Programming and Optimization',url:'https://developer-blogs.nvidia.com/wp-content/uploads/2024/08/CUDA-Programming-and-Optimization.pdf'},
  tuning: {title:'NVIDIA Hopper Tuning Guide',url:'https://docs.nvidia.com/cuda/hopper-tuning-guide/index.html#occupancy'},
  shared: {title:'CUDA 共享内存与 bank',url:'https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html#shared-memory-and-memory-banks'},
  barrier: {title:'PTX CTA 命名屏障',url:'https://docs.nvidia.com/cuda/parallel-thread-execution/index.html#parallel-synchronization-and-communication-instructions-bar'},
  fabric: {title:'NVIDIA Fabric Manager · HGX 拓扑',url:'https://docs.nvidia.com/datacenter/tesla/fabric-manager-user-guide/#the-nvidia-hgx-h100-gpu-baseboard'},
  fabricH800: {title:'NVIDIA Fabric Manager · HGX H800',url:'https://docs.nvidia.com/datacenter/tesla/fabric-manager-user-guide/#the-nvidia-hgx-h800-gpu-baseboard'},
  h20sm: {title:'NVIDIA TensorRT-LLM · H20 78 SM',url:'https://github.com/NVIDIA/TensorRT-LLM/blob/main/examples/models/core/deepseek_v3/README.md#moe-gemm-optimization'},
  h20study: {title:'AAAI · H20 实验平台配置',url:'https://ojs.aaai.org/index.php/AAAI/article/download/39224/43185'},
  h20pcie: {title:'H20 部署论文 · PCIe Gen 5 ×16',url:'https://arxiv.org/html/2606.11867v1#A1.SS4'},
  h800sm: {title:'DeepSeek-V3 · H800 132 SM',url:'https://arxiv.org/html/2412.19437v2#S3.SS5.SSS1'},
  h800sxm: {title:'DeepSeek FlashMLA · H800 SXM5',url:'https://github.com/deepseek-ai/FlashMLA/blob/main/docs/20250929-hopper-fp8-sparse-deep-dive.md'},
  h800: {title:'NVIDIA H800 产品手册（原版镜像）',url:'https://serverflow.ru/upload/iblock/88a/2fg6cfwqo83oxx9nynevdxkdllj1hbmg/%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F%20NVIDIA%20H800.pdf'},
  h100: {title:'NVIDIA H100 产品规格',url:'https://www.nvidia.com/en-us/data-center/h100/'},
  h200: {title:'NVIDIA H200 产品规格',url:'https://www.nvidia.com/en-us/data-center/h200/'},
  h20: {title:'NVIDIA H20 产品支持文档',url:'https://docs.nvidia.com/ai-enterprise/release-7/latest/infra-software/vgpu/reference/hopper.html'}
};

const fact=(value,status,source)=>({value,status,source:RESOURCE_SOURCES[source]});
const unknown=()=>({value:null,status:'unknown',source:null});
export const GPU_RESOURCE_SPECS = {
  h20:{sms:fact(78,'verified','h20sm'),l2MB:fact(60,'observed','h20study'),gpcs:unknown(),tpcs:unknown(),hbmStacks:unknown(),memoryControllers:unknown(),nvlinks:fact(18,'verified','fabric'),pcieLanes:fact(16,'observed','h20pcie'),memoryBandwidth:fact(4,'observed','h20study'),nvlinkBandwidth:fact(900,'derived','fabric'),product:RESOURCE_SOURCES.h20},
  h100:{sms:fact(132,'verified','whitepaper'),l2MB:fact(50,'verified','whitepaper'),gpcs:fact(8,'verified','whitepaper'),tpcs:fact(66,'verified','whitepaper'),hbmStacks:fact(5,'verified','whitepaper'),memoryControllers:fact(10,'verified','whitepaper'),nvlinks:fact(18,'verified','fabric'),pcieLanes:fact(16,'verified','whitepaper'),memoryBandwidth:fact(3.35,'verified','h100'),nvlinkBandwidth:fact(900,'verified','h100'),product:RESOURCE_SOURCES.h100},
  h200:{sms:fact(132,'verified','course'),l2MB:fact(50,'verified','course'),gpcs:unknown(),tpcs:fact(66,'derived','hopper'),hbmStacks:unknown(),memoryControllers:unknown(),nvlinks:fact(18,'verified','fabric'),pcieLanes:unknown(),memoryBandwidth:fact(4.8,'verified','h200'),nvlinkBandwidth:fact(900,'verified','h200'),product:RESOURCE_SOURCES.h200},
  h800:{sms:fact(132,'observed','h800sm'),l2MB:unknown(),gpcs:unknown(),tpcs:unknown(),hbmStacks:unknown(),memoryControllers:unknown(),nvlinks:fact(8,'verified','fabricH800'),pcieLanes:unknown(),memoryBandwidth:fact(3.35,'verified','h800'),nvlinkBandwidth:fact(400,'verified','h800'),product:RESOURCE_SOURCES.h800}
};

export const HOPPER_SM = Object.freeze({
  partitions:4,fp32:128,fp64:64,int32:64,tensor:4,schedulers:4,dispatch:4,
  loadStore:32,sfu:16,texture:4,registers:65536,registerBits:32,
  unifiedKiB:256,sharedKiB:228,sharedBlockKiB:227,sharedBanks:32,wordBytes:4,
  warps:64,threads:2048,blocks:32,warpThreads:32,warpsPerScheduler:16,
  registersPerThread:255,threadsPerBlock:1024,namedBarriersPerBlock:16
});
