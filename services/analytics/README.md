# GPU Prism 访问统计

这是 GPU Prism 的独立统计服务：Vinext + Cloudflare D1。主站仍部署在 GitHub Pages；数据库由 Sites 托管，不依赖 Umami 账号。

## 记录内容

- 浏览量：主站初始化或切换规范化页面时记录一次 page_view。
- 访客数：以浏览器保存的随机匿名标识去重。同一人换设备、清除存储后会分别计数，不等于实名人数。
- 热门页面，以及模型选择、故事开始和自然播放完成次数。
- 所有日期以北京时间划分；从采集启用后积累，不恢复历史访问。

服务端保存匿名标识的 HMAC 摘要、规范化页面、预定义事件和模型 ID；不保存原始标识、IP、搜索文本、用户输入或浏览器指纹。短期签名采集令牌仅授权对应来源和匿名访客。聚合接口不公开逐条访问记录或访客摘要。公开匿名计数无法保证完全排除机器人或人为刷量。

## 接口

- POST /api/session：以 {visitorId} 获取短期采集令牌。
- POST /api/collect：使用 Bearer 令牌提交 {requestId,visitorId,event,route,model?}。请求 ID 幂等。
- GET /api/stats：仅返回累计、今日、30 天趋势、热门页面和模型事件的聚合结果。

跨域采集只允许主站已配置的来源。生产配置不接受本地预览事件。故障返回错误状态，不生成模拟数据。

## 配置和部署

.openai/hosting.json 声明 DB，由 Sites 配置数据库。ANALYTICS_HASH_SECRET 使用 Sites 的托管密钥配置，密钥不能写进前端或 Git。

本地开发可在已忽略的 .dev.vars 中配置独立测试密钥和 ANALYTICS_LOCAL_TEST=1。仅本地启用该开关。安装依赖后，运行 npm run db:generate 生成迁移，npm run build 构建。按 Sites 工作流应用本地迁移并预览；生产发布会应用托管数据库迁移。不要在运行时创建表。

主站的 public/analytics-config.json 保存采集地址、允许的主站域名和启用开关；它不包含密钥。必须在采集接口可匿名访问并通过验证后启用主站采集。原有私有架构预览站的访问权限独立保留。
