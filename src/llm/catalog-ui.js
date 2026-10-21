import { NEW_MODEL_KEYS, getLlmLayerGroups, getLlmLayer } from './models.js';

export function initializeModelPicker(root,presets,initialKey,onSelect){
  const select=root.querySelector('#model-select');
  for(const [label,keys] of [['模型图鉴',NEW_MODEL_KEYS],['可编辑教学预设',['deepseek','qwen','hybrid']]]){
    const group=document.createElement('optgroup');group.label=label;
    for(const key of keys){const option=document.createElement('option');option.value=key;option.textContent=presets[key].name;group.append(option);}
    select.append(group);
  }
  select.value=initialKey;select.addEventListener('change',()=>onSelect(select.value));
}

export function renderModelSummary(root,c,layer,onLayer){
  const get=id=>root.querySelector('#'+id);
  const unknown=c.availability==='preview',official=c.verified;
  get('model-name').textContent=c.name;
  get('model-coverage').textContent=unknown?'产品预览 · 内部结构未披露':official?'官方配置已核验 · 2026-10-21':'可编辑教学预设';
  get('model-coverage').dataset.status=unknown?'preview':official?'verified':'teaching';
  get('model-summary').textContent=c.summary??c.badge+' · 模型结构教学示例，可在右侧编辑参数。';
  const facts=unknown?[['上下文上限','1,048,576'],['服务模型 ID',c.model_id],['思考档位','low / high / max']]:[
    ['语言主干',`${c.num_layers} 层`],['隐藏维度',c.hidden_size.toLocaleString('en-US')],
    ['注意力头',String(c.num_attention_heads)],['路由专家',c.n_routed_experts?`${c.num_experts_per_tok} / ${c.n_routed_experts}`:'Dense'],
    ['共享专家',String(c.n_shared_experts)],...(c.max_position_embeddings?[['上下文上限',c.max_position_embeddings.toLocaleString('en-US')]]:[])
  ];
  get('model-facts').replaceChildren(...facts.map(([label,value])=>{const el=document.createElement('span');el.append(document.createTextNode(label+' '));const strong=document.createElement('strong');strong.textContent=value;el.append(strong);return el;}));
  const groups=getLlmLayerGroups(c),selected=getLlmLayer(c,layer);
  get('model-layer-groups').replaceChildren(...groups.map(g=>{
    const b=document.createElement('button');b.type='button';b.dataset.attention=g.type;b.textContent=`${g.label} · ${g.count} 层`;
    b.setAttribute('aria-pressed',String(selected.attention===g.type));b.title=`跳到 Layer #${g.first}（层号从 0 开始）`;b.onclick=()=>onLayer(g.first);return b;
  }));
  const sources=get('model-sources');sources.replaceChildren();
  if(c.source_url)for(const [label,url] of [[unknown?'官方产品说明':'官方配置',c.source_url],[unknown?'发布记录':'官方模型卡',c.card_url]]){
    const a=document.createElement('a');a.textContent=label+' ↗';a.href=url;a.target='_blank';a.rel='noopener noreferrer';sources.append(a);
  }
  root.dataset.attention=selected.attention;
  get('parameter-note').textContent=c.parameter_note??'教学线性矩阵估算，不包含归一化、索引器、预测头及其他附属模块。';
  get('shared-experts-label').textContent=c.n_shared_experts?`+${c.n_shared_experts} 共享`:unknown?'数量未披露':'无共享专家';
  get('seq-slider').max=c.max_position_embeddings??32768;
  get('layer-slider').disabled=unknown;
  get('reroute-moe-btn').disabled=unknown||selected.dense||!c.n_routed_experts;
  root.querySelectorAll('.lod-btn').forEach(b=>b.disabled=unknown&&b.dataset.lod!=='1');
  const readOnly=official||unknown;
  root.querySelectorAll('#tab-config-content input').forEach(el=>el.disabled=readOnly);
  get('apply-config-btn').disabled=readOnly;
  get('config-edit-note').textContent=unknown?'官方未公开内部配置，不生成推测 config.json。':official?'官方架构字段只读，完整配置见上方官方链接。选择教学预设可编辑超参数。':'教学模式：编辑超参数后应用，即可重构三维场景。';
  get('config-mode-label').textContent=unknown?'未披露':official?'官方字段摘录':'教学配置';
}
