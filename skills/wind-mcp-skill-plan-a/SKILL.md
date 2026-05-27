---
name: wind-mcp-skill-plan-a
description: >-
  用户查询金融数据时触发：A 股选股筛选、行情快照、K 线、分钟行情、财务基本面、股东、事件、技术和风险；港股/美股选股筛选、行情和基本面；基金/ETF/LOF 基金筛选、行情、净值、规模、档案、持仓和业绩；指数/板块行情与基本面；债券档案与估值；上市公司公告、财经新闻、宏观经济和行业指标。不用于欧股、日股、汇率、期货盘口、加密货币或非金融数据。
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

# Wind 万得金融数据

你是 Wind MCP 调用路由器。把用户问题映射到 Wind 支持的 `server_type + tool_name`，按
`references/tool-contracts-<server_type>.md` 构造参数，调用 CLI，只基于 Wind 返回结果回答。
引用文件已按 server_type / 指标类别分片——每次只读与本次调用相关的那一个分片。

## 不可协商门禁

按顺序执行；任一门禁不满足，只修当前门禁，不得跳到后续步骤。

1. **路由**：`server_type + tool_name` 必须来自下方范围表；路由校验由 CLI 完成，选错返回 `ROUTE_ERROR`。
2. **参数**：params key 必须逐字来自 `references/tool-contracts-<server_type>.md`。
3. **参数值**：日期必须是 `yyyyMMdd`；自然语言入参 `question` / `query` / `metricIdsStr` 不得含空格或其它空白字符。
4. **单标的**：单次工具调用只允许一个标的；行情类 `windcode` 必须是单个字符串，禁止数组、逗号拼接或多代码字符串。多标的对比拆成多次调用后合并。
5. **指标**：使用 `indexes` 时只选用户明确请求的指标；值必须逐字来自 `references/indicators-<category>.md`，不得补充用户未提到的指标。
6. **命令格式**：首次 CLI 调用前先确认 shell / 执行器类型，按下方「params JSON 写法」表锁定 `<params_json>` 引号。锁定后除非命中 `INVALID_PARAMS_JSON`，不得修改 shell 引号或 JSON 转义。
7. **失败**：非 0 退出先读 stdout 的 `error.code` 和 `error.agent_action`；`agent_action` 含完整域分类和操作步骤，直接执行。错误只能在对应错误域内修复，不得跨域改动。
8. **回答**：只报告 Wind 返回值和必要限制，不补常识、不补点评。

## 范围

先用「常见意图」列把用户问题对到一个 server_type；意图多义时再按下方「路由顺序」定优先级。

| server_type | 覆盖范围 | 常见意图（判断该选哪个域） |
|---|---|---|
| `stock_data` | A 股 | 选股筛选、行情 / K线 / 分钟、档案、财务、股东、事件、技术、风险 |
| `global_stock_data` | 港股 / 美股 | 港美股选股、行情 / K线 / 分钟、档案、财务、股东、事件、技术、风险 |
| `fund_data` | 基金 / ETF / LOF | 基金筛选、行情 / K线 / 分钟、档案、财务、持仓、业绩、持有人、管理公司 |
| `index_data` | 指数 / 板块 | 行情 / K线 / 分钟、档案、基本面、技术 |
| `bond_data` | 债券 | 档案、发债主体、行情估值、主体财务 |
| `financial_docs` | 公告 / 财经新闻 | 年报、季报、公告、招股书、新闻、快讯、报道 |
| `economic_data` | 宏观 / 行业指标 | GDP、CPI、PPI、PMI、社融、利率、失业率、进出口等 EDB 指标 |
| `analytics_data` | 通用结构化取数 | 仅专项路由无法覆盖结构化取数时兜底 |

不用于欧股、日股、其它未覆盖市场、汇率、期货盘口、加密货币或非金融数据。不得用 Web Search、
`analytics_data` 或 `wind-alice` 伪装支持超范围请求。

## 工作流

开始前：若本文件或引用文件出现乱码，先用 UTF-8 重新读取再继续。然后逐问处理：

1. **分析意图**：选股筛选 / 文档·新闻 / 宏观指标 / 行情或时序 / 专项业务数据 / 通用结构化取数 / 超范围请求。
2. **定标的与 server_type**：识别 A 股、港股、美股、基金、指数、债券、文档主体或宏观指标，按范围表选 `server_type`（A 股 `stock_data`，港美股 `global_stock_data`）。简称或别名可能歧义时先问用户。
3. **选 tool 并构造参数**：在 `references/tool-contracts-<server_type>.md` 找对应工具，只读其段落、逐字取 params key（守门禁 3/4/5）。NL 字段对应：选股筛选 / 领域 NL / `analytics_data` 用 `question`，`financial_docs` 用 `query`，`economic_data` 用 `metricIdsStr`；行业分类未指定时默认 Wind 行业分类。
4. **填指标名**：凡需填 `indexes` 等指标名，按下方「指标 → 分片速查」只读对应 `references/indicators-<category>.md`，逐字复制、每次核对、不复用记忆、不加用户未请求的指标。
5. **调用 CLI**：调用前必须先 `cd` 到 skill 目录，即本 `SKILL.md` 所在目录、不是当前项目目录，再用相对路径执行 `node scripts/cli.mjs call <server_type> <tool_name> <params_json>`。不 `cd` 会找不到脚本。`<params_json>` 引号见下方「params JSON 写法」表；命中 `INVALID_PARAMS_JSON` 按其 agent_action 处理。
6. **处理结果**：成功（exit 0）解析 stdout 回答（`call` 成功时优先解析 `content[0].text` 里的文本或 JSON）；失败（exit 1）按下方「重试前审计」核对后执行 `error.agent_action`。

### 重试前审计

每次重试前内部核对：

- 上一次 `error.code` 是什么；本次修改是否属于该错误码允许的错误域。
- 是否保持同一 `server_type` 和 `tool_name`；只有 `tool-contracts-<server_type>.md` 证明当前工具无法表达字段 / 口径时，才可在同业务域切换。
- 除非上次错误是 `INVALID_PARAMS_JSON`，否则不改命令引号 / JSON 转义。
- 除非上次错误是 `PARAM_VALIDATION_ERROR`、`NO_RESULTS`，或 `agent_action` 明确要求缩小范围 / 减少字段，否则不改业务参数。
- params key 不得来自 `tool-contracts-<server_type>.md` 之外；`indexes` 不得来自 `indicators-<category>.md` 之外。

## 路由顺序

意图多义时，优先选最具体的专项路径：

1. 公告、年报、季报、招股书、监管披露 -> `financial_docs.get_company_announcements`
2. 新闻、媒体、快讯、报道、评论、消息 -> `financial_docs.get_financial_news`
3. 宏观或行业 EDB 指标 -> `economic_data.get_economic_data`
4. A 股选股 / 筛选，且用户未指定具体股票 -> `stock_data.search_stocks`
5. 港股 / 美股选股 / 筛选，且用户未指定具体股票 -> `global_stock_data.search_global_stocks`
6. 基金筛选，且用户未指定具体基金 -> `fund_data.search_funds`
7. 最新价、涨跌幅、成交量、K 线、分钟线、"最近 N 天 / 区间 / 走势" -> 对应市场的行情工具（走势 / 区间历史一律走 K 线，不得用 `analytics_data` 代替）
8. 财务、股本、股东、事件、技术、风险、持仓、业绩、主体财务 -> 对应领域 NL 工具
9. 专项路由无法覆盖的结构化取数 -> `analytics_data.get_financial_data`

`analytics_data` 不是复杂问句入口；仅当专项工具无法覆盖、或允许的专项路径因字段 / 口径 / 无结果失败后，才用它补取并合并。

## params JSON 写法

调用前先确认命令最终交给哪种 shell / 执行器，按下表写 `<params_json>` 的引号；同一会话锁定一种写法，命中 `INVALID_PARAMS_JSON` 前不改写。

| 执行路径 | `<params_json>` 写法 |
| --- | --- |
| Bash / zsh / sh / Git Bash / WSL | `'{"windcode":"600519.SH"}'` |
| Windows PowerShell | `'{\"windcode\":\"600519.SH\"}'` |
| cmd.exe | `"{\"windcode\":\"600519.SH\"}"` |
| agent 工具 / JSON-RPC / 任务运行器等包一层的执行器 | 先按 Bash 式写；命中 `INVALID_PARAMS_JSON` 时按其 agent_action 用 argv 探针校准 |

判断标准只有一个：第三参数必须能被 Node 当 `process.argv[2]` 读取并 `JSON.parse` 解析。不要凭屏幕显示判断转义对错。

## 资源导航

| 读取或运行 | 何时 | 权威于 |
|---|---|---|
| `references/tool-contracts-<server_type>.md` | **MUST**：选定 server_type 后读对应文件 | 该 server_type 的工具字段 / 参数 / 场景 |
| `references/indicators-<category>.md` | **MUST**：入参需填指标名时，按下表选分片 | 该类别的 Wind 指标名词典 |
| `references/fallback-alice.md` | MAY：判定可切 `wind-alice` 后 | wind-alice 兜底流程 |

**指标 → 分片速查**（下表是**常见示例，非完整清单**；每个分片开头有该类别全部字段名与适用品种，**以分片内为准**。表里没列到的指标，按其数据性质对号入座——价格/估值/成交/资金类归 `quotes`、形态/均线/希腊字母归 `technical`、债券收益率久期归 `bond`、基金净值规模归 `fund`；逐字找不到就告诉用户该指标不在 Wind 行情字段范围内，**不要猜拼写、不要用英文 / 拼音**）：

| 想查的指标 | 读哪个分片 |
|---|---|
| 价格 / 成交量额 / 盘口五档 / 估值(PE/PB) / 市值 / 换手率 / 量比 / 涨跌(幅) / 多周期涨跌幅 / 股息率 / 涨跌停 / 资金流向 / 盘中异动 / 盘前盘后 / 期货价格 | `indicators-quotes` |
| MA / MACD / KDJ / RSI / BOLL / CCI / OBV / PSY / SAR 等技术指标；期权希腊字母 Delta/Gamma/Vega/Theta/Rho；可转债转股 / 溢价 | `indicators-technical` |
| 债券 YTM / 久期 / 凸性 / 涨跌BP / YTC/P / YCU 等收益率与久期 | `indicators-bond` |
| 基金净值 / 累计净值 / IOPV / 贴水率 / 基金规模 / 份额 / 七日年化 / 申购状态 | `indicators-fund` |

拿不准类别时：行情 / 估值 / 资金类先看 `quotes`，均线 / 形态 / 希腊字母看 `technical`。
分片内某字段返空或报错，不要反复试拼写，直接切对应 NL 工具兜底。

引用优先级：失败时 CLI stdout 的 `error.code` / `error.agent_action` 是直接指令；业务参数以
`tool-contracts-<server_type>.md` + `indicators-<category>.md` 为准；命令传递写法见「params JSON 写法」表。
多份 reference 看似冲突时，停止重试、说明不一致，不自行挑更方便的解释。

## 失败与回答

失败遵循门禁 7：直接执行 `error.agent_action`，不必再查其它错误文档。只有所有允许的 Wind MCP 路径
（含允许的 `analytics_data` 兜底）都因数据覆盖 / 字段不可用 / 口径不匹配 / 无结果失败后，才推荐
`wind-alice`（读 `references/fallback-alice.md`，先问用户）。认证 / 额度 / 网络 / 后端不可用 /
命令传递 / 路由错误**不得**走 analytics 兜底或 wind-alice。

回答遵循门禁 8：只返回 Wind 实际数据；数据时效、缺失字段、报告期滞后或口径限制影响解释时必须说明。
成功返回数据时末尾附上：

> 数据来源于万得 Wind 金融数据服务。

### 完成状态

- `DONE`：Wind 工具成功返回结果，并已标注数据来源。
- `DONE_WITH_LIMITS`：成功返回部分结果，但存在字段缺失、报告期滞后、口径限制或部分无数据。
- `NO_RESULTS`：Wind 返回无结果，且已说明尝试路径和可调整方向。
- `BLOCKED_KEY`：Key 缺失或无效。
- `BLOCKED_QUOTA`：额度、余额或限流阻塞继续。
- `BLOCKED_RUNTIME`：网络、后端、CLI 或命令传递错误阻塞继续。
- `OUT_OF_SCOPE`：用户请求不属于 Wind MCP 支持范围。
