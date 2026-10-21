import { ATTENTION_NAMES, getLlmLayer, getLlmLayerGroups } from './models.js';

// These chapters describe architecture. They are not recorded inference traces.
export function createLlmStory(config) {
  const c = config;
  const title = `${c.name} · 一次计算的结构之旅`;
  if (c.availability === 'preview' || !c.num_layers) return { title, chapters: [] };
  const layers = Array.from({ length: c.num_layers }, (_, index) => ({ index, ...getLlmLayer(c, index) }));
  const find = predicate => layers.find(predicate)?.index;
  const groups = getLlmLayerGroups(c);
  const representative = find(l => !l.dense && !['ssm', 'kda', 'swa'].includes(l.attention)) ?? find(l => !l.dense) ?? 0;
  const chapters = [];
  const add = chapter => chapters.push({ duration: 9, lod: 3, layer: representative, nodeIds: [], ...chapter });
  const layerLabel = index => `第 ${index + 1} 层 · #${index}`;
  const types = groups.map(g => `${g.count} 层 ${g.label}`).join(' + ');

  add({ id: 'overview', title: '先看完整路线', question: '一个 Token 会经过哪些结构？',
    body: `输入映射成隐藏表示，再经过模型主干与输出头。${c.encoder_layers ? `${c.encoder_layers} 层因果编码器连接 ${c.num_layers - c.encoder_layers} 层解码器。` : `主干包含 ${c.num_layers} 层。`}图中展示代表层；流动光点是机制示意，不是实测推理轨迹。`,
    metric: types, lod: 1, duration: 8, direction: [.45, .28, 1] });

  if (c.attn_mode === 'csa2') {
    const sparse = find(l => l.attention === 'csa2');
    add({ id: 'context', title: '局部窗口与全局读取', question: '怎样同时看近处与远处的上下文？',
      body: `SWA 读取最近 ${c.sliding_window} 个 Token；CSA2 通过索引选择全局压缩条目。两条分支共同提供上下文，并非每次读取全部历史。格子与移动路径仅示意读取机制。`,
      metric: `${c.sliding_window}-Token 局部窗口 · 全局 Top-${c.index_topk}`, layer: sparse,
      nodeIds: ['mla_q_latent', 'attn_core', 'indexer'], duration: 10 });
    for (const [kind, id, heading, question, text] of [
      ['Full', 'cache-full', '建立共享缓存', 'Full 层会产生哪些新数据？', 'Full 层建立新的全局 K/V，并生成读取索引。后续层可以使用这些共享结果；画面中的缓存槽位是聚合示意。'],
      ['Reindex', 'cache-reindex', '复用 K/V，更新索引', '为什么换一层不一定复制一份缓存？', 'Reindex 层复用已有全局 K/V，重新计算检索索引。缓存内容与读取位置是两类不同资源。'],
      ['Reuse', 'cache-reuse', '复用缓存与索引', 'Reuse 与 Reindex 又有什么区别？', 'Reuse 层同时复用全局 K/V 与已有检索索引。这里强调跨层生产与消费关系，不代表这些层使用相同权重。']
    ]) {
      const layer = find(l => l.attention === 'csa2' && l.indexer === kind);
      if (layer !== undefined) add({ id, title: heading, question, body: text,
        metric: `${layerLabel(layer)} · ${kind}`, layer, nodeIds: ['csa_cache', 'indexer'], duration: 8 });
    }
  } else {
    const recurrent = find(l => ['kda', 'ssm'].includes(l.attention));
    if (recurrent !== undefined) {
      const kda = layers[recurrent].attention === 'kda';
      add({ id: 'state', title: kda ? '把历史写入递推状态' : '用状态更新混合信息',
        question: '历史信息一定要存成逐 Token 的 K/V 表吗？',
        body: kda ? 'KDA 经过短卷积和输入相关门控，将信息写入递推状态，再读出当前表示。状态与完整历史 KV 表不同；内部单元是结构示意，不能当作真实张量数值。'
          : '当前代表层使用 SSM 状态更新，后续还会遇到 GQA 层。此教学预设只给出模块接口，没有配置完整状态布局，画面不推断底层内核。',
        metric: `${layerLabel(recurrent)} · ${kda ? 'KDA' : 'SSM'} · ${groups.find(g => g.type === layers[recurrent].attention).count} 层`,
        layer: recurrent, nodeIds: kda ? ['kda_conv', 'kda_gate', 'kda_state', 'attn_core'] : ['attn_core'], duration: 10 });
    }

    const attention = find(l => !['kda', 'ssm'].includes(l.attention) && !l.dense)
      ?? find(l => !['kda', 'ssm'].includes(l.attention));
    if (attention !== undefined) {
      const type = layers[attention].attention;
      const sparse = type === 'dsa';
      const gqa = type === 'gqa';
      add({ id: 'context', title: sparse ? '从历史中选择要读取的位置' : gqa ? '让多个查询共享 K/V' : '在潜在表示上读取上下文',
        question: recurrent !== undefined ? '为什么还需要另一种信息混合层？' : '查询怎样从历史表示中获得上下文？',
        body: sparse ? `本层使用 MLA 表示历史 K/V，DSA 索引器选择候选位置。稀疏读取减少所选位置，不意味着历史 KV 缓存按相同比例消失。${c.qk_rope_head_dim === 0 ? '该配置的注意力没有 RoPE 分支。' : ''}`
          : gqa ? `多个查询头共享 ${c.num_key_value_heads || 8} 组 K/V 表示，再把上下文投影回隐藏维度。分组共享与只激活少量专家是不同机制。`
            : 'MLA 将历史 K/V 存成低秩潜在表示，查询读取后再形成输出。混合模型中的 MLA 层与递推层有各自的状态和计算方式。',
        metric: `${layerLabel(attention)} · ${ATTENTION_NAMES[type]} · ${c.num_attention_heads} 查询头`,
        layer: attention, nodeIds: sparse ? ['mla_q_latent', 'attn_core', 'indexer'] : gqa ? ['attn_core', 'mla_kv_latent'] : ['mla_q_latent', 'attn_core', 'mla_kv_latent'],
        duration: 10 });

      add({ id: 'cache', title: gqa ? '保留分组历史' : '保留潜在历史', question: '缓存保存了什么，哪些内容不在这个统计里？',
        body: gqa ? 'KV 缓存为后续查询保留历史键和值。页面统计只估算注意力有效载荷；不含分配器开销、工作区与权重。'
          : '缓存保留潜在 K/V 表示；页面估算只计入对应注意力层的有效载荷。索引缓存、递推状态、卷积状态与分配开销属于不同口径，不能混在一起。',
        metric: `${layerLabel(attention)} · ${gqa ? `${c.num_key_value_heads || 8} 组 K/V` : `${c.kv_lora_rank} 潜在维度`}`,
        layer: attention, nodeIds: ['mla_kv_latent'], duration: 8 });

      const sharedIndex = find(l => l.attention === 'dsa' && l.indexer === 'shared');
      if (sharedIndex !== undefined) add({ id: 'index-share', title: '跨层共享检索索引', question: '每层都需要重新做一次稀疏选择吗？',
        body: 'IndexShare 让 Shared 层使用已有检索索引，Full 层负责更新索引。这里共享的是读取位置，不应理解为全部层共享权重或不再需要历史 K/V。',
        metric: `${layerLabel(sharedIndex)} · Shared index`, layer: sharedIndex, nodeIds: ['indexer', 'attn_core'], duration: 8 });
    }
  }

  const denseLayer = find(l => l.dense);
  if (denseLayer !== undefined) add({ id: 'dense', title: '先看稠密前馈', question: '稠密 FFN 与专家路由的区别是什么？',
    body: '当前层让隐藏表示经过门控、上投影与下投影，没有 Top-K 专家选择。稠密层与 MoE 层需要分别解释，不能给每一层都套同一种路由动画。',
    metric: `${layerLabel(denseLayer)} · Dense FFN`, layer: denseLayer, nodeIds: ['moe_experts'], duration: 8 });

  const moe = find(l => !l.dense);
  if (c.n_routed_experts > 0 && moe !== undefined) {
    const layer = !layers[representative].dense ? representative : moe;
    const shared = c.n_shared_experts || 0;
    add({ id: 'experts', title: c.routed_expert_hidden_size ? '进入潜在空间中的专家' : '只激活当前需要的专家',
      question: '总专家很多，为什么每个 Token 只用其中一部分？',
      body: `路由器从 ${c.n_routed_experts} 个路由专家中选择 ${c.num_experts_per_tok} 个。${shared ? `另有 ${shared} 个共享专家分支。` : '这个配置没有共享专家分支。'}${c.routed_expert_hidden_size ? `路由专家在 ${c.routed_expert_hidden_size} 维潜在空间中计算。` : ''}点亮编号是教学抽样，不是采集到的真实路由记录。`,
      metric: `Top-${c.num_experts_per_tok} / ${c.n_routed_experts} · ${shared} 共享`, layer,
      nodeIds: ['moe_router', 'moe_experts', ...(shared ? ['shared_expert'] : []), ...(c.routed_expert_hidden_size ? ['latent_moe'] : [])], duration: 10 });
  }

  add({ id: 'residual', title: c.residual === 'attnres' ? '沿深度聚合历史表示' : c.residual === 'mhc' ? '让多路残差信息继续传递' : '把分支结果送回主干',
    question: '注意力和前馈之后，信息如何保留下来？',
    body: c.residual === 'attnres' ? 'AttnRes 从深度方向的表示历史中进行聚合，区别于固定的相邻残差相加。旁路展示深度块之间的关系，不是沿序列重新读取 Token。'
      : c.residual === 'mhc' ? `mHC 维护 ${c.hc_mult || 4} 路残差流并进行受约束的混合。它连接分支的输入与输出，不应当作额外的 Token 或额外专家。`
        : '残差路径把分支输入与计算结果汇合，随后进入后续计算。路径的弯曲、长度与流动速度只为区分连接，不代表真实传输时延。',
    metric: c.residual === 'attnres' ? 'AttnRes · 深度方向' : c.residual === 'mhc' ? `mHC · ${c.hc_mult || 4} 路流` : 'Residual · 分支汇合',
    lod: 2, nodeIds: ['residual_add'], duration: 8 });

  add({ id: 'output', title: c.dspark_block_size ? '输出与草稿验证' : '得到下一个 Token 的分布',
    question: c.has_mtp ? '主干输出与预测分支是什么关系？' : '隐藏表示怎样成为模型输出？',
    body: c.dspark_block_size ? `输出头给出词表分布，DSpark 提供 ${c.dspark_block_size} 位置草稿并由主干验证。草稿是独立的辅助机制，画面不承诺每次都接受全部候选。`
      : c.has_mtp ? '输出头把最终隐藏表示映射到词表分布；MTP 是辅助预测分支。分支与主干的结构关系不等于实际部署总会以同一方式启用。'
        : '最终归一化与输出头把隐藏表示映射到词表分布，再由采样策略选择下一 Token。这里展示结构关系，不显示真实概率与真实采样结果。',
    metric: c.dspark_block_size ? `${c.dspark_block_size} 位置草稿 · 主干验证` : 'Hidden → Vocabulary',
    lod: 1, nodeIds: ['rmsnorm', 'embedding', ...(c.has_mtp ? ['mtp_module'] : [])],
    titleIncludes: ['LM Head', 'Final RMSNorm', 'DSpark', 'MTP'], duration: 9, direction: [.28, .2, 1] });

  return { title, chapters };
}

/** UI-independent transport. The caller supplies visible-page elapsed seconds. */
export class StoryPlayer {
  constructor(chapters = []) { this.setChapters(chapters); }

  setChapters(chapters) {
    this.chapters = [...chapters];
    this.starts = [];
    this.duration = this.chapters.reduce((total, chapter) => {
      this.starts.push(total);
      const duration = Number(chapter.duration);
      return total + (Number.isFinite(duration) && duration > 0 ? duration : 1);
    }, 0);
    this.elapsed = 0;
    this.playing = false;
    return this.snapshot();
  }

  play() {
    if (this.duration && this.elapsed >= this.duration) this.elapsed = 0;
    this.playing = this.chapters.length > 0;
    return this.snapshot();
  }

  pause() { this.playing = false; return this.snapshot(); }

  seek(index) {
    const numeric = Number(index);
    const safe = Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
    const target = Math.max(0, Math.min(this.chapters.length - 1, safe));
    this.elapsed = this.starts[target] ?? 0;
    return this.snapshot();
  }

  tick(dtSeconds) {
    const dt = Number(dtSeconds);
    if (this.playing && Number.isFinite(dt) && dt > 0) {
      this.elapsed = Math.min(this.duration, this.elapsed + dt);
      if (this.elapsed >= this.duration) this.playing = false;
    }
    return this.snapshot();
  }

  snapshot() {
    let index = 0;
    for (let i = 1; i < this.starts.length; i++) if (this.elapsed >= this.starts[i]) index = i;
    return { index, playing: this.playing, elapsed: this.elapsed,
      chapterElapsed: this.elapsed - (this.starts[index] ?? 0),
      completed: this.duration > 0 && this.elapsed >= this.duration };
  }
}
