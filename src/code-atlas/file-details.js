// Keep all source-derived strings as text, including Python docstrings.
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function fileExplanationHtml(file, { historical = false } = {}) {
  const description = file.description;
  if (!description) {
    return '<div class="panel-block file-guide"><h2>这个文件做什么</h2><p>此快照尚未包含功能说明，请重新生成依赖图以读取源码文档和关键定义。</p></div>';
  }
  const responsibilities = (description.responsibilities || []).map(item =>
    `<li>${escapeHtml(item.text)}<span class="guide-evidence">${(item.symbols || []).map(escapeHtml).join(' · ')}</span></li>`).join('');
  const symbols = (description.keySymbols || []).map(symbol => {
    const label = `<strong>${escapeHtml(symbol.name)}</strong><span>${symbol.kind === 'class' ? '类' : '函数'} · L${Number(symbol.start) || 1}</span>`;
    const heading = historical ? `<div class="guide-symbol">${label}</div>`
      : `<button class="guide-symbol" data-inspect-symbol="${escapeHtml(symbol.id)}" data-owner-file="${escapeHtml(file.id)}">${label}</button>`;
    return `${heading}${symbol.doc ? `<p class="source-excerpt">${escapeHtml(symbol.doc)}</p>` : ''}`;
  }).join('');
  const basis = description.basis === 'guide' ? '核心模块导读 · 定义与文档见下方'
    : description.basis === 'unavailable' ? '源码不可用'
      : '依据文件路径与源码定义归纳';
  return `<div class="panel-block file-guide">
    <h2>这个文件做什么${historical ? ' · 基线版本' : ''}</h2>
    <h3>${escapeHtml(description.title)}</h3>
    <p class="guide-summary">${escapeHtml(description.summary)}</p>
    ${responsibilities ? `<ul class="guide-tasks">${responsibilities}</ul>` : ''}
    <span class="guide-basis">${basis}</span>
    ${symbols ? `<details class="guide-details"><summary>关键定义${historical ? '' : '（点击定位楼层）'}</summary>${symbols}</details>` : ''}
    ${description.moduleDoc ? `<details class="guide-details"><summary>源码中的模块说明 · 原文</summary><p class="source-excerpt">${escapeHtml(description.moduleDoc)}</p></details>` : ''}
  </div>`;
}
