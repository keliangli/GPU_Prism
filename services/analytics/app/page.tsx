"use client";

import { useCallback, useEffect, useState } from "react";

type CountPair = { visitors: number; pageViews: number };
type Stats = {
  total: CountPair;
  today: CountPair;
  trend: (CountPair & { day: string })[];
  routes: { route: string; pageViews: number }[];
  models: { model: string; selections: number; storyStarts: number; storyCompletions: number }[];
  firstRecordedAt: string | null;
  generatedAt: string;
  timezone: string;
};

const formatNumber = (value: number) => new Intl.NumberFormat("zh-CN").format(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isCountPair = (value: unknown): value is CountPair => isRecord(value) && isCount(value.visitors) && isCount(value.pageViews);
function isStats(value: unknown): value is Stats {
  return isRecord(value) && isCountPair(value.total) && isCountPair(value.today)
    && Array.isArray(value.trend) && value.trend.every((item) => isCountPair(item) && typeof (item as CountPair & { day?: unknown }).day === "string")
    && Array.isArray(value.routes) && value.routes.every((item) => isRecord(item) && typeof item.route === "string" && isCount(item.pageViews))
    && Array.isArray(value.models) && value.models.every((item) => isRecord(item) && typeof item.model === "string" && isCount(item.selections) && isCount(item.storyStarts) && isCount(item.storyCompletions))
    && (value.firstRecordedAt === null || typeof value.firstRecordedAt === "string") && typeof value.generatedAt === "string" && typeof value.timezone === "string";
}
const routeNames: Record<string, string> = {
  "/": "GPU 架构总览", "/gpus": "GPU 架构总览", "/llm": "LLM 模型架构",
  "/pytorch": "PyTorch 源码", "/sglang": "SGLang 源码", "/deepinfer": "DeepInfer 源码",
};

function routeLabel(route: string) {
  if (routeNames[route]) return routeNames[route];
  if (route.startsWith("/gpu/")) return route.slice(5).split("/").join(" · ").toUpperCase();
  return route;
}

function dateLabel(value: string | null) {
  if (value === null) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date);
}

function PrismMark() {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m20 3 16 9v17l-16 9-16-9V12L20 3Z" stroke="currentColor" strokeWidth="1.4"/><path d="m4 12 16 9 16-9M20 21v17M20 3v18M4 29l16-8 16 8" stroke="currentColor" strokeWidth="1.2" opacity=".65"/><path d="m20 11 9 5v9l-9 5-9-5v-9l9-5Z" fill="currentColor" opacity=".15"/></svg>;
}

function RefreshIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16.2 7A6.5 6.5 0 1 0 16 13M16.5 3.5V7h-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function TrendChart({ trend }: { trend: Stats["trend"] }) {
  const width = 900, height = 210, left = 46, right = 12, top = 16, bottom = 30;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const rawMax = Math.max(1, ...trend.map((point) => Math.max(point.visitors, point.pageViews)));
  const max = Math.max(4, Math.ceil(rawMax / 4) * 4);
  const x = (index: number) => left + (index / Math.max(1, trend.length - 1)) * chartWidth;
  const y = (value: number) => top + chartHeight * (1 - value / max);
  const path = (field: keyof CountPair) => trend.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point[field])}`).join(" ");
  const hasViews = trend.some((point) => point.pageViews > 0);
  return <div className="chart-wrap">
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近 30 天每日访客与浏览量趋势，详细数据见下方可展开表格">
      <defs><linearGradient id="pv-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#65dce4" stopOpacity=".22"/><stop offset="100%" stopColor="#65dce4" stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((index) => {
        const value = max * index / 4;
        return <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#283448" strokeDasharray="3 6"/><text x={left - 12} y={y(value) + 4} textAnchor="end">{formatNumber(Math.round(value))}</text></g>;
      })}
      {hasViews && <><path d={`${path("pageViews")} L${x(trend.length - 1)},${y(0)} L${left},${y(0)}Z`} fill="url(#pv-fill)"/><path d={path("pageViews")} fill="none" stroke="#65dce4" strokeWidth="2.5" strokeLinejoin="round"/><path d={path("visitors")} fill="none" stroke="#a69afa" strokeWidth="2.5" strokeLinejoin="round"/></>}
      {trend.filter((_, i) => i === 0 || i === trend.length - 1 || i % 7 === 0).map((point) => {
        const index = trend.indexOf(point);
        return <text key={point.day} x={x(index)} y={height - 5} textAnchor={index === 0 ? "start" : index === trend.length - 1 ? "end" : "middle"}>{point.day.slice(5).replace("-", "/")}</text>;
      })}
    </svg>
    {!hasViews && <p className="chart-empty">还没有访问记录<span>接入后的真实访问会出现在这里</span></p>}
    <details className="chart-data"><summary>查看每日数据</summary><div className="table-scroll"><table><thead><tr><th>日期（北京时间）</th><th>访客 UV</th><th>浏览量 PV</th></tr></thead><tbody>{trend.map((point) => <tr key={point.day}><td>{point.day}</td><td>{formatNumber(point.visitors)}</td><td>{formatNumber(point.pageViews)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/stats?days=30", { cache: "no-store", signal });
      if (!response.ok) throw new Error("暂时无法读取统计数据，请稍后重试。");
      const payload = await response.json();
      if (!isStats(payload)) throw new Error("统计数据暂不可用，请稍后重试。");
      setStats(payload);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "暂时无法读取统计数据，请稍后重试。");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const metrics = [
    { label: "累计访客", code: "UNIQUE VISITORS", value: stats?.total.visitors, tone: "cyan", detail: "按匿名浏览器标识去重" },
    { label: "累计浏览量", code: "PAGE VIEWS", value: stats?.total.pageViews, tone: "purple", detail: "包含站内页面切换" },
    { label: "今日访客", code: "TODAY · UV", value: stats?.today.visitors, tone: "blue", detail: "北京时间 00:00 起" },
    { label: "今日浏览量", code: "TODAY · PV", value: stats?.today.pageViews, tone: "amber", detail: "北京时间 00:00 起" },
  ];
  const mostViewed = Math.max(1, ...(stats?.routes.map((item) => item.pageViews) ?? []));
  return <main className="dashboard">
    <header className="site-header"><a className="brand" href="https://keliangli.github.io/GPU_Prism/" target="_blank" rel="noreferrer"><span className="brand-mark"><PrismMark/></span><span>GPU PRISM<small>架构探索 · 访问统计</small></span></a><a className="site-link" href="https://keliangli.github.io/GPU_Prism/" target="_blank" rel="noreferrer">打开架构探索 <span aria-hidden="true">↗</span></a></header>
    <section className="page-intro"><div><p className="eyebrow">AUDIENCE OVERVIEW</p><h1>每一次探索，都有迹可循<span>.</span></h1><p className="intro-copy">了解有多少人来到 GPU Prism，以及他们正在探索哪些架构。</p></div><button className="refresh-button" onClick={() => void load()} disabled={loading}><span className={loading ? "refresh-icon spinning" : "refresh-icon"}><RefreshIcon/></span>{loading ? "正在读取" : "刷新数据"}</button></section>
    <div className="status-line" role="status"><span className={`status-dot ${error ? "error" : ""}`}/><span>{loading ? "正在读取真实访问记录" : error ? "统计服务暂不可用" : `最近更新 ${dateLabel(stats?.generatedAt ?? null)} · 北京时间`}</span><span className="status-label">自建统计 / 无需第三方账号</span></div>
    {error && <div className="error-banner" role="alert"><span>{error}{stats ? " 当前保留上次读取的结果。" : ""}</span><button onClick={() => void load()} disabled={loading}>重新读取</button></div>}
    <section className="metrics" aria-label="访问数据总览">{metrics.map((metric) => <article className={`metric-card ${metric.tone}`} key={metric.label}><div className="metric-top"><span>{metric.label}</span><span className="metric-glyph" aria-hidden="true">{metric.tone === "cyan" ? "◈" : metric.tone === "purple" ? "▧" : metric.tone === "blue" ? "◉" : "↗"}</span></div><strong>{metric.value === undefined ? "—" : formatNumber(metric.value)}</strong><p className="metric-code">{metric.code}</p><p className="metric-detail">{metric.detail}</p></article>)}</section>
    <section className="panel trend-panel"><div className="panel-heading"><div><p className="eyebrow">TRAFFIC TREND</p><h2>探索的足迹</h2></div><div className="chart-legend"><span><i className="cyan-dot"/>浏览量 PV</span><span><i className="purple-dot"/>访客 UV</span><b>近 30 天</b></div></div>{stats ? <TrendChart trend={stats.trend}/> : <div className="panel-placeholder">{error ? "数据读取失败，重试后查看趋势" : "正在读取访问趋势…"}</div>}</section>
    <div className="detail-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">POPULAR DESTINATIONS</p><h2>大家在探索什么</h2></div><span className="period-tag">近 30 天</span></div>{!stats ? <div className="panel-placeholder">{error ? "暂无可读取的数据" : "正在读取热门页面…"}</div> : stats.routes.length === 0 ? <div className="panel-placeholder">首次访问之后，这里会显示热门页面</div> : <ol className="route-list">{stats.routes.map((item, index) => <li key={item.route}><span className="route-rank">{String(index + 1).padStart(2, "0")}</span><div className="route-detail"><div><strong>{routeLabel(item.route)}</strong><span>{formatNumber(item.pageViews)} <small>次浏览</small></span></div><div className="route-bar"><i style={{ width: `${item.pageViews / mostViewed * 100}%` }}/></div></div></li>)}</ol>}</section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">MODEL ENGAGEMENT</p><h2>模型与故事</h2></div><span className="period-tag">近 30 天</span></div>{!stats ? <div className="panel-placeholder">{error ? "暂无可读取的数据" : "正在读取模型互动…"}</div> : stats.models.length === 0 ? <div className="panel-placeholder">选择模型或播放故事后，会显示互动统计</div> : <div className="table-scroll"><table className="model-table"><thead><tr><th>模型</th><th>选择</th><th>故事开始</th><th>故事完成</th></tr></thead><tbody>{stats.models.map((item) => <tr key={item.model}><td>{item.model}</td><td>{formatNumber(item.selections)}</td><td>{formatNumber(item.storyStarts)}</td><td>{formatNumber(item.storyCompletions)}</td></tr>)}</tbody></table></div>}</section></div>
    <footer className="dashboard-footer"><div><span className="footer-label">统计口径</span><p>访客按浏览器的匿名标识去重，同一个人在不同设备或浏览器中会分别计数。清除浏览器数据也会产生新标识。浏览量包含页面切换；本地预览不计入。</p><p>数据从统计启用后开始记录，无法追溯历史访问。本站仅展示汇总数据，不展示访客身份。所有日期按北京时间计算。</p></div><span className="footer-brand">GPU PRISM<span>Architecture, illuminated.</span></span></footer>
  </main>;
}
