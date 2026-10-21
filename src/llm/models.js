import { OFFICIAL_CONFIGS } from './official-configs.js';

const profiles = {
  'deepseek-v4.1-flash': {
    name:'DeepSeek-V4.1-Flash', org:'deepseek-ai', revision:'314113f8a7dadb388215396ba5fbee2c610a04d6',
    badge:'CED · CSA2 · Engram · DSpark', attn_mode:'csa2', residual:'mhc',
    summary:'20 层因果编码器连接 20 层解码器，CSA2 跨层共享 KV 与索引；Engram 为独立的条件记忆分支。',
    total_label:'552 B 主干', active_label:'8 B / 16 B', active_caption:'Prefill / Decode（官方）',
    parameter_note:'另有 196 B Engram 条件记忆；不与主干参数混为同一口径。',
    encoder_layers:20, global_kv_bytes_per_token:890,
    report:'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/314113f8a7dadb388215396ba5fbee2c610a04d6/DeepSeek_V41_Tech_Report.pdf'
  },
  'glm-5.3': {
    name:'GLM-5.3', org:'zai-org', revision:'ba32f8c19c8738e2c57c71798c601d477a7bf844',
    badge:'MLA · DSA · IndexShare · MoE', attn_mode:'dsa', residual:'standard',
    summary:'沿用 GLM-5.2 基座，78 层 MLA/DSA，前三层为稠密 FFN；索引器以 Full / Shared 模式复用稀疏选择。',
    parameter_note:'参数卡按配置中的线性矩阵估算；不含索引器、归一化、路由偏置与 MTP，不能当作官方模型规模。'
  },
  'kimi-k3': {
    name:'Kimi-K3', org:'moonshotai', revision:'f831ab66814297da540d832a5235f8e904f29d06',
    badge:'KDA · Gated MLA · AttnRes · LatentMoE', attn_mode:'kda_mla', residual:'attnres',
    summary:'69 层 KDA 与 24 层 Gated MLA 混合，AttnRes 汇聚深度方向的信息，路由专家在 3584 维潜在空间计算。',
    total_label:'2.8 T', active_label:'104 B', active_caption:'单 Token 激活（官方）',
    parameter_note:'官方模型卡口径；896 个路由专家取 16 个，另有 2 个共享专家。'
  },
  'kimi-k2.8': {
    name:'Kimi-K2.8 Preview', availability:'preview', org:'moonshotai', badge:'产品预览 · 架构待公开',
    summary:'官方 Kimi Code 文档确认 K2.8 Preview、最高 1M 上下文与 low / high / max 思考档位。尚未查到可核验的公开层数、专家数或架构配置。',
    model_id:'kimi-for-coding', max_position_embeddings:1048576,
    source_url:'https://www.kimi.com/code/docs/kimi-code/models.html',
    card_url:'https://www.kimi.com/code/docs/en/kimi-code/whats-new.html',
    parameter_note:'内部结构未披露。此处仅展示输入／服务／输出接口，不推断为 K2 或 K3 的架构。'
  },
  'glm-5.3-flash': {
    name:'GLM-5.3-Flash', org:'zai-org', revision:'46a050bec13002ad29ee795c16e61cf4fa3c4a9c',
    badge:'KDA · Sparse MLA · mHC · MoE', attn_mode:'kda_dsa', residual:'mhc',
    summary:'45 层中 34 层为 KDA，11 层为稀疏 MLA；注意力层不使用 RoPE 分支，mHC 维护 4 路残差流。',
    total_label:'320 B', active_label:'18 B', active_caption:'单 Token 激活（官方）',
    parameter_note:'官方模型卡口径；288 个路由专家取 8 个，另有 1 个共享专家。'
  }
};

export const NEW_MODEL_KEYS=Object.keys(profiles);
export const VERIFIED_PRESETS=Object.fromEntries(NEW_MODEL_KEYS.map(id=>{
  const p=profiles[id], raw=OFFICIAL_CONFIGS[p.name];
  if(!raw)return [id,{...p,id,verified:false,availability:'preview'}];
  const t=raw.text_config;
  const fullLayers=t.linear_attn_config?.full_attn_layers;
  // Kimi uses one-based layer numbers; GLM's lists are zero-based.
  const mla_layers=fullLayers?.map(n=>p.org==='moonshotai'?n-1:n);
  return [id,{
    ...t,...p,id,verified:true,availability:'open',raw_config:raw,
    archType:raw.architectures[0],num_layers:t.num_hidden_layers,
    n_routed_experts:t.n_routed_experts??t.num_experts,
    n_shared_experts:t.n_shared_experts??t.num_shared_experts,
    num_experts_per_tok:t.num_experts_per_tok??t.num_experts_per_token,
    first_k_dense_replace:t.first_k_dense_replace??0,
    kv_lora_rank:t.kv_lora_rank??null,
    intermediate_size:t.intermediate_size??null,
    has_mtp:t.num_nextn_predict_layers>0,
    ffn_mode:'moe',mla_layers,vision:raw.vision_config,
    source_url:`https://huggingface.co/${p.org}/${p.name}/blob/${p.revision}/config.json`,
    card_url:`https://huggingface.co/${p.org}/${p.name}/blob/${p.revision}/README.md`
  }];
}));

export const ATTENTION_NAMES={mla:'MLA',dsa:'DSA / Sparse MLA',kda:'KDA',csa2:'CSA2',swa:'SWA',gqa:'GQA',ssm:'Mamba-2 SSM',unknown:'未披露'};

export function getLlmLayer(config,index){
  if(config.availability==='preview')return {attention:'unknown',dense:false,stage:'接口',residual:'unknown'};
  let attention=config.attn_mode;
  if(attention==='ssm_hybrid')attention=index%4===3?'gqa':'ssm';
  if(attention==='kda_mla'||attention==='kda_dsa')attention=config.mla_layers.includes(index)?(attention==='kda_mla'?'mla':'dsa'):'kda';
  if(attention==='csa2'&&!config.compress_ratios[index])attention='swa';
  const dense=index<config.first_k_dense_replace||!config.n_routed_experts;
  const stage=config.encoder_layers?(index<config.encoder_layers?'因果编码器':'解码器'):'语言主干';
  const indexer=config.attn_mode==='csa2'?(config.kv_source_layer_ids.includes(index)?'Full':config.index_source_layer_ids.includes(index)?'Reindex':'Reuse'):config.indexer_types?.[index];
  return {attention,dense,stage,indexer,engram:config.engram_layer_ids?.includes(index)??false,residual:config.residual??'standard'};
}

export function getLlmLayerGroups(config){
  if(!config.num_layers)return [];
  const groups=new Map();
  for(let i=0;i<config.num_layers;i++){
    const {attention}=getLlmLayer(config,i);
    if(!groups.has(attention))groups.set(attention,{type:attention,label:ATTENTION_NAMES[attention],count:0,first:i});
    groups.get(attention).count++;
  }
  return [...groups.values()];
}

export function estimateLlmParameters(config){
  if(config.availability==='preview')return {total:'未披露',active:'未披露',official:false};
  if(config.total_label)return {total:config.total_label,active:config.active_label,official:true};
  const c=config,H=c.hidden_size,L=c.num_layers,nh=c.num_attention_heads;
  const dk=c.qk_nope_head_dim??128,dr=c.qk_rope_head_dim??64,dv=c.v_head_dim??128;
  const attn=['mla','dsa'].includes(c.attn_mode)
    ? H*(c.kv_lora_rank+dr)+c.kv_lora_rank*nh*(dk+dv)+H*c.q_lora_rank+c.q_lora_rank*nh*(dk+dr)+nh*dv*H
    : H*H*2.5;
  const dense=Math.min(L,c.first_k_dense_replace),sparse=L-dense;
  const base=2*(c.vocab_size??129280)*H+L*attn;
  const denseFFN=3*H*c.intermediate_size;
  const total=base+(c.n_routed_experts?dense*denseFFN+sparse*(c.n_routed_experts+c.n_shared_experts)*3*H*c.moe_intermediate_size:L*denseFFN);
  const active=base+(c.n_routed_experts?dense*denseFFN+sparse*(c.num_experts_per_tok+c.n_shared_experts)*3*H*c.moe_intermediate_size:L*denseFFN);
  return {total:(total/1e9).toFixed(1)+' B',active:(active/1e9).toFixed(1)+' B',official:false};
}
