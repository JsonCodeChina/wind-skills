---
name: aimarket-skills-catalog
description: AIMarket 平台金融 skill 清单本地副本。覆盖 Wind、同花顺 iFinD、东方财富等本地金融能力。
---

# AIMarket 金融 Skill 目录

本目录用于 `wind-find-finance-skill` 做本地路由判断。优先判断用户要“取数、分析、安装、探索”哪一类需求，再选择最少但足够的 skill 组合。取数/查询类任务默认使用 `wind-mcp-skill`；只有用户明确指定“东方财富”或“同花顺/iFinD”时，才切换到对应数据底座。

## 数据底座与通用查询

| 名称 | 来源 | category | 装好需配置 | 是否需要实时数据 | 依赖 wind-mcp-skill | 适用市场 | 输出形态 | 典型问题 | 一句话 |
|---|---|---|---|---|---|---|---|---|---|
| wind-mcp-skill | Wind | 数据-行情/基金/股票/宏观/文档 | API Key | 是 | 否 | A 股、港股、ETF、公募基金、宏观、公告、新闻、商品与外盘相关查询 | 原始数据、指标表、新闻/公告摘要 | “查茅台行情”“最近一个月原油走势”“取江波龙财务指标”“今天主要指数表现” | 访问万得 Wind 金融数据，作为 Wind 分析 skill 的数据底座 |
| ifind-finance-data | 同花顺 iFinD | 数据-股票/基金/宏观/行业/新闻公告 | auth_token | 是 | 否 | 股票、基金、宏观经济、行业经济、新闻公告 | JSON 数据、搜索结果、指标数据 | “用 iFinD 查光模块产业链指标”“同花顺智能选股”“查某公司公告新闻” | 封装同花顺 iFinD 数据 MCP，支持股票基金、EDB 指标、新闻公告和智能选股选基 |
| mx-finance-data | 东方财富 | 数据-全市场金融数据 | 视本地脚本配置 | 是 | 否 | A 股、港股、美股、ETF、债券、基金、公司、指数 | 数据说明、xlsx 文件 | “用东方财富查 A 港美估值财务”“用东方财富导出某行业公司财务数据” | 基于东方财富数据库的全市场金融数据查询 |

## 分析工作流

| 名称 | 来源 | category | 装好需配置 | 是否需要实时数据 | 依赖 wind-mcp-skill | 适用市场 | 输出形态 | 典型问题 | 一句话 |
|---|---|---|---|---|---|---|---|---|---|
| a-share-primary-theme-identification | Wind | 市场主线 | 无 | 是 | 建议 | A 股 | 主线识别、题材周期、资金行为判断 | “分析今天 A 股主线”“今天市场在交易什么” | 识别 A 股当日主线、情绪位置与次日观察方向 |
| post-market-debrief | Wind | 复盘 | 无 | 是 | 建议 | A 股 | 盘后复盘、市场全景、明日策略 | “今天盘后复盘”“明天要盯哪些方向” | 复盘全天行情、主线轮动、风险信号和明日重点 |
| equity-investment-thesis | Wind | 个股研究 | 无 | 建议 | 建议 | A 股、港股、美股等权益资产 | 个股投资逻辑、基本面框架、催化剂与风险 | “江波龙的投资逻辑”“这家公司怎么看” | 生成接近券商研究员风格的个股核心投资逻辑 |
| buffett | 通用 | 个股研究 | 无 | 可选 | 可选 | 股票、公司、行业 | 护城河、管理层、资本配置、安全边际 | “这家公司是否值得长期持有”“护城河强不强” | 用巴菲特价值投资框架评估公司质量和投资决策 |
| valuation-pricing-framework | Wind | 估值 | 无 | 建议 | 建议 | 股票、行业、指数 | 估值框架、定价逻辑、重估空间 | “这家公司怎么估值”“现在贵不贵” | 分析估值水平、市场定价逻辑和重估空间 |
| dcf-model | 通用 | 估值 | 无 | 建议 | 可选 | 股票 | DCF 模型、WACC、敏感性分析 | “做一个 DCF 估值”“测算内在价值” | 构建现金流折现模型并输出估值敏感性 |
| earnings-analysis | 通用 | 估值-季报 | 无 | 是 | 建议 | 已覆盖公司 | 季报点评、beat/miss、预测更新 | “分析 Q1 财报”“这次业绩超预期吗” | 快速生成专业季报/业绩更新分析 |
| market-environment-analysis | 通用 | 市场环境 | 无 | 是 | 建议 | 全球股票、汇率、商品、利率、宏观 | risk-on/risk-off、跨资产环境判断 | “全球市场环境分析”“从外盘和期货看今天行情” | 综合外盘、商品、汇率和宏观判断市场环境 |
| theme-detector | 通用 | 主题/板块 | 无 | 是 | 建议 | A 股、美股、ETF、板块主题 | 热门主题、板块轮动、生命周期 | “哪些主题正在走强”“板块轮动到哪了” | 检测跨板块主题热度、强弱变化和生命周期 |
| position-sizer | 通用 | 仓位 | 无 | 可选 | 可选 | 股票多头交易 | 仓位测算、止损距离、Kelly、ATR | “我该买多少股”“单笔风险控制多少” | 根据风险预算、止损和波动率计算仓位 |
| backtest-expert | 通用 | 回测 | 无 | 可选 | 可选 | 量化策略、多资产策略 | 回测设计、鲁棒性检查、偏差排除 | “帮我验证这个策略”“回测是不是过拟合” | 系统化评估交易策略，强调压力测试和防过拟合 |

## 常见组合路由

| 用户问题 | 推荐组合 | 说明 |
|---|---|---|
| “有什么金融能力” | `wind-find-finance-skill` | 按类别列出已安装能力和代表问题 |
| “我想研究 A 股” | `wind-mcp-skill` + `a-share-primary-theme-identification` + `post-market-debrief` + `equity-investment-thesis` | 覆盖数据、主线、复盘、个股 |
| “分析今天 A 股主线” | `a-share-primary-theme-identification` + `wind-mcp-skill` | 实时数据加主线框架 |
| “从国内外环境、期货、大盘、基金、板块、热门个股分析今天行情” | `market-environment-analysis` + `a-share-primary-theme-identification` + `wind-mcp-skill` | 先跨资产环境，再落到 A 股主线和市场热点 |
| “某只股票的投资逻辑” | `equity-investment-thesis` + `buffett` + `valuation-pricing-framework` + `wind-mcp-skill` | 基本面、质量、估值、数据底座 |
| “这只股票怎么样/要不要持有” | `equity-investment-thesis` + `buffett` + `wind-mcp-skill` | 个股质量、估值、风险和持有决策分析 |
| “这只基金怎么样” | 默认用 `wind-mcp-skill` 查询基金资料、业绩、持仓、规模、经理等数据后进行综合分析；明确指定同花顺/iFinD 时用 `ifind-finance-data` | 单基金综合分析 |
| “帮我选股/选基金” | 默认 `wind-mcp-skill`；明确指定东方财富时用 `mx-finance-data`，明确指定同花顺/iFinD 时用 `ifind-finance-data` | 自然语言筛选资产 |
| “查新闻/公告/研报/政策” | 默认 `wind-mcp-skill`；明确指定同花顺/iFinD 时用 `ifind-finance-data` 的 news 服务 | 按指定数据源检索资讯 |
| “最近一个月原油走势” | `market-environment-analysis` + `wind-mcp-skill` | 商品价格走势与宏观解释 |
| “写一份行业研究报告” | `theme-detector` + `market-environment-analysis` + `wind-mcp-skill` | 行业/主题趋势、宏观环境和市场表现分析 |
| “写一份专题研究报告” | `theme-detector` + `market-environment-analysis` + `wind-mcp-skill` | 主题、政策、事件影响分析 |
| “做可比公司分析” | `valuation-pricing-framework` + `wind-mcp-skill` | 同业经营、财务和估值横比 |
| “写一份业绩点评” | `earnings-analysis` + `wind-mcp-skill` | 业绩变化、beat/miss、盈利质量和估值影响 |
| “给我算仓位” | `position-sizer` | 如果需要实时价格/ATR，再配 `wind-mcp-skill` |
| “验证策略/回测” | `backtest-expert` | 如果需要行情样本，再配 `wind-mcp-skill` |

## 安装公式

Wind 来源的 skill 可以用以下命令安装。把命令里的 `<name>` 换成上表“名称”列的值:

```bash
# 全局安装，推荐
npx skills add Wind-Information-Co-Ltd/wind-skills --skill <name> -g -y

# 国内镜像
npx skills add https://gitee.com/wind_info/wind-skills.git --skill <name> -g -y

# 升级所有全局 skill
npx skills update -g -y
```

参数:
- `-g`: 全局安装或升级，跨项目和多个 agent 共享。
- 去掉 `-g`: 仅当前项目安装。
- `-y`: 跳过交互菜单。
- `--skill <name>`: 只安装指定子 skill。

非 Wind 来源的能力:
- `ifind-finance-data` 需要 `mcp_config.json` 中有有效 `auth_token`。
- `mx-finance-data` 是东方财富数据查询 skill；是否需要额外配置以该 skill 说明为准。
