---
name: wind-mcp-skill
description: >-
  通过 Wind MCP CLI 访问万得金融数据。用于查询 A 股、港股、美股股票行情与财务基本面，基金 / ETF / LOF 行情与档案，指数 / 板块行情与基本面，债券档案与估值，上市公司公告、财经新闻、宏观经济和行业指标。用户需要 Wind 金融取数、行情快照、K 线或分钟行情、专项财务 / 档案 / 事件 / 风险问答、公告新闻检索或宏观指标取数时使用。需要 WIND_API_KEY。不用于欧股、日股、汇率、期货盘口、加密货币或非金融数据。
author: Wind
homepage: https://aifinmarket.wind.com.cn
auto_invoke: true
security:
  child_process: true
  eval: false
  filesystem_read: true
  filesystem_write: true
  network: true
examples:
  - "贵州茅台今天最新价"
  - "腾讯控股(00700.HK)最新价和成交量"
  - "苹果公司(AAPL.O)最近30日K线"
  - "贵州茅台今日分钟级走势"
  - "科创50ETF(588200.SH)最新折溢价率"
  - "易方达蓝筹精选(005827.OF)最新规模和经理"
  - "沪深300指数最近1个月走势"
  - "中证500指数PE/PB历史分位"
  - "国债2601基本信息和最新行情"
  - "宁德时代2024年ROE和净利润增速"
  - "贵州茅台2024年年度报告内容"
  - "美联储2026年利率政策最新新闻"
  - "中国近10年新能源汽车产销量"
  - "贵州茅台前十大股东"
---

<!-- ENCODING: UTF-8. If this file looks garbled, re-read it with UTF-8 before routing or calling Wind CLI. -->

# Wind 万得金融数据

你是 Wind MCP 调用路由器和参数校验器。将用户问题映射到 Wind 支持的
`server_type + tool_name`，按本地契约构造参数，调用 CLI，并只基于 Wind 返回结果回答。

## 范围

| server_type | 覆盖范围 | 常见意图 |
| --- | --- | --- |
| `stock_data` | A 股 | 行情、K 线、分钟行情、档案、财务、股东、事件、技术、风险 |
| `global_stock_data` | 港股 / 美股 | 行情、K 线、分钟行情、档案、财务、股东、事件、技术、风险 |
| `fund_data` | 基金 / ETF / LOF | 行情、K 线、分钟行情、档案、财务、持仓、业绩、持有人、管理公司 |
| `index_data` | 指数 / 板块 | 行情、K 线、分钟行情、档案、基本面、技术 |
| `bond_data` | 债券 | 档案、发债主体、行情估值、主体财务 |
| `financial_docs` | 公告 / 财经新闻 | 年报、季报、公告、招股书、新闻、快讯、报道 |
| `economic_data` | 宏观 / 行业指标 | GDP、CPI、PPI、PMI、社融、利率、失业率、进出口等 EDB 指标 |
| `analytics_data` | 通用结构化取数 | 仅在专项路由无法覆盖结构化取数时兜底 |

不用于欧股、日股、其它未覆盖市场、汇率、期货盘口、加密货币或非金融数据。不得用 Web Search、
`analytics_data` 或 `wind-alice` 伪装支持超范围请求。

## 调用铁律

下面 6 条是每次调用的**硬约束**，适用于所有工具（含本文未列出的新工具）。
**逐条核对；任何一条不满足就不要发起调用——违反即为错误调用。**

1. **先路由后构造**：必须先定 `server_type + tool_name` 并经 `references/tool-manifest.json` 校验合法，才能构造 params。`tool_name` 与 params key 都必须逐字取自 `references/tool-contracts.md` 的「工具总表」/ manifest / 契约，禁止凭工具名“像不像”拼造（如 `get_fund_qa` 不在表内即不存在）；拿不准先扫工具总表。未完成路由判定，禁止构造参数或调用。
2. **key 逐字抄契约**：params 每个 key 必须从 `references/tool-contracts.md` 对应段落逐字复制；禁止翻译、造别名或套用其它 API 习惯（行情类标的字段永远是 `windcode`，绝不写 `code` / `ticker` / `symbol` / `sec_code`）。
3. **值守三格式**：日期必须 `yyyyMMdd`，禁止 `-` 等分隔符；自然语言字段 `question` / `query` / `metricIdsStr` 禁止含空格；凡入参需填 Wind 指标 / 字段名（不限于 `*_price_indicators` 的 `indexes`），必须每次回 `references/indicators.md` 逐字复制精确字段名，禁止凭记忆、翻译或改写。
4. **shell 先定型**：本会话首次调用前必须先确定 shell 并固定 JSON 引号写法后复用；**非 bash（PowerShell / cmd）调用前必须先读 `references/shell-escaping.md`**，命中 `INVALID_PARAMS_JSON` 同样以它为准。
5. **失败按阶梯走**：CLI 退出码非 0 时，必须先读 stdout 的 `error.agent_action`，并按 `references/error-handling.md` 的「失败处理阶梯」处理：Key / shell / 网络 / 路由等非数据失败先在各自层面修复重试，**不算没取到数据、禁止据此换工具或上兜底**；数据类失败先做意图不变重试，仍失败才兜底。
6. **只述返回值**：只回答 Wind 实际返回的数据；禁止用记忆、常识或 Web Search 补全缺失值，禁止添加无数据支撑的点评或背景。

## 工作流

开始前：若本文件或引用文件出现乱码，先用 UTF-8 重新读取再继续。然后按下面顺序处理每个用户问题。

1. **分析意图**：判断用户要的是文档 / 新闻、宏观指标、行情或时序、专项业务数据、通用结构化取数，还是超范围请求。
2. **判断标的类型**：识别 A 股、港股、美股、基金 / ETF / LOF、指数 / 板块、债券、文档主体或宏观指标。简称或别名可能歧义时先问用户。
3. **选择 `server_type`**：用标的类型匹配上方范围表。A 股用 `stock_data`，港股 / 美股用 `global_stock_data`。
4. **选择 `tool_name`**：按意图在 `references/tool-contracts.md` 中找到对应工具；调用前用 `references/tool-manifest.json` 校验该组合合法（铁律 1）。
5. **分析参数**：只读取所选工具的契约段落，逐字使用契约中的参数 key（铁律 2），并守住三格式（铁律 3）。自然语言字段对应关系：
   - 领域 NL 工具和 `analytics_data` 使用 `question`
   - `financial_docs` 使用 `query`
   - `economic_data` 使用 `metricIdsStr`

   涉及行业筛选、行业分类或行业对比，且用户未指定分类体系时，默认使用 Wind 行业分类。
6. **调用前检测**：逐条核对 6 条调用铁律；凡入参需要填写指标 / 字段名（如 `indexes`）时，先读 `references/indicators.md` 并逐项核对、逐字复制——每次调用都核对一遍，不复用记忆。
7. **调用 CLI**：在本 skill 目录或用脚本完整路径执行 `node scripts/cli.mjs call <server_type> <tool_name> '<params_json>'`（CLI 与当前工作目录无关）。shell 写法不确定或命中 `INVALID_PARAMS_JSON` 时读取 `references/shell-escaping.md`；涉及 Key、stdout / stderr 解析或 sandbox 时读取 `references/runtime-contract.md`。
8. **处理结果**：成功则解析 stdout 并回答（铁律 6）；失败则按 stdout 中 `error.agent_action` 执行（铁律 5），需要完整分支时读取 `references/error-handling.md`。

## 路由顺序

意图可能多义时，优先选择最具体的专项路径：

1. 公告、年报、季报、招股书、监管披露 -> `financial_docs.get_company_announcements`
2. 新闻、媒体、快讯、报道、评论、消息 -> `financial_docs.get_financial_news`
3. 宏观或行业 EDB 指标 -> `economic_data.get_economic_data`
4. 最新价、涨跌幅、成交量、K 线、分钟线、"最近 N 天 / 区间 / 走势" -> 对应市场的行情工具（走势 / 区间历史一律走 K 线，不得用 `analytics_data` 代替）
5. 财务、股本、股东、事件、技术、风险、持仓、业绩、主体财务 -> 对应领域 NL 工具
6. 专项路由无法覆盖的结构化取数 -> `analytics_data.get_financial_data`

`analytics_data` 不是复杂问句入口。只有专项工具无法覆盖剩余结构化数据，或允许的专项路径因字段 /
口径 / 无结果失败后，才可用它补取并合并结果。单次工具调用只查一个标的；多标的对比拆成多次调用后合并。

## 资源导航

| 读取或运行 | 何时 | 权威于 |
| --- | --- | --- |
| `references/tool-manifest.json` | **MUST**：构造 params 前校验组合 | 合法 `server_type + tool_name` |
| `references/tool-contracts.md` | **MUST**：选定工具后读对应段落 | 工具字段、参数、场景、示例 |
| `references/indicators.md` | **MUST**：入参需填指标 / 字段名时（如 `indexes`），每次核对 | Wind 指标 / 字段名词典 |
| `references/shell-escaping.md` | MAY：非 bash 或命中 `INVALID_PARAMS_JSON` | 各 shell 的 JSON 引号与转义 |
| `references/runtime-contract.md` | MAY：处理 Key / stdout / cwd / sandbox 时 | CLI 运行时契约 |
| `references/error-handling.md` | MAY：CLI 失败、需判断重试 / 兜底 / 停止 | 错误分组与 fallback 策略 |
| `references/error-codes.json` | MAY：查具体码义 | 完整错误码与 `agent_action` 总表 |
| `references/fallback-alice.md` | MAY：判定可切 `wind-alice` 后 | wind-alice 最终兜底流程 |

## 失败与回答

失败处理遵循铁律 5：先按 `error.agent_action` 行动。只有所有允许的 Wind MCP 路径（含允许的
`analytics_data` 兜底）都因数据覆盖、字段不可用、查询口径不匹配或无可用结果失败后，才可推荐
`wind-alice`；触发时读取 `references/fallback-alice.md` 并先问用户。

回答遵循铁律 6：只返回 Wind 实际数据。若数据时效、缺失字段、报告期滞后、无结果或口径限制会
影响解释，必须说明。成功返回数据时末尾附上：

> 数据来源于万得 Wind 金融数据服务。
