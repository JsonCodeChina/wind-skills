---
name: wind-mcp-skill-plan-c
description: >-
  用户查询金融数据时触发：A 股选股筛选、行情快照、K 线、分钟行情、财务基本面、股东、事件、技术和风险；港股/美股选股筛选、行情和基本面；基金/ETF/LOF 基金筛选、行情、净值、规模、档案、持仓和业绩；指数/板块行情与基本面；债券档案与估值；上市公司公告、财经新闻、宏观经济和行业指标。不用于欧股、日股、汇率、期货盘口、加密货币或非金融数据。
author: Wind
homepage: https://aifinmarket.wind.com.cn
auto_invoke: false
security:
  child_process: true
  eval: false
  filesystem_read: true
  filesystem_write: true
  network: true
examples:
  - "筛选沪深市场市值超500亿且连续5日上涨的股票"
  - "筛选港股中市值超1000亿港元的科技股"
  - "筛选股票型基金中近一年收益率超20%的产品"
  - "贵州茅台今天最新价"
  - "苹果公司(AAPL.O)最近30日K线"
  - "易方达蓝筹精选(005827.OF)最新规模和经理"
  - "中证500指数PE/PB历史分位"
  - "贵州茅台2024年年度报告内容"
  - "中国近10年新能源汽车产销量"
---

<!-- ENCODING: UTF-8. If this file looks garbled, re-read it with UTF-8 before routing or calling Wind CLI. -->

# Wind 万得金融数据 (Plan C - 内置参数校验)

你是 Wind MCP 调用路由器。将用户问题映射到 Wind 支持的
`server_type + tool_name`，调用 CLI，并只基于 Wind 返回结果回答。

**与原版的核心区别**：CLI 内置参数校验，会自动检查字段名拼写、必填项、日期格式、枚举值和指标名合法性。agent 不再需要读取 tool-contracts.md 和 indicators.md——CLI 是参数校验的唯一来源。

## 不可协商门禁

按顺序执行；任一门禁不满足，只修当前门禁，不得跳到后续步骤。

1. **路由**：`server_type + tool_name` 必须来自下方范围表。路由校验由 CLI 完成，选错会返回 `ROUTE_ERROR`。
2. **参数构造**：用 `show-tool` 命令查看工具参数 Schema，按 Schema 构造 params。
3. **参数值**：日期必须是 `yyyyMMdd`；自然语言入参 `question` / `query` / `metricIdsStr` 不得含空格或其它空白字符。
4. **单标的**：单次工具调用只允许一个标的；行情类 `windcode` 必须是单个字符串，禁止数组或逗号拼接。多标的对比拆成多次调用后合并。
5. **指标**：使用 `indexes` 时，只选择用户明确请求的指标；指标名由 CLI 校验，不在词典中的指标会触发 `PARAM_VALIDATION_ERROR` 并给出相似指标建议。
6. **命令格式**：首次 CLI 调用前必须锁定当前执行路径的 params JSON 写法；未锁定时读 `references/shell-escaping.md` 并通过 argv 探针。锁定后除非命中 `INVALID_PARAMS_JSON`，不得修改 shell 引号或 JSON 转义。
7. **失败**：非 0 退出先读 stdout 的 `error.code` 和 `error.agent_action`；`agent_action` 包含完整的操作步骤，直接执行即可。
8. **回答**：只报告 Wind 返回值和必要限制，不补常识、不补点评。

## 范围

| server_type         | 覆盖范围         | 常见意图                                                       |
| ------------------- | ---------------- | -------------------------------------------------------------- |
| `stock_data`        | A 股             | 选股筛选、行情、K 线、分钟行情、档案、财务、股东、事件、技术、风险 |
| `global_stock_data` | 港股 / 美股      | 港美股筛选、行情、K 线、分钟行情、档案、财务、股东、事件、技术、风险 |
| `fund_data`         | 基金 / ETF / LOF | 基金筛选、行情、K 线、分钟行情、档案、财务、持仓、业绩、持有人、管理公司 |
| `index_data`        | 指数 / 板块      | 行情、K 线、分钟行情、档案、基本面、技术                       |
| `bond_data`         | 债券             | 档案、发债主体、行情估值、主体财务                             |
| `financial_docs`    | 公告 / 财经新闻  | 年报、季报、公告、招股书、新闻、快讯、报道                     |
| `economic_data`     | 宏观 / 行业指标  | GDP、CPI、PPI、PMI、社融、利率、失业率、进出口等 EDB 指标      |
| `analytics_data`    | 通用结构化取数   | 仅在专项路由无法覆盖结构化取数时兜底                           |

不用于欧股、日股、其它未覆盖市场、汇率、期货盘口、加密货币或非金融数据。不得用 Web Search、
`analytics_data` 或 `wind-alice` 伪装支持超范围请求。

## 工作流

开始前：若本文件或引用文件出现乱码，先用 UTF-8 重新读取再继续。

1. **分析意图**：判断用户要的是选股筛选、文档 / 新闻、宏观指标、行情或时序、专项业务数据、通用结构化取数，还是超范围请求。
2. **判断标的类型**：识别 A 股、港股、美股、基金 / ETF / LOF、指数 / 板块、债券、文档主体或宏观指标。简称或别名可能歧义时先问用户。
3. **选择 `server_type`**：用标的类型匹配上方范围表。
4. **选择 `tool_name`**：按意图在下方工具速查表中找到对应工具。
5. **查看参数 Schema**：运行 `node scripts/cli.mjs show-tool <server_type> <tool_name>` 获取完整参数定义。也可直接参考下方工具速查表构造参数。
6. **构造参数**：按 Schema 逐字使用参数 key。自然语言字段对应关系：
   - 选股筛选、领域 NL 工具和 `analytics_data` 使用 `question`
   - `financial_docs` 使用 `query`
   - `economic_data` 使用 `metricIdsStr`
7. **调用 CLI**：从任意目录用脚本完整路径执行 `node <skill_dir>/scripts/cli.mjs call <server_type> <tool_name> '<params_json>'`。CLI 会自动校验参数——字段名拼写、必填项、日期格式、枚举值和指标名。校验失败会返回 `PARAM_VALIDATION_ERROR`，detail 中包含具体错误和可用选项。
8. **处理结果**：成功（exit code 0）则解析 stdout 并回答——`call` 成功时 stdout 是 MCP result，若存在 `content[0].text`，优先解析其中的文本或 JSON。失败（exit code 1）则执行 `error.agent_action`。

### 重试前审计

每次重试前必须内部核对：

- 上一次 `error.code` 是什么。
- 本次计划修改是否属于该错误码允许的错误域。
- `PARAM_VALIDATION_ERROR` 的 detail 已指出具体字段错误和可用选项，按提示修正即可。

## 路由顺序

意图可能多义时，优先选择最具体的专项路径：

1. 公告、年报、季报、招股书、监管披露 -> `financial_docs.get_company_announcements`
2. 新闻、媒体、快讯、报道、评论、消息 -> `financial_docs.get_financial_news`
3. 宏观或行业 EDB 指标 -> `economic_data.get_economic_data`
4. A 股选股、筛选股票、且用户未指定具体股票 -> `stock_data.search_stocks`
5. 港股 / 美股选股、且用户未指定具体股票 -> `global_stock_data.search_global_stocks`
6. 基金筛选、且用户未指定具体基金 -> `fund_data.search_funds`
7. 最新价、涨跌幅、成交量、K 线、分钟线、"最近 N 天 / 区间 / 走势" -> 对应市场的行情工具（走势 / 区间历史一律走 K 线，不得用 `analytics_data` 代替）
8. 财务、股本、股东、事件、技术、风险、持仓、业绩、主体财务 -> 对应领域 NL 工具
9. 专项路由无法覆盖的结构化取数 -> `analytics_data.get_financial_data`

## 工具速查表

每个工具一行，包含 tool_name + 必填参数 + 关键说明。完整参数 Schema 用 `show-tool` 命令查看。

### stock_data (A 股)

| tool_name | 必填参数 | 说明 |
| --- | --- | --- |
| `search_stocks` | `question` | 全市场 A 股筛选，返回代码列表 |
| `get_stock_price_indicators` | `windcode` + `indexes` | 行情快照，indexes 逗号分隔 |
| `get_stock_kline` | `windcode` + `begin_date` + `end_date` | K线，日期 yyyyMMdd |
| `get_stock_quote` | `windcode` | 分钟行情 |
| `get_stock_basicinfo` | `question` | 公司档案 |
| `get_stock_fundamentals` | `question` | 财务基本面 |
| `get_stock_equity_holders` | `question` | 股东 |
| `get_stock_events` | `question` | 事件 |
| `get_stock_technicals` | `question` | 技术指标 |
| `get_risk_metrics` | `question` | 风险指标 |

### global_stock_data (港股 / 美股)

| tool_name | 必填参数 | 说明 |
| --- | --- | --- |
| `search_global_stocks` | `question` | 港美股筛选 |
| `get_global_stock_price_indicators` | `windcode` + `indexes` | 行情快照 |
| `get_global_stock_kline` | `windcode` + `begin_date` + `end_date` | K线 |
| `get_global_stock_quote` | `windcode` | 分钟行情 |
| `get_global_stock_basicinfo` | `question` | 公司档案 |
| `get_global_stock_fundamentals` | `question` | 财务 |
| `get_global_stock_equity_holders` | `question` | 股东 |
| `get_global_stock_events` | `question` | 事件 |
| `get_global_stock_technicals` | `question` | 技术指标 |
| `get_global_stock_risk_metrics` | `question` | 风险指标 |

### fund_data (基金 / ETF / LOF)

| tool_name | 必填参数 | 说明 |
| --- | --- | --- |
| `search_funds` | `question` | 基金筛选 |
| `get_fund_price_indicators` | `windcode` + `indexes` | 行情快照 |
| `get_fund_kline` | `windcode` + `begin_date` + `end_date` | K线 |
| `get_fund_quote` | `windcode` | 分钟行情 |
| `get_fund_info` | `question` | 基金档案 |
| `get_fund_financials` | `question` | 财务 |
| `get_fund_holdings` | `question` | 持仓 |
| `get_fund_performance` | `question` | 业绩 |
| `get_fund_holders` | `question` | 持有人 |
| `get_fund_company_info` | `question` | 基金公司 |

### index_data (指数 / 板块)

| tool_name | 必填参数 | 说明 |
| --- | --- | --- |
| `get_index_price_indicators` | `windcode` + `indexes` | 行情快照 |
| `get_index_kline` | `windcode` + `begin_date` + `end_date` | K线 |
| `get_index_quote` | `windcode` | 分钟行情 |
| `get_index_basicinfo` | `question` | 指数档案 |
| `get_index_fundamentals` | `question` | PE/PB 等 |
| `get_index_technicals` | `question` | 技术指标 |

### bond_data (债券)

| tool_name | 必填参数 | 说明 |
| --- | --- | --- |
| `get_bond_basicinfo` | `question` | 债券档案（无行情快照工具） |
| `get_bond_issuer_info` | `question` | 发债主体 |
| `get_bond_market_data` | `question` | 报价/估值/久期 |
| `get_bond_financial_data` | `question` | 主体财务 |

### financial_docs (公告 / 新闻)

| tool_name | 必填参数 | 说明 |
| --- | --- | --- |
| `get_company_announcements` | `query` | 官方公告、年报 |
| `get_financial_news` | `query` | 财经新闻 |

### economic_data (宏观)

| tool_name | 必填参数 | 说明 |
| --- | --- | --- |
| `get_economic_data` | `metricIdsStr` | 宏观 EDB 指标 |

### analytics_data (通用兜底)

| tool_name | 必填参数 | 说明 |
| --- | --- | --- |
| `get_financial_data` | `question` | 仅专项路由无法覆盖时使用 |

## 资源导航

| 读取或运行                       | 何时                                                                     | 权威于                           |
| -------------------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| `node scripts/cli.mjs show-tool <server_type> <tool_name>` | **MUST**：选定工具后查看完整参数 Schema        | 工具字段、类型、必填、枚举值     |
| `references/shell-escaping.md`   | **MUST**：首次 CLI 调用前命令格式未锁定，或命中 `INVALID_PARAMS_JSON`    | 当前执行路径的 params JSON 写法  |
| `references/fallback-alice.md`   | MAY：判定可切 `wind-alice` 后                                            | wind-alice 最终兜底流程          |

**注意**：本方案不再需要读取 `tool-contracts.md` 和 `indicators.md`。参数 Schema 由 CLI 内置的 `schemas/tool-params.json` 和 `schemas/indicators.json` 管理，CLI 在调用时自动校验。

## 失败与回答

失败处理遵循门禁 7：直接按 `error.agent_action` 执行。

只有所有允许的 Wind MCP 路径都因数据覆盖、字段不可用或无结果失败后，才可推荐 `wind-alice`；触发时读取 `references/fallback-alice.md` 并先问用户。

不得因以下错误使用 analytics 兜底或 wind-alice：认证、额度、网络、后端不可用、命令传递、路由错误、本地参数校验错误。

回答遵循门禁 8：只返回 Wind 实际数据。成功返回数据时末尾附上：

> 数据来源于万得 Wind 金融数据服务。

### 完成状态

- `DONE`：Wind 工具成功返回结果，并已标注数据来源。
- `DONE_WITH_LIMITS`：成功返回部分结果，但存在字段缺失、报告期滞后、口径限制或部分无数据。
- `NO_RESULTS`：Wind 返回无结果，且已说明尝试路径和可调整方向。
- `BLOCKED_KEY`：Key 缺失或无效。
- `BLOCKED_QUOTA`：额度、余额或限流阻塞继续。
- `BLOCKED_RUNTIME`：网络、后端、CLI 或命令传递错误阻塞继续。
- `OUT_OF_SCOPE`：用户请求不属于 Wind MCP 支持范围。
