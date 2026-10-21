export const ARCH_PRESETS = {
      deepseek: {
        id: 'deepseek',
        name: 'DeepSeek-V3 / R1',
        archType: 'DeepseekV3ForCausalLM',
        badge: 'MLA + DeepSeekMoE + MTP',
        hidden_size: 7168,
        num_layers: 61,
        first_k_dense_replace: 3,
        num_attention_heads: 128,
        kv_lora_rank: 512,
        q_lora_rank: 1536,
        qk_nope_head_dim: 128,
        qk_rope_head_dim: 64,
        v_head_dim: 128,
        n_routed_experts: 256,
        num_experts_per_tok: 8,
        n_shared_experts: 1,
        moe_intermediate_size: 2048,
        intermediate_size: 18432,
        has_mtp: true,
        attn_mode: 'mla',
        ffn_mode: 'moe'
      },
      qwen: {
        id: 'qwen',
        name: 'Qwen3-32B / Llama-3',
        archType: 'Qwen3ForCausalLM',
        badge: 'Dense GQA + SwiGLU',
        hidden_size: 5120,
        num_layers: 64,
        first_k_dense_replace: 64,
        num_attention_heads: 40,
        num_key_value_heads: 8, // 5:1 GQA ratio
        kv_lora_rank: 1024,     // Effective KV dim = 8 * 128
        q_lora_rank: 5120,
        qk_nope_head_dim: 128,
        qk_rope_head_dim: 64,
        v_head_dim: 128,
        n_routed_experts: 0,
        num_experts_per_tok: 1,
        n_shared_experts: 0,
        moe_intermediate_size: 27648,
        intermediate_size: 27648,
        has_mtp: false,
        attn_mode: 'gqa',
        ffn_mode: 'swiglu'
      },
      hybrid: {
        id: 'hybrid',
        name: 'Hybrid MoE-Mamba',
        archType: 'HybridMambaMoEForCausalLM',
        badge: 'Mamba-2 SSM + GQA + MoE',
        hidden_size: 4096,
        num_layers: 56,
        first_k_dense_replace: 0,
        num_attention_heads: 32,
        num_key_value_heads: 8,
        kv_lora_rank: 512,
        q_lora_rank: 4096,
        qk_nope_head_dim: 128,
        qk_rope_head_dim: 64,
        v_head_dim: 128,
        n_routed_experts: 64,
        num_experts_per_tok: 4,
        n_shared_experts: 1,
        moe_intermediate_size: 1408,
        intermediate_size: 14336,
        has_mtp: false,
        attn_mode: 'ssm_hybrid',
        ffn_mode: 'moe'
      }
    };

const bounded=(value,min,max,fallback)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Math.trunc(Number(value)):fallback));
export function normalizeLlmConfig(input){
  const config={...input};
  config.hidden_size=bounded(input.hidden_size,1024,16384,4096);
  config.num_layers=bounded(input.num_layers,4,128,32);
  config.num_attention_heads=bounded(input.num_attention_heads,4,256,32);
  config.kv_lora_rank=bounded(input.kv_lora_rank,64,4096,512);
  config.n_routed_experts=bounded(input.n_routed_experts,0,512,0);
  config.num_experts_per_tok=config.n_routed_experts?bounded(input.num_experts_per_tok,1,Math.min(32,config.n_routed_experts),1):0;
  return config;
}

export function chooseLlmExperts(config,random=Math.random){
  const count=Math.max(0,Math.min(config.num_experts_per_tok,config.n_routed_experts));
  const candidates=Array.from({length:config.n_routed_experts},(_,i)=>i);
  for(let i=0;i<count;i++){
    const j=i+Math.min(candidates.length-i-1,Math.max(0,Math.floor(random()*(candidates.length-i))));
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }
  return candidates.slice(0,count).sort((a,b)=>a-b);
}

// Teaching estimate: attention KV payload only; excludes SSM state and overhead.
export function estimateLlmKv(config,{batchSize,seqLen,precisionBytes}){
  const headDim=config.v_head_dim||128;
  const baselineElements=2*config.num_attention_heads*headDim;
  let currentElements=config.attn_mode==='mla'?config.kv_lora_rank+(config.qk_rope_head_dim||64):2*(config.num_key_value_heads||8)*headDim;
  const cacheLayers=config.attn_mode==='ssm_hybrid'?Math.floor(config.num_layers/4):config.num_layers;
  const baselineGB=batchSize*seqLen*config.num_layers*baselineElements*precisionBytes/(1024**3);
  const currentGB=batchSize*seqLen*cacheLayers*currentElements*precisionBytes/(1024**3);
  return {baselineGB,currentGB,savingPct:baselineGB?Math.max(0,(1-currentGB/baselineGB)*100):0};
}

