import { getResourceReport } from './gpu-resources.js';
import { colorFor } from './palette.js';
import { icon } from './icons.js';
import './resource-panel.css';

const STATUS = {
  verified: { label: '已核实', explanation: '厂商公开规格或官方文档直接给出。' },
  observed: { label: '一手研究', explanation: '来自一手测量或架构研究，可能受具体版本影响。' },
  reference: { label: '架构参考', explanation: '采用对应架构的公开参考值，不作为该型号的独立实测。' },
  derived: { label: '按规格推算', explanation: '由已列出的规格与数量相乘或换算得到。' },
  unknown: { label: '待核实', explanation: '缺少可靠公开资料，暂不填入具体数字。' }
};

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function statusBadge(status) {
  const state = STATUS[status] || STATUS.unknown;
  return `<span class="resource-status resource-status-${escapeHtml(STATUS[status] ? status : 'unknown')}" title="${escapeHtml(state.explanation)}">${state.label}</span>`;
}

function resourceName(item, className) {
  const label = escapeHtml(item.label);
  return item.component
    ? `<button type="button" class="${className} resource-select" data-resource-select="${escapeHtml(item.component)}" title="在 3D 视图中查看${label}">${label}${icon('target', 12)}</button>`
    : `<span class="${className}">${label}</span>`;
}

function sourceLink(source) {
  if (!source?.url || !/^https?:\/\//i.test(source.url)) return '<span class="resource-no-source">—</span>';
  return `<a class="resource-source" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(source.title)}">${escapeHtml(source.title || '查看来源')}${icon('external', 12)}</a>${(source.related||[]).map(related=>sourceLink(related)).join('')}`;
}

export class ResourcePanel {
  constructor({ onSelect = () => {} } = {}) {
    this.onSelect = onSelect;
    this.container = null;
    this.gpuId = null;
    this.level = null;
    this.scope = null;
    this.expanded = false;
  }

  mount(container, gpuId, level) {
    const details = this.container?.querySelector('.resource-details');
    if (details) this.expanded = details.open;
    if (this.container && this.container !== container) this.container.onclick = null;
    this.container = container;
    this.update(gpuId, level);
  }

  update(gpuId, level) {
    const details = this.container?.querySelector('.resource-details');
    if (details) this.expanded = details.open;
    const sameLevel = this.level === level;
    this.gpuId = gpuId;
    this.level = level;
    this.report = getResourceReport(gpuId, level);
    const scopes = this.report.scopes || [];
    if (!sameLevel || !scopes.some(scope => scope.id === this.scope)) this.scope = this.report.defaultScope;
    if (!scopes.some(scope => scope.id === this.scope)) this.scope = scopes[0]?.id || this.report.defaultScope;
    this.render();
  }

  render() {
    if (!this.container || !this.report) return;
    const report = this.report;
    const metrics = report.summary[this.scope] || [];
    const scopes = report.scopes || [];
    const currentScope = scopes.find(scope => scope.id === this.scope);
    this.container.innerHTML = `<section class="resource-panel" aria-label="${escapeHtml(report.gpuName)} ${escapeHtml(report.levelTitle)}资源统计">
      <div class="resource-heading">
        <div class="resource-heading-title"><span class="resource-heading-icon">${icon('grid', 19)}</span><div><h2>资源总览</h2><p>${escapeHtml(report.gpuName)}<span aria-hidden="true"> / </span>${escapeHtml(report.levelTitle)}</p></div></div>
        ${scopes.length > 1 ? `<div class="resource-scope" role="group" aria-label="统计范围">${scopes.map(scope => `<button type="button" data-resource-scope="${escapeHtml(scope.id)}" aria-pressed="${scope.id === this.scope}">${escapeHtml(scope.label)}</button>`).join('')}</div>` : `<span class="resource-single-scope">${escapeHtml(currentScope?.label || '当前层级')}</span>`}
      </div>
      <div class="resource-metrics">${metrics.map(metric => this.metricCard(metric)).join('')}</div>
      ${report.scopeNote ? `<p class="resource-scope-note">${icon('info', 13)}<span>${escapeHtml(report.scopeNote)}</span></p>` : ''}
      <details class="resource-details" ${this.expanded ? 'open' : ''}>
        <summary><span>${icon('layers', 15)}完整统计<span class="resource-row-count">${(report.rows || []).length} 项资源</span></span><span class="resource-details-action"><span class="resource-closed-label">展开明细</span><span class="resource-open-label">收起明细</span>${icon('down', 14)}</span></summary>
        <div class="resource-table-scroll" role="region" aria-label="资源数量和容量明细，可横向滚动" tabindex="0">
          <table class="resource-table"><thead><tr><th scope="col">资源</th><th scope="col">局部数量 / 容量</th><th scope="col">全芯片汇总</th><th scope="col">统计依据 / 状态</th><th scope="col">来源</th></tr></thead>
          <tbody>${(report.rows || []).map(row => `<tr style="--resource-color:${colorFor(row.component)}"><th scope="row">${resourceName(row, 'resource-row-label')}</th><td class="resource-table-value">${escapeHtml(row.local || '未核实')}</td><td class="resource-table-value">${escapeHtml(row.total || '未核实')}</td><td><div class="resource-basis">${statusBadge(row.status)}<span>${escapeHtml(row.basis)}</span></div></td><td>${sourceLink(row.source)}</td></tr>`).join('')}</tbody></table>
        </div>
        <div class="resource-status-key" aria-label="统计状态说明">${Object.entries(STATUS).map(([key, state]) => `<span>${statusBadge(key)}<span>${state.explanation}</span></span>`).join('')}</div>
      </details>
      ${report.note ? `<p class="resource-note">${escapeHtml(report.note)}</p>` : ''}
    </section>`;
    this.container.onclick = event => this.click(event);
    const details = this.container.querySelector('.resource-details');
    details.ontoggle = () => { if (details.isConnected) this.expanded = details.open; };
  }

  metricCard(metric) {
    const unknown = metric.status === 'unknown';
    return `<div class="resource-metric${unknown ? ' resource-metric-unknown' : ''}" style="--resource-color:${colorFor(metric.component)}">
      <div class="resource-metric-top">${resourceName(metric, 'resource-metric-label')}${statusBadge(metric.status)}</div>
      <div class="resource-metric-number"><strong>${escapeHtml(unknown ? '未核实' : metric.value)}</strong>${!unknown && metric.unit ? `<span>${escapeHtml(metric.unit)}</span>` : ''}</div>
      <p>${escapeHtml(metric.detail)}</p>
    </div>`;
  }

  click(event) {
    const scope = event.target.closest('[data-resource-scope]');
    if (scope && this.container.contains(scope)) {
      if (scope.dataset.resourceScope === this.scope) return;
      this.expanded = this.container.querySelector('.resource-details')?.open || false;
      this.scope = scope.dataset.resourceScope;
      this.render();
      this.container.querySelector(`[data-resource-scope="${this.scope}"]`)?.focus();
      return;
    }
    const component = event.target.closest('[data-resource-select]');
    if (component && this.container.contains(component)) this.onSelect(component.dataset.resourceSelect);
  }
}
