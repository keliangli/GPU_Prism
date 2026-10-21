import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import template from './template.html?raw';
import { ARCH_PRESETS, normalizeLlmConfig, chooseLlmExperts, estimateLlmKv } from './data.js';
import { renderLlmIcons } from './icons.js';
import { disposeLlmObject } from './resources.js';
import { ATTENTION_NAMES, getLlmLayer, estimateLlmParameters } from './models.js';
import { getPublishedComponent } from './components.js';
import { initializeModelPicker, renderModelSummary } from './catalog-ui.js';
import { createTechBlock, createTechEnvironment, styleTechComponent } from './visuals.js';
import { frameLlmBounds, llmFrameDelta, createEnergyConduit, createFlowPackets, createSelectionCorners } from './scene-motion.js';
import './utilities.css';
import './style.css';

export function createLlmExplorer(root){
  const initialKey='deepseek-v4.1-flash';
  root.className='llm-explorer';root.innerHTML=template;root.dataset.preset=initialKey;root.dataset.lod='3';
  const get=id=>root.querySelector('#'+id);
  let disposed=false,frame=null,copyTimer=null;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Initialize Lucide icons
    renderLlmIcons(root);

    /*************************************************************************
     * 1. ARCHITECTURE PRESETS & COMPONENT METADATA DATABASE
     *************************************************************************/
    // Global Application State
    const state = {
      presetKey: initialKey,
      config: normalizeLlmConfig(ARCH_PRESETS[initialKey]),
      lod: 3, // Start at L3 so user immediately experiences rich MLA & 3D MoE grid, can switch to L1/L2 anytime
      activeLayer: 4,
      batchSize: 4,
      seqLen: 4096,
      precision: 'fp8', // 'bf16': 2, 'fp8': 1, 'int4': 0.5
      precisionBytes: 1,
      flowRunning: !reducedMotion,
      autoRotate: false,
      showResiduals: true,
      showLabels: true,
      activeExperts: chooseLlmExperts(ARCH_PRESETS[initialKey]),
      selectedNodeId: 'attn_core'
    };

    // Detailed Operator Knowledge Base Generator (adapts dynamically to state.config, B, S)
    function getComponentDetails(nodeId) {
      const cfg = state.config;
      if(cfg.verified||cfg.availability==='preview')return getPublishedComponent(cfg,state.activeLayer,nodeId,state);
      const attnMode=cfg.attn_mode==='ssm_hybrid'&&state.activeLayer%4===3?'gqa':cfg.attn_mode;
      const B = state.batchSize;
      const S = state.seqLen;
      const H = cfg.hidden_size;
      const dc = cfg.kv_lora_rank;
      const dq = cfg.q_lora_rank;
      const nH = cfg.num_attention_heads;
      const nE = cfg.n_routed_experts;
      const topK = cfg.num_experts_per_tok;

      const fmtNum = (n) => {
        if (n >= 1e12) return (n / 1e12).toFixed(2) + ' T';
        if (n >= 1e9) return (n / 1e9).toFixed(2) + ' B';
        if (n >= 1e6) return (n / 1e6).toFixed(2) + ' M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + ' K';
        return n.toString();
      };

      const catalog = {
        embedding: {
          category: 'Embedding Layer',
          title: 'Token 词嵌入层 (Vocab Embedding)',
          desc: '将离散的输入 Token ID 映射为高维连续稠密向量。词表大小通常为 129,280 (DeepSeek) 或 151,936 (Qwen)。',
          inShape: `[${B}, ${S}] (int64)`,
          outShape: `[${B}, ${S}, ${H}]`,
          params: fmtNum(129280 * H),
          paramsFormula: `V × H = 129280 × ${H}`,
          flops: fmtNum(B * S * H) + 'FLOPs',
          flopsFormula: `Table Lookup O(B·S·H)`,
          math: `<div>x<sub>0</sub> = Embed(tokens) ∈ ℝ<sup>B × S × ${H}</sup></div>`,
          code: `class VocabParallelEmbedding(nn.Module):\n    def __init__(self, vocab_size=129280, hidden_size=${H}):\n        super().__init__()\n        self.weight = nn.Parameter(torch.empty(vocab_size, hidden_size))\n\n    def forward(self, input_ids):\n        # [B, S] -> [B, S, ${H}]\n        return F.embedding(input_ids, self.weight)`
        },
        rmsnorm: {
          category: 'Normalization',
          title: 'RMSNorm (均方根层归一化)',
          desc: 'Pre-Norm 结构的核心组件：省去了传统 LayerNorm 的均值中心化计算，仅通过均方根进行缩放，提升训练稳定性并减少约 15% 归一化开销。',
          inShape: `[${B}, ${S}, ${H}]`,
          outShape: `[${B}, ${S}, ${H}]`,
          params: fmtNum(H),
          paramsFormula: `γ ∈ ℝ^${H}`,
          flops: fmtNum(4 * B * S * H) + 'FLOPs',
          flopsFormula: `4 · B · S · H`,
          math: `<div>RMS(x) = √( (1/H) ∑<sub>i=1</sub><sup>H</sup> x<sub>i</sub><sup>2</sup> + ε )</div><div>y = (x / RMS(x)) ⊙ γ</div>`,
          code: `class RMSNorm(nn.Module):\n    def __init__(self, dim=${H}, eps=1e-6):\n        super().__init__()\n        self.weight = nn.Parameter(torch.ones(dim))\n        self.eps = eps\n\n    def forward(self, x):\n        variance = x.pow(2).mean(-1, keepdim=True)\n        x = x * torch.rsqrt(variance + self.eps)\n        return self.weight * x`
        },
        mla_kv_latent: {
          category: 'MLA Core Innovation',
          title: 'MLA 潜在 KV 压缩缓存 (Latent c_t^KV)',
          desc: `DeepSeek-V3/R1 架构精髓：通过下投影 W^DKV 将 ${H} 维隐状态压缩至仅 ${dc} 维的低秩潜在向量 c_t^KV。在自回归解码阶段，只需缓存该潜在向量（矩阵吸收后无需缓存展开的 K/V），缓存规模随压缩维度变化，估算见左侧对比。`,
          inShape: `[${B}, ${S}, ${H}]`,
          outShape: `[${B}, ${S}, ${dc}]`,
          params: fmtNum(H * dc + dc * nH * 256),
          paramsFormula: `H·d_c + d_c·n_h·(d_k+d_v)`,
          flops: fmtNum(2 * B * S * H * dc) + 'FLOPs',
          flopsFormula: `2 · B · S · ${H} · ${dc}`,
          math: `<div>c<sub>t</sub><sup>KV</sup> = W<sup>DKV</sup> h<sub>t</sub> ∈ ℝ<sup>${dc}</sup> &nbsp;(KV LoRA Rank)</div><div>k<sub>t</sub><sup>C</sup> = W<sup>UK</sup> c<sub>t</sub><sup>KV</sup>, &nbsp; v<sub>t</sub><sup>C</sup> = W<sup>UV</sup> c<sub>t</sub><sup>KV</sup></div><div>推理加速技巧：W<sup>UK</sup> 可直接吸收进 W<sup>UQ</sup> 中避免显式展开！</div>`,
          code: `# DeepSeek MLA KV Low-Rank Compression\nc_kv = self.kv_a_proj_with_mqa(hidden_states) # [B, S, ${dc} + 64]\nc_kv_latent, k_pe = torch.split(c_kv, [${dc}, 64], dim=-1)\nc_kv_latent = self.kv_a_layernorm(c_kv_latent) # Cached in KV Cache!\nkv = self.kv_b_proj(c_kv_latent) # Up-project [B, S, ${nH} * 256]`
        },
        mla_q_latent: {
          category: 'MLA Query Compression',
          title: 'Query 低秩压缩与上投影 (c_t^Q)',
          desc: `为了同时降低训练激活值显存与参数量，MLA 同样对 Query 采用低秩压缩（d_q = ${dq}），再上投影并拆分为非位置编码部分 q_t^C 与解耦 RoPE 部分 q_t^R。`,
          inShape: `[${B}, ${S}, ${H}]`,
          outShape: `[${B}, ${S}, ${nH}, 192]`,
          params: fmtNum(H * dq + dq * nH * 192),
          paramsFormula: `H·d_q + d_q·n_h·(128+64)`,
          flops: fmtNum(2 * B * S * (H * dq + dq * nH * 192)) + 'FLOPs',
          flopsFormula: `2·B·S·(H·d_q + d_q·n_h·192)`,
          math: `<div>c<sub>t</sub><sup>Q</sup> = RMSNorm(W<sup>DQ</sup> h<sub>t</sub>) ∈ ℝ<sup>${dq}</sup></div><div>q<sub>t</sub><sup>C</sup> = W<sup>UQ</sup> c<sub>t</sub><sup>Q</sup>, &nbsp; q<sub>t</sub><sup>R</sup> = RoPE(W<sup>QR</sup> c<sub>t</sub><sup>Q</sup>)</div><div>q<sub>t</sub> = [q<sub>t</sub><sup>C</sup> ; q<sub>t</sub><sup>R</sup>]</div>`,
          code: `# Query Low-Rank Compression (d_q = ${dq})\nc_q = self.q_a_layernorm(self.q_a_proj(hidden_states))\nq = self.q_b_proj(c_q).view(B, S, ${nH}, 192)\nq_nope, q_pe = torch.split(q, [128, 64], dim=-1)\nq_pe = apply_rotary_pos_emb(q_pe, cos, sin)`
        },
        rope_decoupled: {
          category: 'Positional Encoding',
          title: '解耦旋转位置编码 (Decoupled RoPE)',
          desc: '由于旋转位置编码 RoPE 夹在中间会破坏 W^UQ 与 W^UK 的矩阵乘法结合律（导致无法合并矩阵），MLA 专门劈出一条独立的 64 维小分支承载 RoPE，最后再与潜在分支拼接。',
          inShape: `[${B}, ${S}, ${H}]`,
          outShape: `[${B}, ${S}, 1, 64]`,
          params: fmtNum(H * 64),
          paramsFormula: `H × d_R = ${H} × 64`,
          flops: fmtNum(2 * B * S * H * 64) + 'FLOPs',
          flopsFormula: `2 · B · S · ${H} · 64`,
          math: `<div>k<sub>t</sub><sup>R</sup> = RoPE(W<sup>KR</sup> h<sub>t</sub>) ∈ ℝ<sup>64</sup> (所有头共享)</div><div>Score = (q<sub>t</sub><sup>C</sup> k<sub>s</sub><sup>C⊤</sup> + q<sub>t</sub><sup>R</sup> k<sub>s</sub><sup>R⊤</sup>) / √(d<sub>k</sub> + d<sub>R</sub>)</div>`,
          code: `# Decoupled Shared Key RoPE Branch\nk_pe = k_pe.view(B, S, 1, 64)\nk_pe = apply_rotary_pos_emb(k_pe, cos, sin)\n# Broadcast k_pe across all ${nH} attention heads\nk = torch.cat([k_nope, k_pe.expand(-1, -1, ${nH}, -1)], dim=-1)`
        },
        attn_core: {
          category: 'Core Attention',
          title: attnMode === 'mla' ? `FlashMLA 多头注意力核心 (${nH} Heads)` : (attnMode === 'gqa' ? `GQA 分组查询注意力 (${nH}Q / ${cfg.num_key_value_heads || 8}KV)` : `Mamba-2 SSD 状态空间核心`),
          desc: attnMode === 'mla'
            ? `汇聚压缩还原后的 ${nH} 个注意力头，执行缩放点积注意力与 Output 投影 W^O。配合 FlashMLA 算子可充分利用 Hopper GPU 张量核心。`
            : (attnMode === 'gqa'
              ? `Grouped-Query Attention：将 ${nH} 个 Query 头分为 ${cfg.num_key_value_heads || 8} 组，每组共享同一份 Key 和 Value 头，兼顾推理吞吐与模型精度。`
              : `Structured State Space Duality (SSD)：通过线性状态空间方程实现 O(S) 线性复杂度序列建模，无需维护随序列增长的 KV Cache。`),
          inShape: `[${B}, ${S}, ${nH}, 192]`,
          outShape: `[${B}, ${S}, ${H}]`,
          params: fmtNum(nH * 128 * H),
          paramsFormula: `n_h · d_v · H`,
          flops: fmtNum(4 * B * S * S * nH * 128 + 2 * B * S * nH * 128 * H) + 'FLOPs',
          flopsFormula: `4·B·S²·n_h·d + 2·B·S·n_h·d·H`,
          math: `<div>Attn(Q, K, V) = Softmax( Q K<sup>⊤</sup> / √192 + Mask ) V</div><div>Output = Attn(Q, K, V) W<sup>O</sup> ∈ ℝ<sup>B × S × ${H}</sup></div>`,
          code: `# FlashAttention / FlashMLA Core\nattn_output = flash_attn_func(q, k, v, causal=True)\nattn_output = attn_output.reshape(B, S, -1)\noutput = self.o_proj(attn_output) # [B, S, ${H}]`
        },
        moe_router: {
          category: 'MoE Routing Gate',
          title: `无辅助损失动态路由器 (Top-${topK} Router)`,
          desc: `计算每个 Token 与 ${nE} 个路由专家的亲和度得分，采用 Sigmoid 激活与无辅助损失负载均衡偏置项 b_i（Auxiliary-Loss-Free Load Balancing），选出 Top-${topK} 激活专家。`,
          inShape: `[${B}, ${S}, ${H}]`,
          outShape: `[${B * S}, ${topK}] (Weights & Indices)`,
          params: fmtNum(H * nE),
          paramsFormula: `H × N_r = ${H} × ${nE}`,
          flops: fmtNum(2 * B * S * H * nE) + 'FLOPs',
          flopsFormula: `2 · B · S · ${H} · ${nE}`,
          math: `<div>s<sub>i,t</sub> = Sigmoid( u<sub>t</sub><sup>⊤</sup> e<sub>i</sub> )</div><div>g'<sub>i,t</sub> = TopK( s<sub>i,t</sub> + b<sub>i</sub>, k=${topK} )</div><div>g<sub>i,t</sub> = s<sub>i,t</sub> / ∑<sub>j∈TopK</sub> s<sub>j,t</sub></div>`,
          code: `# Auxiliary-Loss-Free Top-K MoE Router\nscores = F.Linear(hidden_states, self.gate_weight).sigmoid()\nscores_for_choice = scores + self.e_score_correction_bias\n_, topk_idx = torch.topk(scores_for_choice, k=${topK}, dim=-1)\ntopk_weights = scores.gather(-1, topk_idx)\ntopk_weights = topk_weights / topk_weights.sum(dim=-1, keepdim=True)`
        },
        moe_experts: {
          category: 'Sparse MoE FFN',
          title: nE > 0 ? `细粒度路由专家阵列 (${nE} Routed Experts)` : `SwiGLU 前馈网络 (Dense FFN)`,
          desc: nE > 0
            ? `由 ${nE} 个独立的 SwiGLU 子网络构成的 3D 专家矩阵。每个 Token 仅点亮其中 ${topK} 个专家（当前激活专家编号已在左侧高亮），实现超大参数容量与极低计算开销的解耦。`
            : `采用 SwiGLU 激活的稠密前馈层，包含 Gate、Up、Down 三个大型线性投影矩阵，中间维扩展至 ${cfg.intermediate_size}。`,
          inShape: `[${B}, ${S}, ${H}]`,
          outShape: `[${B}, ${S}, ${H}]`,
          params: nE > 0 ? fmtNum(nE * 3 * H * cfg.moe_intermediate_size) : fmtNum(3 * H * cfg.intermediate_size),
          paramsFormula: nE > 0 ? `${nE} × 3 × H × d_moe` : `3 × H × d_ff`,
          flops: nE > 0 ? fmtNum(2 * B * S * topK * 3 * H * cfg.moe_intermediate_size) + 'FLOPs' : fmtNum(2 * B * S * 3 * H * cfg.intermediate_size) + 'FLOPs',
          flopsFormula: nE > 0 ? `2·B·S·K·(3·H·d_moe)` : `6 · B · S · H · d_ff`,
          math: nE > 0
            ? `<div>FFN<sub>i</sub>(u) = W<sub>down,i</sub> ( SiLU(W<sub>gate,i</sub> u) ⊙ W<sub>up,i</sub> u )</div><div>y<sub>routed</sub> = ∑<sub>i∈TopK(${topK})</sub> g<sub>i,t</sub> FFN<sub>i</sub>(u<sub>t</sub>)</div>`
            : `<div>SwiGLU(x) = (SiLU(x W<sub>gate</sub>) ⊙ (x W<sub>up</sub>)) W<sub>down</sub></div>`,
          code: nE > 0
            ? `# Grouped GEMM over Top-${topK} Activated Experts\nfor expert_id in active_experts:\n    gate = F.silu(self.w_gate[expert_id](token_x))\n    up = self.w_up[expert_id](token_x)\n    out += routing_weight * self.w_down[expert_id](gate * up)`
            : `# Dense SwiGLU FFN\ngate = F.silu(self.gate_proj(x))\nup = self.up_proj(x)\nreturn self.down_proj(gate * up)`
        },
        shared_expert: {
          category: 'Always-On Shared Expert',
          title: '常亮共享专家 (Shared Expert SwiGLU)',
          desc: 'DeepSeekMoE 特有设计：隔离出专门的共享专家，所有 Token 无需路由必定流经该模块，用于捕获跨领域的通用共性知识，减轻路由专家的知识冗余。',
          inShape: `[${B}, ${S}, ${H}]`,
          outShape: `[${B}, ${S}, ${H}]`,
          params: fmtNum(3 * H * cfg.moe_intermediate_size),
          paramsFormula: `3 × ${H} × ${cfg.moe_intermediate_size}`,
          flops: fmtNum(6 * B * S * H * cfg.moe_intermediate_size) + 'FLOPs',
          flopsFormula: `6 · B · S · H · d_shared`,
          math: `<div>h'<sub>t</sub> = u<sub>t</sub> + FFN<sub>shared</sub>(u<sub>t</sub>) + ∑<sub>i∈TopK</sub> g<sub>i,t</sub> FFN<sub>i</sub>(u<sub>t</sub>)</div>`,
          code: `# Shared Expert Branch (Always active for all tokens)\nshared_out = self.shared_experts(hidden_states)\n# Combine with routed MoE output and residual\noutput = residual + shared_out + routed_moe_out`
        },
        residual_add: {
          category: 'Residual Stream',
          title: '残差连接流 (Residual Stream x + f(x))',
          desc: '贯穿整个 Transformer 堆叠塔的“高速公路”：确保梯度在反向传播时无损直达底层，同时允许各层算子对主干表征进行增量式修正。',
          inShape: `[${B}, ${S}, ${H}] × 2`,
          outShape: `[${B}, ${S}, ${H}]`,
          params: '0 (无参数)',
          paramsFormula: `Identity + Element-wise Add`,
          flops: fmtNum(B * S * H) + 'FLOPs',
          flopsFormula: `B · S · H`,
          math: `<div>h<sub>l</sub> = h<sub>l-1</sub> + SubLayer( RMSNorm(h<sub>l-1</sub>) )</div>`,
          code: `# Pre-Norm Residual Connection\nresidual = hidden_states\nhidden_states = self.input_layernorm(hidden_states)\nhidden_states = residual + self.self_attn(hidden_states)`
        },
        mtp_module: {
          category: 'Multi-Token Prediction',
          title: 'MTP 多 Token 预测头 (Multi-Token Prediction)',
          desc: 'DeepSeek-V3 引入的训练与投机解码利器：在主模型预测下一个 Token 的同时，通过轻量级级联 Transformer 块结合下一个位置的 Embedding 顺序预测未来第 2、3 个 Token，推理时可直接作为 Speculative Decoding 草稿模型使吞吐翻倍。',
          inShape: `[${B}, ${S}, ${H}] ⊕ Embed(t+1)`,
          outShape: `[${B}, ${S}, Vocab] (t+2 预测)`,
          params: fmtNum(2 * H * H + 4 * H * H),
          paramsFormula: `Proj(2H→H) + 1×DecoderLayer`,
          flops: fmtNum(12 * B * S * H * H) + 'FLOPs',
          flopsFormula: `Single MTP Stage Overhead`,
          math: `<div>h'<sub>k</sub> = M<sub>k</sub> [ RMSNorm(h<sub>k-1</sub>) ; RMSNorm(Emb(t<sub>i+k</sub>)) ]</div><div>P<sub>i+k+1</sub> = Softmax( LM_Head( Transformer<sub>k</sub>(h'<sub>k</sub>) ) )</div>`,
          code: `# Multi-Token Prediction (MTP) Module\nconcat_h = torch.cat([norm_prev_h, norm_next_token_emb], dim=-1)\nh_mtp = self.eh_proj(concat_h) # [B, S, 2H] -> [B, S, H]\nh_mtp = self.mtp_decoder_layer(h_mtp)\nmtp_logits = self.shared_lm_head(self.final_norm(h_mtp))`
        }
      };

      if(nodeId==='attn_core'&&attnMode==='ssm_hybrid')return {...catalog.attn_core,category:'State Space / Schematic',title:'SSM 状态更新（结构示意）',inShape:`[${B}, ${S}, ${H}]`,params:'未展开',paramsFormula:'未配置 SSM 内部维度',flops:'未估算',flopsFormula:'不套用注意力的 S² 计算公式',math:'<div>隐藏状态输入 → SSM 状态更新 → 隐藏状态输出</div><div>本图只展示模块接口，不展开具体状态布局与内核。</div>',code:'# Conceptual interface, not an executable API\noutput, state = ssm_block(hidden_states, state)'};
      return catalog[nodeId] || catalog.mla_kv_latent;
    }

    /*************************************************************************
     * 2. THREE.JS SCENE, CAMERA, RENDERER & LIGHTING INITIALIZATION
     *************************************************************************/
    const container = get('canvas-container');
    const labelsContainer = get('labels-container');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050b16);
    scene.fog = new THREE.FogExp2(0x050b16, 0.006);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 18, 38);

    let renderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch{container.innerHTML='<div class="llm-no-webgl">此浏览器无法启动 WebGL，3D 视图暂不可用。请使用支持 WebGL 的浏览器。</div>';root.querySelectorAll('button,input').forEach(el=>el.disabled=true);return {dispose(){},modalContent:()=>'<h2>LLM 架构视图</h2><p class="modal-intro">当前环境无法启动 WebGL。此视图需要 WebGL 来显示三级模型与张量流。</p>'};}
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.domElement.setAttribute('aria-label','可旋转的 LLM 三级架构与张量流三维视图');renderer.domElement.setAttribute('role','img');
    container.appendChild(renderer.domElement);
    let glowEnabled=false,composer=null,bloomPass=null,outputPass=null;
    function ensureComposer(){
      if(composer)return;
      composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
      bloomPass=new UnrealBloomPass(new THREE.Vector2(container.clientWidth,container.clientHeight),.4,.42,.9);
      outputPass=new OutputPass();composer.addPass(bloomPass);composer.addPass(outputPass);
    }
    function syncGlowButton(){get('toggle-glow-btn').setAttribute('aria-pressed',String(glowEnabled));get('glow-button-text').textContent=glowEnabled?'柔光已开':'柔光已关';}
    syncGlowButton();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.minDistance = 6;
    controls.maxDistance = 120;

    // Smooth Camera Transition Target
    const camTransition = {
      active: false,
      targetPos: new THREE.Vector3(0, 18, 38),
      targetLook: new THREE.Vector3(0, 2, 0),
      alpha: 0.08
    };

    function flyCameraTo(pos, look) {
      if(reducedMotion){camera.position.copy(pos);controls.target.copy(look);camTransition.active=false;return;}
      camTransition.targetPos.copy(pos);
      camTransition.targetLook.copy(look);
      camTransition.active = true;
    }

    let hasFramed=false;
    function frameArchitecture(focus='all',direction=null){
      if(!archGroup.children.length)return;
      const bounds=new THREE.Box3();
      if(focus==='all')bounds.setFromObject(archGroup);
      else for(const mesh of interactiveMeshes){if(focus==='attn'?mesh.position.x<2:mesh.position.x>=2)bounds.expandByObject(mesh);}
      const view=direction??(state.lod===1?new THREE.Vector3(.42,.22,1):state.lod===2?new THREE.Vector3(.35,.6,1.4):new THREE.Vector3(.8,.65,1.3));
      const framed=frameLlmBounds(bounds,camera.aspect,camera.fov,view,state.lod===1?1.2:1.17);
      flyCameraTo(framed.position,framed.target);hasFramed=true;
    }

    // Cancel automatic camera transition when user manually drags
    controls.addEventListener('start', () => {
      camTransition.active = false;
    });

    // Lighting
    const ambientLight = new THREE.HemisphereLight(0xbfdcff,0x172744,1.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xc4e5ff, 2.5);
    dirLight1.position.set(25, 40, 30);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xb2a1ff, 1.8);
    dirLight2.position.set(-30, 25, -20);
    scene.add(dirLight2);

    const pointLightCenter = new THREE.PointLight(0x22d3ee, 1.2, 60);
    pointLightCenter.position.set(0, 8, 5);
    scene.add(pointLightCenter);

    const environment=createTechEnvironment({reducedMotion,compact:window.innerWidth<=700});scene.add(environment.group);

    /*************************************************************************
     * 3. SCENE GRAPH MANAGEMENT (NODES, EDGES, PARTICLES, LABELS)
     *************************************************************************/
    const archGroup = new THREE.Group();
    scene.add(archGroup);

    const residualGroup = new THREE.Group();
    scene.add(residualGroup);

    let interactiveMeshes = [];   // Meshes for raycasting
    let htmlLabels = [];          // { el, worldPos, nodeId, isTensorBadge }
    const flowClock={value:0};
    let simulationTime=0,previousFrame=null,environmentTime=0;
    let flowParticles = [];       // { mesh, curve, progress, speed }
    let animatedRings = [];       // RoPE 3D rotating rings
    let kvCacheMeshes = [];       // Dynamic KV cache blocks that scale with B & S
    let moeInstancedMesh = null;  // 3D InstancedMesh for up to 512 Routed Experts
    let moeExpertPositions = [];  // Local coordinates of each expert in the 3D matrix
    let moeLaserGroup = null;     // Dynamic laser beams from Router to Top-K experts
    let moeRouterOrigin = null;
    let moeSumTarget = null;
    let selectionHalo = null;     // Highlight wireframe box around selected node

    // Shared Materials Palette
    const COLORS = {
      cyan: 0x58bde7,
      cyanBright: 0x8cdbff,
      magenta: 0xb7a0ff,
      violet: 0x9180e3,
      emerald: 0x7ae1c8,
      amber: 0xedc987,
      slate: 0x334155,
      darkSlate: 0x1e293b
    };

    function createGlowingBlock(w, h, d, colorHex, opacity = 0.88) {
      return createTechBlock(w,h,d,colorHex,opacity);
    }

    function createJunction(radius){
      const geometry=new THREE.IcosahedronGeometry(radius,0);
      const mesh=new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({color:0x484c62,metalness:.65,roughness:.3,clearcoat:.4,emissive:0xa08a5b,emissiveIntensity:.12}));
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0xedc987,transparent:true,opacity:.8,toneMapped:false})));
      return mesh;
    }

    function registerInteractiveNode(mesh, nodeId, title, subtitle, labelOffset = new THREE.Vector3(0, 1.8, 0), showLabel = true) {
      styleTechComponent(mesh,nodeId);
      mesh.userData = { nodeId, title, subtitle };
      interactiveMeshes.push(mesh);

      if (showLabel) {
        const el = document.createElement('div');
        el.className = 'label-3d px-2.5 py-1 rounded-lg hud-glass border border-slate-600/50 text-[11px] shadow-lg flex items-center gap-1.5';
        el.setAttribute('role','button');el.tabIndex=0;el.setAttribute('aria-label',`${title} · ${subtitle}`);
        el.innerHTML = `
          <span class="font-semibold text-white">${title}</span>
          <span class="font-mono text-[10px] text-cyan-300">${subtitle}</span>
        `;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if(typeof mesh.userData.layerIndex==='number'){setActiveLayer(mesh.userData.layerIndex);selectComponent(nodeId);}
          else selectComponent(nodeId, mesh);
        });
        el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});
        el.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          drillDownLOD();
        });
        labelsContainer.appendChild(el);

        htmlLabels.push({
          el,
          mesh,
          offset: labelOffset,
          nodeId,
          isTensorBadge: false
        });
      }
    }

    function addTensorBadge(worldPos, shapeType) {
      const el = document.createElement('div');
      el.className = 'tensor-badge px-1.5 py-0.5 rounded bg-slate-950/90 border border-cyan-500/30 font-mono text-[10px] text-cyan-300 shadow';
      el.textContent = getDynamicShapeText(shapeType);
      labelsContainer.appendChild(el);

      htmlLabels.push({
        el,
        worldPos: worldPos.clone(),
        shapeType,
        isTensorBadge: true
      });
    }

    function getDynamicShapeText(shapeType) {
      const B = state.batchSize;
      const S = state.seqLen;
      const H = state.config.hidden_size;
      const dc = state.config.kv_lora_rank;
      const dq = state.config.q_lora_rank;
      const nH = state.config.num_attention_heads;
      switch (shapeType) {
        case 'hidden': return `[${B}, ${S}, ${H}]`;
        case 'kv_latent': return `c_KV: [${B}, ${S}, ${dc}]`;
        case 'q_latent': return `c_Q: [${B}, ${S}, ${dq}]`;
        case 'rope': return `RoPE: [${B}, ${S}, 1, 64]`;
        case 'heads': return `[${B}, ${S}, ${nH}, 192]`;
        case 'router': return `Top-${state.config.num_experts_per_tok} Weights`;
        default: return `[${B}, ${S}, ${H}]`;
      }
    }

    function createConnectionTube(points, colorHex = 0x22d3ee, radius = 0.09, isResidual = false, particleCount = 3, speed = 0.0045) {
      const curve = new THREE.CatmullRomCurve3(points);
      const targetParent=isResidual?residualGroup:archGroup;
      const rate=speed*60;
      targetParent.add(createEnergyConduit(curve,colorHex,flowClock,{radius:radius*.38,repeats:Math.max(2,particleCount),rate,residual:isResidual}));
      const packets=createFlowPackets(curve,colorHex,particleCount,isResidual?.048:.063);
      targetParent.add(packets.mesh);packets.update(flowClock.value,rate);
      flowParticles.push({...packets,rate,isResidual});
      return curve;
    }

    function createRoPERing(position, radius = 1.25) {
      const group = new THREE.Group();
      group.position.copy(position);

      const torusGeo = new THREE.TorusGeometry(radius, 0.12, 12, 40);
      const torusMat = new THREE.MeshStandardMaterial({
        color: COLORS.amber,
        emissive: COLORS.amber,
        emissiveIntensity: 0.5,
        roughness: 0.2
      });
      const ring1 = new THREE.Mesh(torusGeo, torusMat);
      group.add(ring1);

      const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.72, 0.08, 10, 32),
        new THREE.MeshBasicMaterial({ color: 0xfef08a, wireframe: true })
      );
      ring2.rotation.x = Math.PI / 3;
      group.add(ring2);

      archGroup.add(group);
      animatedRings.push(group);
      return ring1;
    }

    function clearSceneStage() {
      disposeLlmObject(archGroup);disposeLlmObject(residualGroup);
      while (archGroup.children.length > 0) {
        archGroup.remove(archGroup.children[0]);
      }
      while (residualGroup.children.length > 0) {
        residualGroup.remove(residualGroup.children[0]);
      }
      labelsContainer.innerHTML = '';
      interactiveMeshes = [];
      htmlLabels = [];
      flowParticles = [];
      animatedRings = [];
      kvCacheMeshes = [];
      moeInstancedMesh = null;
      moeExpertPositions = [];
      moeLaserGroup = null;
      selectionHalo = null;
    }

    /*************************************************************************
     * 4. BUILDERS FOR L1 (MACRO), L2 (LAYER EXPLODED), L3 (OPERATOR MICRO)
     *************************************************************************/
    function buildArchitectureScene(animateCamera = true) {
      clearSceneStage();
      if(state.config.availability==='preview'){
        buildPreviewInterface();
      } else if (state.lod === 1) {
        buildL1MacroTower();
      } else if (state.lod === 2) {
        buildL2ExplodedLayer();
      } else {
        buildL3MicroOperators();
      }

      if(state.config.verified&&state.lod>1){
        const c=state.config,l=getLlmLayer(c,state.activeLayer);
        if(c.residual==='mhc')for(let i=1;i<c.hc_mult;i++){
          const z=(i-1)*.65+1.2;
          linkModules([[-18.5,1.2,z],[-10,6+i*.15,z],[-.5,.9,z]],COLORS.amber,true);
          linkModules([[-.5,.9,z],[9,6+i*.15,z],[18,.9,z]],COLORS.amber,true);
        }
        if(c.residual==='attnres'){
          moduleBlock('residual_add','Depth Block History','AttnRes · block size 12',-.6,-5.4,-2,COLORS.amber,4,1.8,3);
          linkModules([[-.6,-5.4,-2],[-4,-3,-3],[-12,0,0]],COLORS.amber,true);
          linkModules([[-.6,-5.4,-2],[2,-3,-3],[2.8,0,0]],COLORS.amber,true);
        }
        if(l.engram&&state.lod===3){
          moduleBlock('engram','Engram Lookup','当前层的条件记忆分支',-18,-4.8,1,COLORS.amber,3.4,1.8,3);
          linkModules([[-18,-4.8,1],[-18.5,0,0]],COLORS.amber);
        }
      }
      environment.setLod(state.lod);
      residualGroup.visible = state.showResiduals;
      labelsContainer.style.display = state.showLabels ? 'block' : 'none';
      updateAllMetricsAndUI();
      if(animateCamera)frameArchitecture();
    }

    function moduleBlock(id,title,sub,x,y,z,color,w=3.2,h=2.2,d=2.8){
      const mesh=createGlowingBlock(w,h,d,color,.92);mesh.position.set(x,y,z);archGroup.add(mesh);
      registerInteractiveNode(mesh,id,title,sub,new THREE.Vector3(0,h/2+.9,0));return mesh;
    }
    function linkModules(points,color=COLORS.cyanBright,residual=false){
      createConnectionTube(points.map(p=>new THREE.Vector3(...p)),color,.08,residual,3,.004);
    }
    function residualTitle(){return state.config.residual==='mhc'?'mHC · 4 路流混合':state.config.residual==='attnres'?'AttnRes · 深度聚合':'Residual Add (+)';}
    function buildPreviewInterface(){
      moduleBlock('attn_core','用户输入 / 上下文','≤ 1,048,576 tokens',-12,0,0,COLORS.emerald,5,3,4);
      moduleBlock('attn_core','Kimi K2.8 Preview','内部架构未公开',0,0,0,COLORS.violet,8,5,5);
      moduleBlock('attn_core','文本响应','kimi-for-coding',12,0,0,COLORS.cyan,5,3,4);
      linkModules([[-12,0,0],[0,0,0],[12,0,0]]);
    }
    function buildPublishedAttention(){
      const c=state.config,l=getLlmLayer(c,state.activeLayer),a=l.attention;
      if(a==='kda'){
        moduleBlock('kda_conv','Q / K / V + Short Conv',`kernel ${c.linear_attn_config.short_conv_kernel_size}`,-13.4,2,-1.7,COLORS.cyanBright,4.4);
        moduleBlock('kda_gate','Input-dependent Gate',`${c.linear_attn_config.num_heads} heads`,-13.4,-2.4,2.2,COLORS.amber,4.4);
        moduleBlock('kda_state','KDA Recurrent State',`${c.linear_attn_config.head_dim} dim / head`,-7.6,0,0,COLORS.violet,4.2,3.8,4);
        moduleBlock('attn_core','Readout + Output Proj','状态读取 / 门控',-3.6,0,0,COLORS.cyan,2.4,3,3);
        linkModules([[-18.5,0,0],[-13.4,2,-1.7],[-7.6,0,0],[-3.6,0,0]]);
        linkModules([[-18.5,0,0],[-13.4,-2.4,2.2],[-7.6,0,0]],COLORS.amber);
        linkModules([[-7.6,-1.8,0],[-9,-4.7,0],[-5.5,-4.7,0],[-7.6,-1.8,0]],COLORS.violet);
      }else if(a==='csa2'||a==='swa'){
        moduleBlock('mla_q_latent','Query Low-rank',`rank ${c.q_lora_rank}`,-14.3,3,-2,COLORS.cyanBright,3.4);
        moduleBlock('attn_core','SWA · 128-token Window','局部注意力',-9.4,3,-2,COLORS.cyan,4);
        linkModules([[-18.5,0,0],[-14.3,3,-2],[-9.4,3,-2],[-3.5,0,0]]);
        if(a==='csa2'){
          moduleBlock('csa_cache','Shared Global KV',`${l.stage} · ${l.indexer}`,-14.3,-3,2.5,COLORS.emerald,3.4);
          kvCacheMeshes.push(archGroup.children.at(-1));
          moduleBlock('indexer','Hierarchical Indexer',`Top-${c.index_topk} · ${l.indexer}`,-9.4,-3,2.5,COLORS.amber,4);
          moduleBlock('attn_core','CSA2 · Sparse Read',`压缩比 ${c.compress_ratios[state.activeLayer]}`,-3.5,0,0,COLORS.cyan,3,3.5,3.5);
          linkModules([[-14.3,-3,2.5],[-9.4,-3,2.5],[-3.5,0,0]],COLORS.emerald);
          linkModules([[-14.3,3,-2],[-9.4,-3,2.5]],COLORS.amber);
        }else moduleBlock('attn_core','Local Attention Output','本层无全局分支',-3.5,0,0,COLORS.cyan,3,3.5,3.5);
      }else{
        moduleBlock('mla_q_latent','Query Latent',`rank ${c.q_lora_rank}`,-14.2,3,-2.4,COLORS.cyanBright,3.4);
        const kv=moduleBlock('mla_kv_latent','Latent KV Cache',`${c.kv_lora_rank} + ${c.qk_rope_head_dim} channels`,-14.2,-2.9,2.4,COLORS.emerald,3.4);
        kvCacheMeshes.push(kv);
        moduleBlock('attn_core',a==='dsa'?'Sparse MLA Core':'MLA Core',`${c.num_attention_heads} heads`,-4.5,0,0,COLORS.cyan,3.4,4,3.6);
        linkModules([[-18.5,0,0],[-14.2,3,-2.4],[-4.5,0,0]]);
        linkModules([[-18.5,0,0],[-14.2,-2.9,2.4],[-4.5,0,0]],COLORS.emerald);
        if(c.qk_rope_head_dim>0){
          const ring=createRoPERing(new THREE.Vector3(-9.7,0,0),1);
          registerInteractiveNode(ring,'rope_decoupled','RoPE Branch',`${c.qk_rope_head_dim} dim`,new THREE.Vector3(0,1.8,0));
          linkModules([[-14.2,3,-2.4],[-9.7,0,0],[-4.5,0,0]],COLORS.amber);
        }
        if(a==='dsa'){
          moduleBlock('indexer','DSA Indexer',`Top-${c.index_topk} · ${l.indexer??'full'}`,-9.4,-4.3,-2.4,COLORS.amber,3.6);
          linkModules([[-18.5,0,0],[-9.4,-4.3,-2.4],[-4.5,0,0]],COLORS.amber);
        }
        if(c.mla_use_output_gate){
          moduleBlock('output_gate','Output Gate','Gated MLA',-1.9,-3.4,2,COLORS.violet,2.3,1.7,2);
          linkModules([[-4.5,0,0],[-1.9,-3.4,2],[-.5,0,0]],COLORS.violet);
        }
      }
    }

    // ==================== L1: MACRO MODEL TOWER ====================
    function buildL1MacroTower() {
      const cfg = state.config;
      const totalLayers = cfg.num_layers;
      const widthScale = THREE.MathUtils.clamp(cfg.hidden_size / 1024, 3.5, 9.5);

      // 1. Token Embedding at bottom
      const embBlock = createGlowingBlock(widthScale * 1.15, 1.1, widthScale * 1.15, COLORS.emerald, 0.9);
      embBlock.position.set(0, -6.2, 0);
      archGroup.add(embBlock);
      registerInteractiveNode(embBlock, 'embedding', 'Token Embedding', `[B, S, ${cfg.hidden_size}]`, new THREE.Vector3(-widthScale * 0.85, 0, 0));

      // 2. Stacked Decoder Layers (Visualized as 24 representative slabs mapped to totalLayers)
      const visualSlabs = Math.min(totalLayers, 28);
      const towerHeight = 14.5;
      const slabGap = towerHeight / visualSlabs;
      const slabThickness = slabGap * 0.68;

      for (let i = 0; i < visualSlabs; i++) {
        const realLayerIdx = Math.floor((i / (visualSlabs-1)) * (totalLayers-1));
        const isDense = realLayerIdx < cfg.first_k_dense_replace || cfg.n_routed_experts === 0;
        const layer=getLlmLayer(cfg,realLayerIdx);
        const isSSM = ['ssm','kda'].includes(layer.attention);
        const isSelectedLayer = Math.abs(realLayerIdx - state.activeLayer) <= Math.ceil(totalLayers / visualSlabs / 2);

        let slabColor = isDense ? COLORS.cyan : COLORS.magenta;
        if (isSSM) slabColor = COLORS.violet;
        if(cfg.encoder_layers)slabColor=realLayerIdx<cfg.encoder_layers?COLORS.cyan:COLORS.magenta;
        if (isSelectedLayer) slabColor = COLORS.amber;

        const w = isSelectedLayer ? widthScale * 1.18 : widthScale;
        const slab = createGlowingBlock(w, slabThickness, w, slabColor, isSelectedLayer ? 0.98 : 0.72);
        const yPos = -4.3 + i * slabGap;
        slab.position.set(0, yPos, 0);
        archGroup.add(slab);

        const layerTypeTag = `${layer.stage} · ${ATTENTION_NAMES[layer.attention]} + ${isDense?'Dense':'MoE'}`;
        const showSlabLabel = isSelectedLayer || i === 0 || i === visualSlabs - 1;
        registerInteractiveNode(
          slab,
          isDense ? 'attn_core' : 'moe_experts',
          `Layer #${realLayerIdx}`,
          layerTypeTag,
          new THREE.Vector3(w * 0.75, 0, 0),
          showSlabLabel
        );
        slab.userData.layerIndex = realLayerIdx;
      }

      if(cfg.vision){
        moduleBlock('vision_encoder','Vision Encoder + Projector',`${cfg.vision.num_hidden_layers??cfg.vision.depth??cfg.vision.vt_num_hidden_layers} 层视觉主干`,-10,-5.2,0,COLORS.violet,4,3,4);
        linkModules([[-10,-5.2,0],[-6.5,-7,1],[0,-6.2,0]],COLORS.violet);
      }
      if(cfg.encoder_layers){
        moduleBlock('ced_bridge','CED · 20 Encoder → 20 Decoder','最终编码器隐状态',10,2.8,0,COLORS.amber,4.4,2.6,4);
        moduleBlock('csa_cache','跨层共享 Global KV','来源层 #2 / #8 / #14 / #20',10,7.1,0,COLORS.emerald,4.4,2.4,4);
        linkModules([[0,2.8,0],[10,2.8,0],[10,7.1,0],[0,9.4,0]],COLORS.emerald);
      }
      if(cfg.engram_layer_ids){
        moduleBlock('engram','Engram · 196 B',`记忆层 #${cfg.engram_layer_ids.join(' / #')}`,-10,2.8,0,COLORS.amber,4,3,4);
        linkModules([[-10,2.8,0],[-5,0,1],[0,-3.8,0]],COLORS.amber);
        linkModules([[-10,2.8,0],[-5,3,1],[0,1,0]],COLORS.amber);
      }
      if(cfg.residual==='attnres'){
        moduleBlock('residual_add','Attention Residuals','按深度块聚合历史表示',10,3,0,COLORS.amber,4.5,2.4,4);
        for(const y of [-2,3,8])linkModules([[0,y,0],[6,y,1],[10,3,0]],COLORS.amber,true);
      }

      // 3. Final RMSNorm
      const normBlock = createGlowingBlock(widthScale * 0.95, 0.8, widthScale * 0.95, COLORS.emerald, 0.9);
      normBlock.position.set(0, 11.2, 0);
      archGroup.add(normBlock);
      registerInteractiveNode(normBlock, 'rmsnorm', 'Final RMSNorm', `[B, S, ${cfg.hidden_size}]`, new THREE.Vector3(-widthScale * 0.75, 0, 0));

      // 4. LM Head
      const lmHead = createGlowingBlock(widthScale * 1.1, 1.2, widthScale * 0.8, COLORS.cyanBright, 0.9);
      lmHead.position.set(cfg.has_mtp ? -3.4 : 0, 13.5, 0);
      archGroup.add(lmHead);
      registerInteractiveNode(lmHead, 'embedding', 'LM Head (Logits)', `[B, S, Vocab]`, new THREE.Vector3(0, 1.1, 0));

      // 5. Optional Multi-Token Prediction (MTP) Branch for DeepSeek-V3/R1
      if (cfg.has_mtp) {
        const mtpBlock = createGlowingBlock(3.8, 2.2, 3.8, COLORS.amber, 0.92);
        mtpBlock.position.set(5.2, 12.8, 0);
        archGroup.add(mtpBlock);
        registerInteractiveNode(mtpBlock, 'mtp_module', cfg.dspark_block_size?'DSpark 草稿 / 验证':'MTP 多 Token 预测头', cfg.dspark_block_size?`${cfg.dspark_block_size}-token block · ${cfg.num_nextn_predict_layers} 预测层`:`${cfg.num_nextn_predict_layers??1} next-n 预测层`, new THREE.Vector3(0, 1.7, 0));

        createConnectionTube([
          new THREE.Vector3(0, 10.5, 0),
          new THREE.Vector3(3.2, 11.2, 0),
          new THREE.Vector3(5.2, 12.8, 0)
        ], COLORS.amber, 0.12, false, 4, 0.006);
      }

      // Vertical spine particle stream through the tower
      createConnectionTube([
        new THREE.Vector3(0, -6.2, 0),
        new THREE.Vector3(0, 2.5, 0),
        new THREE.Vector3(0, 11.2, 0),
        new THREE.Vector3(cfg.has_mtp ? -3.4 : 0, 13.5, 0)
      ], COLORS.cyanBright, 0.14, false, 8, 0.005);

      // Residual highway arc along the side of the tower
      createConnectionTube([
        new THREE.Vector3(-widthScale * 0.58, -5.0, 0),
        new THREE.Vector3(-widthScale * 0.92, 3.0, 0),
        new THREE.Vector3(-widthScale * 0.58, 10.8, 0)
      ], COLORS.amber, 0.09, true, 5, 0.006);
    }

    // ==================== L2: SINGLE LAYER EXPLODED VIEW ====================
    function buildL2ExplodedLayer() {
      const cfg = state.config;
      const layer=getLlmLayer(cfg,state.activeLayer);
      const isDense = state.activeLayer < cfg.first_k_dense_replace || cfg.n_routed_experts === 0;
      const isSSM = cfg.attn_mode === 'ssm_hybrid' && (state.activeLayer % 4 !== 3);

      // Horizontal pipeline from x = -18 to x = +18
      const yBase = 0;

      // 1. Input Tensor Node
      const inNode = createGlowingBlock(1.8, 3.6, 3.6, COLORS.slate, 0.75);
      inNode.position.set(-17, yBase, 0);
      archGroup.add(inNode);
      registerInteractiveNode(inNode, 'residual_add', `Layer #${state.activeLayer} Input`, `h_{l-1}`, new THREE.Vector3(0, 2.5, 0));

      // 2. Input RMSNorm
      const norm1 = createGlowingBlock(1.6, 3.8, 3.8, COLORS.emerald, 0.9);
      norm1.position.set(-12, yBase, 0);
      archGroup.add(norm1);
      registerInteractiveNode(norm1, 'rmsnorm', 'Input RMSNorm', 'Pre-Attn Norm', new THREE.Vector3(0, 2.6, 0));

      // 3. Attention / Sequence Mixer Block
      const attnTitle = ATTENTION_NAMES[layer.attention];
      const attnSub = `${layer.stage} · ${layer.indexer??cfg.num_attention_heads+' heads'}`;
      const attnBlock = createGlowingBlock(4.8, 4.6, 4.8, COLORS.cyan, 0.9);
      attnBlock.position.set(-5.8, yBase, 0);
      archGroup.add(attnBlock);
      registerInteractiveNode(attnBlock, 'attn_core', attnTitle, attnSub, new THREE.Vector3(0, 3.1, 0));

      // Floating KV Cache badge block attached beneath Attention
      const kvScale = getKVCacheVisualScale();
      const kvBlock = createGlowingBlock(2.6 * kvScale, 1.3 * kvScale, 2.6 * kvScale, COLORS.emerald, 0.92);
      kvBlock.position.set(-5.8, yBase - 4.2, 2.2);
      archGroup.add(kvBlock);
      const isRecurrent=['kda','ssm'].includes(layer.attention);
      if(!isRecurrent)kvCacheMeshes.push(kvBlock);
      registerInteractiveNode(kvBlock,isRecurrent?(cfg.verified?'kda_state':'attn_core'):layer.attention==='swa'?'attn_core':cfg.encoder_layers?'csa_cache':'mla_kv_latent',isRecurrent?'Recurrent State':layer.attention==='swa'?'Local SWA State':cfg.encoder_layers?'SWA / Shared Global KV':'Attention KV Cache',isRecurrent?'递推状态 · 无逐 Token KV 表':layer.attention==='swa'?'128-token window':`${cfg.kv_lora_rank??cfg.head_dim} latent channels`,new THREE.Vector3(0,-1.5,0));

      createConnectionTube([
        new THREE.Vector3(-5.8, yBase - 2.2, 0),
        new THREE.Vector3(-5.8, yBase - 4.2, 2.2)
      ], COLORS.emerald, 0.08, false, 2, 0.008);

      // 4. First Residual Add (+)
      const resAdd1 = createJunction(1.15);
      resAdd1.position.set(0, yBase, 0);
      archGroup.add(resAdd1);
      registerInteractiveNode(resAdd1,'residual_add',residualTitle(),'Attention → 残差流混合',new THREE.Vector3(0,2,0));

      // 5. Post-Attention RMSNorm
      const norm2 = createGlowingBlock(1.6, 3.8, 3.8, COLORS.emerald, 0.9);
      norm2.position.set(4.5, yBase, 0);
      archGroup.add(norm2);
      registerInteractiveNode(norm2, 'rmsnorm', 'Post-Attn RMSNorm', 'Pre-FFN Norm', new THREE.Vector3(0, 2.6, 0));

      // 6. FFN / MoE Block
      const ffnTitle = isDense ? 'Dense FFN' : `${cfg.routed_expert_hidden_size?'LatentMoE':'MoE'} (${cfg.n_routed_experts} 专家)`;
      const ffnSub = isDense ? `d_ff = ${cfg.intermediate_size}` : `Top-${cfg.num_experts_per_tok} + ${cfg.n_shared_experts} Shared`;
      const ffnBlock = createGlowingBlock(5.2, 4.8, 5.2, COLORS.magenta, 0.9);
      ffnBlock.position.set(10.8, yBase, 0);
      archGroup.add(ffnBlock);
      registerInteractiveNode(ffnBlock, 'moe_experts', ffnTitle, ffnSub, new THREE.Vector3(0, 3.2, 0));

      // 7. Second Residual Add (+) & Output
      const resAdd2 = createJunction(1.15);
      resAdd2.position.set(17, yBase, 0);
      archGroup.add(resAdd2);
      registerInteractiveNode(resAdd2,'residual_add',residualTitle(),'FFN → 残差流混合',new THREE.Vector3(0,2,0));

      if(layer.engram){moduleBlock('engram','Engram Lookup','当前层的条件记忆分支',-13,-4,2,COLORS.amber);linkModules([[-17,0,0],[-13,-4,2],[-12,0,0]],COLORS.amber);}

      // Main Forward Pipeline Tube
      createConnectionTube([
        new THREE.Vector3(-17, yBase, 0),
        new THREE.Vector3(-12, yBase, 0),
        new THREE.Vector3(-5.8, yBase, 0),
        new THREE.Vector3(0, yBase, 0),
        new THREE.Vector3(4.5, yBase, 0),
        new THREE.Vector3(10.8, yBase, 0),
        new THREE.Vector3(17, yBase, 0)
      ], COLORS.cyanBright, 0.14, false, 10, 0.004);

      // Residual Bypass Arc 1 (Input -> ResAdd1)
      createConnectionTube([
        new THREE.Vector3(-15.5, yBase, 0),
        new THREE.Vector3(-11, yBase + 5.2, 0),
        new THREE.Vector3(-4, yBase + 5.2, 0),
        new THREE.Vector3(0, yBase + 1.0, 0)
      ], COLORS.amber, 0.11, true, 4, 0.005);

      // Residual Bypass Arc 2 (ResAdd1 -> ResAdd2)
      createConnectionTube([
        new THREE.Vector3(0, yBase + 1.0, 0),
        new THREE.Vector3(5, yBase + 5.2, 0),
        new THREE.Vector3(12.5, yBase + 5.2, 0),
        new THREE.Vector3(17, yBase + 1.0, 0)
      ], COLORS.amber, 0.11, true, 4, 0.005);

      // Tensor Shape Badges
      addTensorBadge(new THREE.Vector3(-14.5, yBase - 1.5, 0), 'hidden');
      addTensorBadge(new THREE.Vector3(2.2, yBase - 1.5, 0), 'hidden');
      addTensorBadge(new THREE.Vector3(14.2, yBase - 1.5, 0), 'hidden');
    }

    // ==================== L3: MICRO OPERATOR INTERNALS (MLA & 3D MOE MATRIX) ====================
    function buildL3MicroOperators() {
      const cfg = state.config;
      const isDense = state.activeLayer < cfg.first_k_dense_replace || cfg.n_routed_experts === 0;

      // ---------------- LEFT STAGE (x: -19 to -1): ATTENTION / MLA MICRO CIRCUIT ----------------
      // Input RMSNorm
      const normIn = createGlowingBlock(1.4, 3.4, 3.4, COLORS.emerald, 0.9);
      normIn.position.set(-18.5, 0, 0);
      archGroup.add(normIn);
      registerInteractiveNode(normIn, 'rmsnorm', 'Input RMSNorm', `[B, S, ${cfg.hidden_size}]`, new THREE.Vector3(0, 2.4, 0));

      if (cfg.verified) {
        buildPublishedAttention();
      } else if (cfg.attn_mode === 'mla') {
        // Branch 1 (Bottom/Front): Latent KV Compression c_t^KV (dim=512)
        const kvScale = getKVCacheVisualScale();
        const kvLatentBlock = createGlowingBlock(3.2 * kvScale, 1.8 * kvScale, 2.4 * kvScale, COLORS.emerald, 0.95);
        kvLatentBlock.position.set(-13.2, -2.6, 3.2);
        archGroup.add(kvLatentBlock);
        kvCacheMeshes.push(kvLatentBlock);
        registerInteractiveNode(kvLatentBlock, 'mla_kv_latent', 'Latent KV Cache (c_t^KV)', `d_c = ${cfg.kv_lora_rank} (压缩缓存)`, new THREE.Vector3(0, -1.8, 0));

        // Up-projection W^UK, W^UV
        const kvUpBlock = createGlowingBlock(2.2, 2.4, 2.2, COLORS.cyan, 0.88);
        kvUpBlock.position.set(-8.8, -1.8, 2.2);
        archGroup.add(kvUpBlock);
        registerInteractiveNode(kvUpBlock, 'mla_kv_latent', 'KV Up-Proj (W^UK, W^UV)', `矩阵吸收加速`, new THREE.Vector3(0, 1.9, 0));

        // Branch 2 (Middle): Decoupled Shared RoPE k_t^R
        const ropeRingMesh = createRoPERing(new THREE.Vector3(-11.2, 0.4, 0), 1.25);
        registerInteractiveNode(ropeRingMesh, 'rope_decoupled', 'Decoupled RoPE (W^KR)', `d_R = 64 (解耦位置编码)`, new THREE.Vector3(0, 1.9, 0));

        // Branch 3 (Top/Back): Query Latent Compression c_t^Q -> W^UQ + W^QR
        const qLatentBlock = createGlowingBlock(2.6, 2.0, 2.2, COLORS.cyanBright, 0.9);
        qLatentBlock.position.set(-13.2, 3.2, -2.5);
        archGroup.add(qLatentBlock);
        registerInteractiveNode(qLatentBlock, 'mla_q_latent', 'Query Latent (c_t^Q)', `d_q = ${cfg.q_lora_rank}`, new THREE.Vector3(0, 1.7, 0));

        const qRopeMesh = createRoPERing(new THREE.Vector3(-8.8, 3.2, -2.5), 0.95);
        registerInteractiveNode(qRopeMesh, 'mla_q_latent', 'Query Up-Proj + RoPE', `W^UQ ⊕ W^QR`, new THREE.Vector3(0, 1.6, 0));

        // Core FlashMLA Attention
        const mlaCore = createGlowingBlock(3.4, 4.2, 3.6, COLORS.cyan, 0.92);
        mlaCore.position.set(-4.5, 0, 0);
        archGroup.add(mlaCore);
        registerInteractiveNode(mlaCore, 'attn_core', `FlashMLA Core (${cfg.num_attention_heads} Heads)`, `Output Proj W^O`, new THREE.Vector3(0, 2.9, 0));

        // MLA Internal Connections
        createConnectionTube([new THREE.Vector3(-18.5, 0, 0), new THREE.Vector3(-13.2, -2.6, 3.2), new THREE.Vector3(-8.8, -1.8, 2.2), new THREE.Vector3(-4.5, -0.6, 0)], COLORS.emerald, 0.08, false, 4, 0.005);
        createConnectionTube([new THREE.Vector3(-18.5, 0, 0), new THREE.Vector3(-11.2, 0.4, 0), new THREE.Vector3(-4.5, 0.2, 0)], COLORS.amber, 0.07, false, 3, 0.006);
        createConnectionTube([new THREE.Vector3(-18.5, 0, 0), new THREE.Vector3(-13.2, 3.2, -2.5), new THREE.Vector3(-8.8, 3.2, -2.5), new THREE.Vector3(-4.5, 1.0, 0)], COLORS.cyanBright, 0.08, false, 4, 0.005);

        addTensorBadge(new THREE.Vector3(-13.2, -4.2, 3.2), 'kv_latent');
        addTensorBadge(new THREE.Vector3(-13.2, 4.8, -2.5), 'q_latent');
      } else if(cfg.attn_mode==='ssm_hybrid'&&state.activeLayer%4!==3){
        const ssm=createGlowingBlock(9.0,4.1,3.6,COLORS.cyan,.94);ssm.position.set(-9.5,0,0);archGroup.add(ssm);
        registerInteractiveNode(ssm,'attn_core','SSM State Update','结构示意 · 状态更新',new THREE.Vector3(0,2.9,0));
        createConnectionTube([new THREE.Vector3(-18.5,0,0),new THREE.Vector3(-9.5,0,0),new THREE.Vector3(-.5,0,0)],COLORS.cyanBright,.09,false,5,.005);
        addTensorBadge(new THREE.Vector3(-9.5,-3.1,0),'hidden');
      } else {
        // GQA / Hybrid Attention Micro Sub-graph
        const qProj = createGlowingBlock(2.4, 2.2, 2.2, COLORS.cyanBright, 0.9);
        qProj.position.set(-13.2, 2.8, -1.5);
        archGroup.add(qProj);
        registerInteractiveNode(qProj, 'attn_core', `Q Proj (${cfg.num_attention_heads} Heads)`, `Grouped Queries`, new THREE.Vector3(0, 1.7, 0));

        const kvScale = getKVCacheVisualScale();
        const kvProj = createGlowingBlock(2.6 * kvScale, 2.0 * kvScale, 2.4 * kvScale, COLORS.emerald, 0.92);
        kvProj.position.set(-13.2, -2.4, 1.8);
        archGroup.add(kvProj);
        kvCacheMeshes.push(kvProj);
        registerInteractiveNode(kvProj, 'mla_kv_latent', `GQA KV Cache (${cfg.num_key_value_heads || 8} KV Heads)`, `5:1 共享分组`, new THREE.Vector3(0, -1.7, 0));

        const ropeMesh = createRoPERing(new THREE.Vector3(-9.0, 0.4, 0), 1.3);
        registerInteractiveNode(ropeMesh, 'rope_decoupled', 'Rotary Embedding (RoPE)', `θ_i = 10000^(-2i/d)`, new THREE.Vector3(0, 1.9, 0));

        const gqaCore = createGlowingBlock(3.4, 4.2, 3.6, COLORS.cyan, 0.92);
        gqaCore.position.set(-4.5, 0, 0);
        archGroup.add(gqaCore);
        registerInteractiveNode(gqaCore, 'attn_core', 'Grouped-Query Attention', `FlashAttention-3 + W^O`, new THREE.Vector3(0, 2.9, 0));

        createConnectionTube([new THREE.Vector3(-18.5, 0, 0), new THREE.Vector3(-13.2, 2.8, -1.5), new THREE.Vector3(-9.0, 0.4, 0), new THREE.Vector3(-4.5, 0, 0)], COLORS.cyanBright, 0.08, false, 4, 0.005);
        createConnectionTube([new THREE.Vector3(-18.5, 0, 0), new THREE.Vector3(-13.2, -2.4, 1.8), new THREE.Vector3(-4.5, -0.8, 0)], COLORS.emerald, 0.08, false, 4, 0.005);
      }

      // Mid Residual Add (+) & Post-Attn RMSNorm
      const midAdd = createJunction(0.95);
      midAdd.position.set(-0.5, 0, 0);
      archGroup.add(midAdd);
      registerInteractiveNode(midAdd,'residual_add',residualTitle(),'Attention → residual stream',new THREE.Vector3(0,1.7,0));

      const normPost = createGlowingBlock(1.4, 3.4, 3.4, COLORS.emerald, 0.9);
      normPost.position.set(2.8, 0, 0);
      archGroup.add(normPost);
      registerInteractiveNode(normPost, 'rmsnorm', 'Post-Attn RMSNorm', `[B, S, ${cfg.hidden_size}]`, new THREE.Vector3(0, 2.4, 0));

      createConnectionTube([new THREE.Vector3(-4.5, 0, 0), new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(2.8, 0, 0)], COLORS.cyanBright, 0.11, false, 3, 0.005);

      // Residual Bypass Arc 1
      createConnectionTube([
        new THREE.Vector3(-18.5, 1.5, 0),
        new THREE.Vector3(-10, 6.6, 0),
        new THREE.Vector3(-0.5, 0.9, 0)
      ], COLORS.amber, 0.1, true, 4, 0.005);

      // ---------------- RIGHT STAGE (x: +3 to +19): DEEPSEEK MOE 3D MATRIX OR SWIGLU ----------------
      if (!isDense && cfg.n_routed_experts > 0) {
        // 1. Router / Top-K Gate Node
        const routerNode = createGlowingBlock(2.2, 2.6, 2.6, COLORS.amber, 0.94);
        routerNode.position.set(6.5, 0, 0);
        archGroup.add(routerNode);
        registerInteractiveNode(routerNode, 'moe_router', `MoE Router Gate`, `Top-${cfg.num_experts_per_tok} / ${cfg.n_routed_experts}`, new THREE.Vector3(0, 2.1, 0));

        // 2. Always-On Shared Expert (Emerald Branch on Front/Top)
        const sharedNode = createGlowingBlock(3.0, 1.8, 2.2, COLORS.emerald, 0.94);
        sharedNode.position.set(12.2, 4.4, 2.8);
        archGroup.add(sharedNode);
        registerInteractiveNode(sharedNode,'shared_expert',`${cfg.n_shared_experts} Shared Expert${cfg.n_shared_experts>1?'s':''}`,`所有 Token 常驻分支`,new THREE.Vector3(0,1.6,0));

        createConnectionTube([
          new THREE.Vector3(2.8, 0.5, 0),
          new THREE.Vector3(7.5, 3.8, 2.2),
          new THREE.Vector3(12.2, 4.4, 2.8),
          new THREE.Vector3(18.0, 0.5, 0)
        ], COLORS.emerald, 0.09, false, 4, 0.006);

        // 3. 3D InstancedMesh Matrix of Routed Experts (e.g., 256 experts arranged in a 16x8x2 3D grid)
        const nE = cfg.n_routed_experts;
        const cols = nE >= 128 ? 16 : 8;
        const depthLayers = nE>512?4:2;
        const rows = Math.ceil(nE / (cols * depthLayers));

        const boxGeo = new RoundedBoxGeometry(.46,.46,.46,1,.05);
        const boxMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness:.32,metalness:.5,emissive:0x132347,emissiveIntensity:.28
        });
        moeInstancedMesh = new THREE.InstancedMesh(boxGeo, boxMat, nE);
        moeInstancedMesh.position.set(12.2, -0.5, -0.5);
        archGroup.add(moeInstancedMesh);

        // Proxy bounding box for raycasting & label on the MoE 3D Matrix
        const proxyGridBox = new THREE.Mesh(
          new THREE.BoxGeometry(cols * 0.62, rows * 0.62, depthLayers*1.15),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        proxyGridBox.position.copy(moeInstancedMesh.position);
        archGroup.add(proxyGridBox);
        registerInteractiveNode(proxyGridBox, 'moe_experts', `${nE} 路由专家 3D 矩阵`, `Instanced Top-${cfg.num_experts_per_tok} 激活`, new THREE.Vector3(0, rows * 0.36 + 1.0, 0));

        moeExpertPositions = [];
        const dummy = new THREE.Object3D();
        let idx = 0;
        for (let z = 0; z < depthLayers; z++) {
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              if (idx >= nE) break;
              const lx = (x - (cols - 1) / 2) * 0.62;
              const ly = (y - (rows - 1) / 2) * 0.62;
              const lz = (z - (depthLayers - 1) / 2) * 1.15;
              dummy.position.set(lx, ly, lz);
              dummy.updateMatrix();
              moeInstancedMesh.setMatrixAt(idx, dummy.matrix);

              // World position for laser routing beams
              moeExpertPositions.push(new THREE.Vector3(
                moeInstancedMesh.position.x + lx,
                moeInstancedMesh.position.y + ly,
                moeInstancedMesh.position.z + lz
              ));
              idx++;
            }
          }
        }

        // Weighted Sum & Final Layer Residual Add
        const outAdd = createJunction(1.05);
        outAdd.position.set(18.0, 0, 0);
        archGroup.add(outAdd);
        registerInteractiveNode(outAdd,'residual_add',residualTitle(),`Layer #${state.activeLayer} Output`,new THREE.Vector3(0,1.9,0));

        moeRouterOrigin = routerNode.position.clone();
        moeSumTarget = outAdd.position.clone();
        moeLaserGroup = new THREE.Group();
        archGroup.add(moeLaserGroup);

        if(cfg.routed_expert_hidden_size){
          moduleBlock('latent_moe','Latent Down-Proj',`${cfg.hidden_size} → ${cfg.routed_expert_hidden_size}`,4.4,-4.2,1.8,COLORS.violet,2.8,1.8,2.4);
          moduleBlock('latent_moe','Latent Up-Proj',`${cfg.routed_expert_hidden_size} → ${cfg.hidden_size}`,17,-4.2,1.8,COLORS.violet,2.8,1.8,2.4);
          linkModules([[2.8,0,0],[4.4,-4.2,1.8],[6.5,0,0]],COLORS.magenta);
          moeSumTarget.set(17,-4.2,1.8);linkModules([[17,-4.2,1.8],[18,0,0]],COLORS.violet);
        }else createConnectionTube([new THREE.Vector3(2.8, 0, 0), new THREE.Vector3(6.5, 0, 0)], COLORS.magenta, 0.1, false, 2, 0.006);

        // Paint active Top-K experts and laser beams
      } else {
        // Dense SwiGLU Micro Sub-graph (Gate Proj + Up Proj -> SiLU * -> Down Proj)
        const gateProj = createGlowingBlock(3.0, 2.2, 2.4, COLORS.magenta, 0.9);
        gateProj.position.set(8.2, 2.4, -1.2);
        archGroup.add(gateProj);
        registerInteractiveNode(gateProj, 'moe_experts', 'Gate Proj (W_gate) + SiLU', `dim = ${cfg.intermediate_size}`, new THREE.Vector3(0, 1.8, 0));

        const upProj = createGlowingBlock(3.0, 2.2, 2.4, COLORS.violet, 0.9);
        upProj.position.set(8.2, -2.4, 1.2);
        archGroup.add(upProj);
        registerInteractiveNode(upProj, 'moe_experts', 'Up Proj (W_up)', `dim = ${cfg.intermediate_size}`, new THREE.Vector3(0, -1.8, 0));

        const downProj = createGlowingBlock(3.2, 3.6, 3.2, COLORS.magenta, 0.92);
        downProj.position.set(13.8, 0, 0);
        archGroup.add(downProj);
        registerInteractiveNode(downProj, 'moe_experts', 'Element-wise ⊙ & Down Proj', `${cfg.intermediate_size} → ${cfg.hidden_size}`, new THREE.Vector3(0, 2.5, 0));

        const outAdd = createJunction(1.05);
        outAdd.position.set(18.0, 0, 0);
        archGroup.add(outAdd);
        registerInteractiveNode(outAdd, 'residual_add', 'Final Residual Add (+)', `Layer #${state.activeLayer} Output`, new THREE.Vector3(0, 1.9, 0));

        createConnectionTube([new THREE.Vector3(2.8, 0, 0), new THREE.Vector3(8.2, 2.4, -1.2), new THREE.Vector3(13.8, 0, 0), new THREE.Vector3(18.0, 0, 0)], COLORS.magenta, 0.09, false, 4, 0.005);
        createConnectionTube([new THREE.Vector3(2.8, 0, 0), new THREE.Vector3(8.2, -2.4, 1.2), new THREE.Vector3(13.8, 0, 0)], COLORS.violet, 0.09, false, 3, 0.005);
      }

      // Residual Bypass Arc 2 (MidAdd -> OutAdd)
      createConnectionTube([
        new THREE.Vector3(-0.5, 0.9, 0),
        new THREE.Vector3(9.0, 6.8, 0),
        new THREE.Vector3(18.0, 0.9, 0)
      ], COLORS.amber, 0.1, true, 4, 0.005);
    }

    // Update 3D MoE InstancedMesh colors and glowing laser routing beams
    function updateMoERoutingVisuals() {
      const cfg = state.config;
      const nE = cfg.n_routed_experts;
      const topK = getLlmLayer(cfg,state.activeLayer).dense?0:(cfg.num_experts_per_tok??0);

      // Ensure activeExperts indices are valid for current nE
      state.activeExperts = state.activeExperts.filter(idx => idx < nE);
      if(state.activeExperts.length<topK)state.activeExperts=chooseLlmExperts(cfg);
      state.activeExperts = state.activeExperts.slice(0, topK).sort((a, b) => a - b);

      // Update Left HUD Active Experts Badges
      get('topk-count-label').textContent = topK;
      get('total-experts-label').textContent = nE??'—';
      const listEl = get('active-experts-list');
      if (!nE || topK===0) {
        listEl.innerHTML = `<span class="text-slate-400">当前层不进行专家路由；Top-K 仅在 MoE 层演示</span>`;
      } else {
        listEl.innerHTML = state.activeExperts.map(id =>
          `<span class="px-1.5 py-0.5 rounded bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-400/50 font-semibold">E#${id}</span>`
        ).join('');
      }

      if (!moeInstancedMesh || !moeLaserGroup) return;

      // Color each instance: bright glowing magenta/cyan for active Top-K, dim slate for inactive
      const color = new THREE.Color();
      const dummy = new THREE.Object3D();
      for (let i = 0; i < nE; i++) {
        const isActive = state.activeExperts.includes(i);
        if (isActive) {
          color.setHex(0xd2b0ff).multiplyScalar(1.5); // Active compute cells
        } else {
          color.setHex(0x415579); // Cool, legible inactive silicon
        }
        moeInstancedMesh.setColorAt(i, color);

        // Slightly scale up active expert cubes
        const pos = moeExpertPositions[i];
        dummy.position.set(
          pos.x - moeInstancedMesh.position.x,
          pos.y - moeInstancedMesh.position.y,
          pos.z - moeInstancedMesh.position.z
        );
        const s = isActive ? 1.38 : 0.88;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        moeInstancedMesh.setMatrixAt(i, dummy.matrix);
      }
      moeInstancedMesh.instanceColor.needsUpdate = true;
      moeInstancedMesh.instanceMatrix.needsUpdate = true;

      // Rebuild glowing laser beams from Router -> Top-K Experts -> Weighted Sum
      disposeLlmObject(moeLaserGroup);
      while (moeLaserGroup.children.length > 0) {
        moeLaserGroup.remove(moeLaserGroup.children[0]);
      }

      state.activeExperts.forEach((expertIdx) => {
        const expPos = moeExpertPositions[expertIdx];
        if (!expPos) return;

        // Curve 1: Router -> Active Expert
        const c1 = new THREE.CatmullRomCurve3([
          moeRouterOrigin,
          new THREE.Vector3((moeRouterOrigin.x + expPos.x) * 0.5, expPos.y * 1.15, expPos.z * 1.2),
          expPos
        ]);
        moeLaserGroup.add(createEnergyConduit(c1,0xcbb0ff,flowClock,{radius:.031,repeats:2,rate:.44}));

        // Curve 2: Active Expert -> Output Sum
        const c2 = new THREE.CatmullRomCurve3([
          expPos,
          new THREE.Vector3((expPos.x + moeSumTarget.x) * 0.5, expPos.y * 1.15, expPos.z * 1.2),
          moeSumTarget
        ]);
        moeLaserGroup.add(createEnergyConduit(c2,0xb7a0ff,flowClock,{radius:.028,repeats:2,rate:.44}));
      });
    }

    function getKVCacheVisualScale() {
      const bFactor = Math.log2(state.batchSize + 1) / 4;
      const sFactor = Math.log2(state.seqLen / 256) / 5;
      return THREE.MathUtils.clamp(0.75 + (bFactor + sFactor) * 0.35, 0.75, 1.65);
    }

    /*************************************************************************
     * 5. LIVE METRICS, KV CACHE MEMORY & INSPECTOR UPDATER
     *************************************************************************/
    function updateAllMetricsAndUI() {
      updateMoERoutingVisuals();
      const cfg = state.config;
      const B = state.batchSize;
      const S = state.seqLen;
      const bytes = state.precisionBytes;
      const L = cfg.num_layers;

      // 1. Calculate KV Cache Memory (GB) vs Standard MHA Baseline
      // Standard MHA per token per layer = 2 (K & V) * num_heads * head_dim(128)
      const kv=estimateLlmKv(cfg,{batchSize:B,seqLen:S,precisionBytes:bytes});
      get('kv-arch-name').textContent=kv.label;
      get('kv-current-gb').textContent=kv.currentGB===null?'未披露':kv.currentGB.toFixed(3)+' GiB';
      get('kv-baseline-gb').textContent=kv.baselineGB===null?'—':kv.baselineGB.toFixed(2)+' GiB';
      get('kv-saving-badge').textContent=kv.savingPct===null?(cfg.availability==='preview'?'不推算':'官方全局口径'):`载荷减少 ${kv.savingPct.toFixed(1)}%`;
      get('kv-current-bar').style.width=kv.currentGB===null?'0%':`${Math.min(100,Math.max(2,kv.currentGB/kv.baselineGB*100))}%`;
      get('kv-estimate-note').textContent=kv.note;

      // Scale 3D KV Cache blocks live
      const kvScale = getKVCacheVisualScale();
      kvCacheMeshes.forEach(mesh => {
        mesh.scale.set(kvScale, kvScale, kvScale);
      });

      const params=estimateLlmParameters(cfg);
      get('total-params-caption').textContent=params.official?'参数规模（官方）':'参数规模（矩阵估算）';
      get('active-params-caption').textContent=cfg.active_caption??(params.official?'单 Token 激活（官方）':'单 Token 激活（矩阵估算）');
      get('total-params-val').textContent=params.total;
      get('active-params-val').textContent=params.active;
      renderModelSummary(root,cfg,state.activeLayer,index=>{state.selectedNodeId='attn_core';setActiveLayer(index);});

      // 3. Update 3D Tensor Shape Badges
      htmlLabels.forEach(item => {
        if (item.isTensorBadge) {
          item.el.textContent = getDynamicShapeText(item.shapeType);
        }
      });

      // 4. Refresh Inspector Panel & Config JSON Preview
      renderInspectorPanel(state.selectedNodeId);
      renderConfigEditorInputs();
    }

    function selectComponent(nodeId, mesh = null) {
      state.selectedNodeId = nodeId;
      renderInspectorPanel(nodeId);

      // Add or move selection wireframe halo around clicked 3D block
      if (selectionHalo && selectionHalo.parent) {
        disposeLlmObject(selectionHalo);selectionHalo.parent.remove(selectionHalo);
      }
      if (mesh) {
        const box = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        box.getSize(size);
        selectionHalo=createSelectionCorners(size.multiplyScalar(1.1));
        mesh.getWorldPosition(selectionHalo.position);
        archGroup.add(selectionHalo);
      }
    }

    function renderInspectorPanel(nodeId) {
      const info = getComponentDetails(nodeId);
      get('scene-selection-title').textContent=info.title;
      get('scene-selection-desc').textContent=info.desc;
      get('insp-category').textContent = info.category;
      get('insp-title').textContent = info.title;
      get('insp-desc').textContent = info.desc;
      get('insp-input-shape').textContent = info.inShape;
      get('insp-output-shape').textContent = info.outShape;
      get('insp-params').textContent = info.params;
      get('insp-params-formula').textContent = info.paramsFormula;
      get('insp-flops').textContent = info.flops;
      get('insp-flops-formula').textContent = info.flopsFormula;
      get('insp-math').innerHTML = info.math;
      get('insp-code').textContent = info.code;
    }

    function renderConfigEditorInputs() {
      const cfg = state.config;
      if(cfg.availability==='preview'){
        root.querySelectorAll('#tab-config-content input').forEach(el=>el.value='');
        get('config-json-preview').textContent=JSON.stringify({model_id:cfg.model_id,max_context_tokens:cfg.max_position_embeddings,architecture:'未披露',source:cfg.source_url},null,2);return;
      }
      get('cfg-hidden-size').value = cfg.hidden_size;
      get('cfg-num-layers').value = cfg.num_layers;
      get('cfg-num-heads').value = cfg.num_attention_heads;
      get('cfg-kv-param').value = cfg.kv_lora_rank??'';
      get('cfg-routed-experts').value = cfg.n_routed_experts;
      get('cfg-topk').value = cfg.num_experts_per_tok;

      const hfJson = {
        architectures: [cfg.archType],
        model_type: cfg.id,
        hidden_size: cfg.hidden_size,
        num_hidden_layers: cfg.num_layers,
        num_attention_heads: cfg.num_attention_heads,
        ...(cfg.attn_mode === 'mla'
          ? { kv_lora_rank: cfg.kv_lora_rank, q_lora_rank: cfg.q_lora_rank, qk_rope_head_dim: 64 }
          : { num_key_value_heads: cfg.num_key_value_heads || 8 }),
        ...(cfg.n_routed_experts > 0
          ? {
              n_routed_experts: cfg.n_routed_experts,
              num_experts_per_tok: cfg.num_experts_per_tok,
              n_shared_experts: cfg.n_shared_experts,
              moe_intermediate_size: cfg.moe_intermediate_size,
              routed_scaling_factor: 2.5
            }
          : { intermediate_size: cfg.intermediate_size }),
        rms_norm_eps: 1e-6,
        torch_dtype: state.precision
      };
      get('config-json-preview').textContent = JSON.stringify(cfg.verified?cfg.raw_config:hfJson, null, 2);
    }

    /*************************************************************************
     * 6. RAYCASTING, HOVER TOOLTIPS & EVENT LISTENERS
     *************************************************************************/
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const tooltip = get('hover-tooltip');
    const tooltipTitle = get('tooltip-title');
    const tooltipSub = get('tooltip-sub');
    let hoveredMesh = null;

    root.addEventListener('mousemove', (e) => {
      // Ignore if hovering over HUD panels
      if (e.target !== renderer.domElement) {
        hoveredMesh=null;
        tooltip.classList.add('hidden');
        container.style.cursor = 'default';
        return;
      }

      const rect=container.getBoundingClientRect();
      mouse.x=((e.clientX-rect.left)/rect.width)*2-1;
      mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveMeshes, false);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        hoveredMesh = hit;
        container.style.cursor = 'pointer';
        tooltipTitle.textContent = hit.userData.title || '3D Module';
        tooltipSub.textContent = hit.userData.subtitle || '';
        tooltip.style.left = `${Math.min(container.clientWidth - 260, e.clientX-container.getBoundingClientRect().left+16)}px`;
        tooltip.style.top = `${Math.min(container.clientHeight - 90, e.clientY-container.getBoundingClientRect().top+16)}px`;
        tooltip.classList.remove('hidden');
      } else {
        hoveredMesh = null;
        container.style.cursor = 'default';
        tooltip.classList.add('hidden');
      }
    });

    let pointerStart=null;
    renderer.domElement.addEventListener('pointerdown',e=>{pointerStart=[e.clientX,e.clientY];});
    const pick=e=>{const rect=container.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);camera.updateMatrixWorld(true);raycaster.setFromCamera(mouse,camera);return raycaster.intersectObjects(interactiveMeshes,false)[0]?.object;};
    renderer.domElement.addEventListener('click',e=>{
      if(pointerStart&&Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>6)return;
      const mesh=pick(e);if(!mesh?.userData.nodeId)return;
      if(typeof mesh.userData.layerIndex==='number'){setActiveLayer(mesh.userData.layerIndex);selectComponent(mesh.userData.nodeId);}
      else selectComponent(mesh.userData.nodeId,mesh);
    });
    renderer.domElement.addEventListener('dblclick',e=>{if(pick(e))drillDownLOD();});

    function drillDownLOD() {
      const nextLod = state.lod < 3 ? state.lod + 1 : 1;
      setLOD(nextLod);
    }

    function setLOD(lodLevel) {
      if(state.config.availability==='preview')lodLevel=1;
      state.lod = lodLevel;root.dataset.lod=String(lodLevel);
      root.querySelectorAll('.lod-btn').forEach(btn => {
        const isCurrent = parseInt(btn.dataset.lod) === lodLevel;
        btn.className = isCurrent
          ? 'lod-btn px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-400/50 shadow-sm shadow-fuchsia-500/20'
          : 'lod-btn px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 text-slate-300 hover:bg-slate-800/70 border border-transparent';
      });
      buildArchitectureScene(true);
    }

    function setActiveLayer(layerIdx) {
      const cfg = state.config;
      state.activeLayer = THREE.MathUtils.clamp(layerIdx, 0, (cfg.num_layers??1) - 1);
      get('layer-slider').max = Math.max(1,(cfg.num_layers??1) - 1);
      get('layer-slider').value = state.activeLayer;

      const layer=getLlmLayer(cfg,state.activeLayer);
      get('active-layer-badge').textContent=cfg.availability==='preview'?'内部未披露':`#${state.activeLayer} · ${ATTENTION_NAMES[layer.attention]} · ${layer.dense?'Dense':'MoE'}`;
      get('layer-range-min').textContent=cfg.availability==='preview'?'产品接口视图':'层号从 0 开始';
      get('layer-range-max').textContent=cfg.num_layers?`共 ${cfg.num_layers} 层 · ${layer.stage}`:'不填充推测层数';

      buildArchitectureScene(false);
    }

    initializeModelPicker(root,ARCH_PRESETS,initialKey,key=>{
      state.presetKey=key;root.dataset.preset=key;
      state.config=normalizeLlmConfig(ARCH_PRESETS[key]);
      state.activeLayer=Math.min(4,(state.config.num_layers??1)-1);
      state.activeExperts=chooseLlmExperts(state.config);
      state.selectedNodeId='attn_core';
      if(state.config.availability==='preview')state.lod=1;
      root.dataset.lod=String(state.lod);
      state.seqLen=Math.min(state.seqLen,state.config.max_position_embeddings??32768);
      get('seq-slider').value=state.seqLen;get('seq-val').textContent=state.seqLen.toLocaleString();
      setActiveLayer(state.activeLayer);
      setLOD(state.lod);
    });

    // LOD Switcher Buttons
    root.querySelectorAll('.lod-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setLOD(parseInt(btn.dataset.lod));
      });
    });

    // Active Layer Slider
    get('layer-slider').addEventListener('input', (e) => {
      setActiveLayer(parseInt(e.target.value));
    });

    // Trigger Token Routing (Random Top-K MoE Reroute)
    get('reroute-moe-btn').addEventListener('click', () => {
      const nE = state.config.n_routed_experts;
      const topK = state.config.num_experts_per_tok;
      if (nE === 0) return;

      state.activeExperts=chooseLlmExperts(state.config);
      updateMoERoutingVisuals();
      selectComponent('moe_router');
    });

    // Particle Flow Toggle
    get('toggle-flow-btn').addEventListener('click', (e) => {
      state.flowRunning = !state.flowRunning;
      e.target.textContent = state.flowRunning ? '粒子流: 运行中' : '粒子流: 已暂停';
    });

    // Hyperparameter Sliders (Batch Size, Seq Length, Precision)
    get('batch-slider').addEventListener('input', (e) => {
      state.batchSize = parseInt(e.target.value);
      get('batch-val').textContent = state.batchSize;
      updateAllMetricsAndUI();
    });

    get('seq-slider').addEventListener('input', (e) => {
      state.seqLen = parseInt(e.target.value);
      get('seq-val').textContent = state.seqLen;
      updateAllMetricsAndUI();
    });

    root.querySelectorAll('.prec-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prec = btn.dataset.prec;
        state.precision = prec;
        state.precisionBytes = prec === 'bf16' ? 2 : (prec === 'fp8' ? 1 : 0.5);
        get('precision-bytes-label').textContent = `${state.precisionBytes} Byte / Elem`;

        root.querySelectorAll('.prec-btn').forEach(b => {
          const active = b.dataset.prec === prec;
          b.className = active
            ? 'prec-btn py-1.5 rounded-lg font-mono text-xs border border-cyan-400/50 bg-cyan-500/20 text-cyan-200 font-semibold transition'
            : 'prec-btn py-1.5 rounded-lg font-mono text-xs border border-slate-700/80 text-slate-300 hover:bg-slate-800/60 transition';
        });
        updateAllMetricsAndUI();
      });
    });

    // Right Panel Tabs (Inspector vs config.json Editor)
    const tabInspBtn = get('tab-inspector-btn');
    const tabCfgBtn = get('tab-config-btn');
    const tabInspContent = get('tab-inspector-content');
    const tabCfgContent = get('tab-config-content');

    tabInspBtn.addEventListener('click', () => {
      tabInspContent.classList.remove('hidden');
      tabCfgContent.classList.add('hidden');
      tabInspBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 flex items-center gap-1.5 transition';
      tabCfgBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent flex items-center gap-1.5 transition';
    });

    tabCfgBtn.addEventListener('click', () => {
      tabCfgContent.classList.remove('hidden');
      tabInspContent.classList.add('hidden');
      tabCfgBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/40 flex items-center gap-1.5 transition';
      tabInspBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent flex items-center gap-1.5 transition';
    });

    // Apply Live config.json Edits
    get('apply-config-btn').addEventListener('click',()=>{
      if(state.config.verified||state.config.availability==='preview')return;
      state.config=normalizeLlmConfig({...state.config,hidden_size:get('cfg-hidden-size').value,num_layers:get('cfg-num-layers').value,num_attention_heads:get('cfg-num-heads').value,kv_lora_rank:get('cfg-kv-param').value,n_routed_experts:get('cfg-routed-experts').value,num_experts_per_tok:get('cfg-topk').value});
      state.activeExperts=chooseLlmExperts(state.config);setActiveLayer(Math.min(state.activeLayer,state.config.num_layers-1));
    });

    // Copy the visible implementation sample.
    get('copy-code-btn').addEventListener('click',async()=>{
      const text=get('insp-code').textContent;let copied=false;
      try{await navigator.clipboard.writeText(text);copied=true;}catch{const field=document.createElement('textarea');field.value=text;root.append(field);field.select();try{copied=document.execCommand('copy');}finally{field.remove();}}
      if(disposed)return;const label=get('copy-code-text');label.textContent=copied?'已复制!':'复制失败，请选中文本复制';clearTimeout(copyTimer);copyTimer=setTimeout(()=>{if(!disposed)label.textContent='复制代码';},1800);
    });

    // Bottom Camera & Viewport Controls
    get('toggle-immersive-btn').addEventListener('click',()=>{
      const immersive=root.classList.toggle('llm-immersive');
      get('toggle-immersive-btn').setAttribute('aria-pressed',String(immersive));
      get('immersive-button-text').textContent=immersive?'退出沉浸':'沉浸视图';
    });
    get('toggle-glow-btn').addEventListener('click',()=>{glowEnabled=!glowEnabled;syncGlowButton();});
    get('scene-open-inspector').addEventListener('click',()=>{
      root.classList.remove('llm-immersive');get('toggle-immersive-btn').setAttribute('aria-pressed','false');get('immersive-button-text').textContent='沉浸视图';
      get('tab-inspector-btn').click();get('right-panel').scrollIntoView({block:'nearest',behavior:'instant'});
    });
    root.querySelectorAll('.cam-focus-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.focus;
        frameArchitecture(target==='attn'?'attn':target==='ffn'?'ffn':'all');
      });
    });

    get('cam-reset-btn').addEventListener('click', () => {
      frameArchitecture();
    });

    get('cam-top-btn').addEventListener('click', () => {
      frameArchitecture('all',new THREE.Vector3(0,1,.03));
    });

    get('cam-side-btn').addEventListener('click', () => {
      frameArchitecture('all',new THREE.Vector3(0,.05,1));
    });

    get('toggle-rotate-btn').addEventListener('click', (e) => {
      state.autoRotate = !state.autoRotate;
      controls.autoRotate = state.autoRotate;
      controls.autoRotateSpeed = 1.6;
      e.currentTarget.classList.toggle('bg-fuchsia-500/20', state.autoRotate);
      e.currentTarget.classList.toggle('text-fuchsia-200', state.autoRotate);
    });

    get('toggle-residual-btn').addEventListener('click', (e) => {
      state.showResiduals = !state.showResiduals;
      residualGroup.visible = state.showResiduals;
      e.currentTarget.classList.toggle('bg-amber-500/20', state.showResiduals);
      e.currentTarget.classList.toggle('text-amber-200', state.showResiduals);
    });

    get('toggle-labels-btn').addEventListener('click', (e) => {
      state.showLabels = !state.showLabels;
      labelsContainer.style.display = state.showLabels ? 'block' : 'none';
      e.currentTarget.classList.toggle('bg-cyan-500/20', state.showLabels);
      e.currentTarget.classList.toggle('text-cyan-200', state.showLabels);
    });

    // Collapsible Left/Right Panels for mobile or full-canvas viewing
    get('toggle-left-btn').addEventListener('click', () => {
      get('left-panel-body').classList.toggle('hidden');
    });
    get('toggle-right-btn').addEventListener('click', () => {
      const inspHidden = tabInspContent.classList.contains('hidden') && tabCfgContent.classList.contains('hidden');
      if (inspHidden) {
        tabInspContent.classList.remove('hidden');
      } else {
        tabInspContent.classList.add('hidden');
        tabCfgContent.classList.add('hidden');
      }
    });

    // Responsive Window Resize
    const resize=()=>{
      const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
      camera.aspect=w/h;camera.zoom=1;camera.updateProjectionMatrix();renderer.setSize(w,h);composer?.setSize(w,h);
      if(hasFramed)frameArchitecture('all',camTransition.active?camTransition.targetPos.clone().sub(camTransition.targetLook):camera.position.clone().sub(controls.target));
    };
    const observer=new ResizeObserver(resize);observer.observe(container);resize();

    /*************************************************************************
     * 7. ANIMATION LOOP & 3D-TO-2D LABEL PROJECTION
     *************************************************************************/
    const tempVec = new THREE.Vector3();

    function updateProjectedLabels() {
      if (!state.showLabels) return;
      const halfW = container.clientWidth / 2;
      const halfH = container.clientHeight / 2;

      const placed=[];
      const ordered=[...htmlLabels].sort((a,b)=>Number(b.nodeId===state.selectedNodeId)-Number(a.nodeId===state.selectedNodeId));
      ordered.forEach(item => {
        if (item.mesh) {
          item.mesh.getWorldPosition(tempVec);
          tempVec.add(item.offset);
        } else if (item.worldPos) {
          tempVec.copy(item.worldPos);
        }

        tempVec.project(camera);

        // Hide label if behind camera
        if (tempVec.z > 1||Math.abs(tempVec.x)>1.05||Math.abs(tempVec.y)>1.05) {
          item.el.style.opacity = '0';item.el.style.visibility='hidden';
          item.el.style.pointerEvents = 'none';
          return;
        }

        const x = (tempVec.x * halfW) + halfW;
        const y = -(tempVec.y * halfH) + halfH;

        item.el.style.left = `${x}px`;
        item.el.style.top = `${y}px`;
        const w=item.el.offsetWidth,h=item.el.offsetHeight;
        const rect={x:x-w/2,y:y-(item.isTensorBadge?h/2:h),w,h};
        const collides=placed.some(r=>rect.x<r.x+r.w+4&&rect.x+rect.w+4>r.x&&rect.y<r.y+r.h+4&&rect.y+rect.h+4>r.y);
        item.el.style.visibility=collides?'hidden':'visible';
        if(!collides)placed.push(rect);
        item.el.classList.toggle('llm-label-selected',item.nodeId===state.selectedNodeId);
        item.el.style.opacity = '1';
        item.el.style.pointerEvents = item.isTensorBadge ? 'none' : 'auto';
      });
    }

    function animate(timestamp=performance.now()) {
      if(disposed)return;frame=requestAnimationFrame(animate);
      const dt=llmFrameDelta(previousFrame,timestamp);previousFrame=timestamp;
      environmentTime+=dt;environment.update(environmentTime);
      if(state.flowRunning){simulationTime+=dt;flowClock.value=simulationTime;}


      // Smooth Camera Fly-To Interpolation
      if (camTransition.active) {
        camera.position.lerp(camTransition.targetPos, 1-Math.exp(-5*dt));
        controls.target.lerp(camTransition.targetLook, 1-Math.exp(-5*dt));
        if (camera.position.distanceTo(camTransition.targetPos) < 0.15) {
          camTransition.active = false;
        }
      }

      controls.update(dt);

      for(const packets of flowParticles){
        packets.mesh.visible=!packets.isResidual||state.showResiduals;
        if(state.flowRunning)packets.update(simulationTime,packets.rate);
      }

      // Rotate Decoupled RoPE 3D Rings
      if(!reducedMotion) animatedRings.forEach(ring => {
        ring.rotation.z += dt*1.08;
        ring.rotation.y += dt*.48;
      });

      // Subtle pulse on Selection Halo
      if (selectionHalo&&!reducedMotion) {
        selectionHalo.material.opacity=.78+Math.sin(environmentTime*1.8)*.12;
      }

      camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
      if(glowEnabled){ensureComposer();composer.render(dt);}else renderer.render(scene,camera);
      updateProjectedLabels();
    }

    // Start the mounted instance
    function start() {
      setActiveLayer(state.activeLayer);setLOD(state.lod);
      get('toggle-flow-btn').textContent=state.flowRunning?'粒子流: 运行中':'粒子流: 已暂停';
      selectComponent(state.selectedNodeId);
      animate();
    };
  
    start();
    return {dispose(){disposed=true;cancelAnimationFrame(frame);clearTimeout(copyTimer);observer.disconnect();controls.dispose();bloomPass?.dispose();outputPass?.dispose();composer?.dispose();disposeLlmObject(scene);scene.clear();renderer.dispose();renderer.domElement.remove();},modalContent(type){
      const c=state.config;
      return type==='sources'?`<div class="eyebrow">LLM MODEL ATLAS / PRIMARY SOURCES</div><h2>${c.name}</h2><p class="modal-intro">${c.summary??c.badge}</p><p class="modal-intro">${c.parameter_note??'可编辑的教学预设。'}</p>${c.source_url?`<p><a href="${c.source_url}" target="_blank" rel="noopener noreferrer">官方${c.availability==='preview'?'产品说明':'架构配置'} ↗</a> · <a href="${c.card_url}" target="_blank" rel="noopener noreferrer">${c.availability==='preview'?'发布记录':'模型卡'} ↗</a></p>`:''}<div class="model-disclaimer"><div><strong>图示与统计口径</strong><p>核验日期：2026-10-21。开放模型使用固定版本的官方架构字段；未披露的预览模型只显示服务接口。KV 卡片分别标明有效载荷、全局缓存或未知口径；不表示完整部署显存。模型塔采用代表层，专家立方体为完整数量；连线、位置和随机路由表示功能依赖，不是运行测量或物理布局。</p></div></div>`:`<div class="eyebrow">EXPLORE THE MODEL</div><h2>从模型塔走进算子。</h2><p class="modal-intro">选择模型后，切换 L1 模型塔、L2 单层拓扑、L3 算子内部。顶部的注意力类型按钮可以跳到对应层；层号从 0 开始。</p><p class="modal-intro">点击组件查看解释、形状和接口示意。Batch、序列长度和缓存精度控制教学估算；CSA2 官方全局缓存按固定 FP4 口径单独计算。开放模型配置只读，教学预设支持编辑。Kimi K2.8 预览只显示已公开的接口与产品规格。</p>`;
    }};
}
