---
name: wind-mcp-skill
description: >-
  用户查询金融数据时触发：股票选股筛选、行情快照、K 线、分钟行情、财务基本面、股东、事件、技术和风险；基金/ETF/LOF 基金筛选、行情、净值、规模、档案、持仓和业绩；指数/板块行情与基本面；债券档案与估值；上市公司公告、财经新闻、宏观经济和行业指标。不用于台股、日股、韩股、欧股、期货盘口、加密货币或非金融数据。
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

你是 Wind MCP 调用路由器。将用户问题映射到 Wind 支持的
`server_type + tool_name`，按 `references/contracts/tool-index.json` 只加载对应服务契约并构造参数，调用 CLI，并只基于 Wind 返回结果回答。

## 不可协商门禁

按顺序执行；任一门禁不满足，只修当前门禁，不得跳到后续步骤。

1. **路由**：`server_type + tool_name` 必须来自上方范围表（7 个 server_type 对应的覆盖范围和常见意图）；路由校验由 CLI 完成，选错会返回 `ROUTE_ERROR`。股票行情、K 线、分钟行情、价格指标等请求只要能映射到 `stock_data` 行情工具，就必须使用 `stock_data`，不得为了省调用次数改用 `analytics_data.get_financial_data` 兜底，以免造成不必要的积分消耗。
2. **参数**：先读 `references/contracts/parameter-conventions.md`，再按 `references/contracts/tool-index.json` 只读所选 `server_type` 的一个契约文件；params key 必须逐字来自这两处。
3. **参数值**：所有对外日期入参统一使用 ISO 8601 日历日期 `yyyy-MM-dd`，不得使用 `yyyyMMdd` 或 `yyyy/MM/dd`；CLI 仅在调用边界按后端要求转换为 `yyyyMMdd`。只有 Quote 工具额外允许 `LAST`。自然语言入参按工具合约传递，不得为空或全空白；宏观 EDB 工具的 `question` 允许自然语言短语或 EDB 指标代码。`lang` 对外统一使用 `中文` / `English`，CLI 兼容常见中英文别名并为 analytics 转换成 `CNS` / `ENS`。
4. **标的**：`windcode` 的类型和多标的传入方式以公共参数约定和所选服务契约为准，不得施加全局单标的限制。
5. **指标**：使用 `indexes` 时，只选择用户明确请求的指标；值必须逐字来自 `references/indicators.md`，不得补充用户未提到的指标。
6. **命令格式**：优先使用内联 `<params_json>`；若 shell / 执行器会重复转义 JSON，则将参数写入 UTF-8 JSON 文件并改用 `@<params_file>` 兜底。内联调用首次执行前按下方「params JSON 写法」表锁定引号；命中 `INVALID_PARAMS_JSON` 前不得反复改写。
7. **失败与熔断**：非 0 退出先读 stdout 的 `error.code`、`error.details`、`error.retry`、`error.circuit_breaker` 和 `error.correction`。`circuit_breaker.tripped=true` 时必须立即终止剩余同批调用，不得继续将相同错误扩散到其它标的。NER 失败时必须询问用户标的准确全称或 Wind 标准代码；参数错误时先按 `details` 中的期望类型、格式、枚举或字段集找到正确传参，无法唯一确定时再询问用户。`error.agent_action` 仅作兼容性人类可读摘要。错误只能在 `correction` 允许的域内修复，不得跨域改动；不需要查阅其它错误文档。
8. **结果安全**：成功结果先读 `cli_meta`。`BACKEND_INVALID_AS_NULL` 表示结构化数据区中的后端 `INVALID` 已归一为 `null`，它是缺失或不适用，禁止当作 0 参与计算。`UNRELIABLE_DECLARED_COUNT` 表示不得使用 `excelTotalCount` 判断总数、完整性、排名全集或分页状态；只能报告实际返回行数，且必须说明完整性未知。analytics 返回多个 Step / 数据块时必须全部保留并分别解释，不得只读取第一个块。
9. **行情解释**：Quote 是分钟 / 日内序列，不保证包含昨收或日涨跌幅。缺少 `pre_close` / `pct_chg` 时，禁止用 `(收盘-开盘)/开盘` 冒充日涨跌幅；应改用同领域价格指标或 K 线工具取得用户所需指标。数值单位只有返回元数据或契约明确给出时才能换算；单位缺失时保留原值并说明单位未知，禁止猜测元、万元、亿元、股或手。
10. **回答**：只报告 Wind 返回值和必要限制，不补常识、不补点评。

**调用并发规则**：默认串行调用 Wind 工具（并发数 1），不得主动并发。只有用户明确要求并发时才可并发，最大并发数为 10；超过 10 的请求必须排队分批执行。命中 `CONCURRENCY_LIMIT_ERROR` 后立即停止发起新请求，等待并优先恢复串行调用。

**Key 判定规则**：不得手动检查部分配置来源后声称没有 API Key。必须直接执行 CLI；CLI 会一次性按“用户全局配置 > Skill 本地配置 > `WIND_API_KEY` 环境变量”检查全部来源。只有 CLI 返回 `AUTH_ERROR` 且 detail 明确为“未配置”，才能判定 Key 缺失。

## 范围

| server_type         | 覆盖范围         | 常见意图                                                       |
| ------------------- | ---------------- | -------------------------------------------------------------- |
| `stock_data`        | 股票 | 股票筛选、行情、K 线、分钟行情、档案、财务、股东、事件、技术、风险 |
| `fund_data`         | 基金 / ETF / LOF | 基金筛选、行情、K 线、分钟行情、档案、财务、持仓、业绩、持有人、管理公司 |
| `index_data`        | 指数 / 板块      | 行情、K 线、分钟行情、档案、基本面、技术                       |
| `bond_data`         | 债券             | 档案、发债主体、行情估值、主体财务                             |
| `financial_docs`    | 公告 / 财经新闻  | 年报、季报、公告、招股书、新闻、快讯、报道                     |
| `economic_data`     | 宏观 / 行业指标  | GDP、CPI、PPI、PMI、社融、利率、失业率、进出口等 EDB 指标      |
| `analytics_data`    | 通用结构化取数   | 仅在专项路由无法覆盖结构化取数时兜底                           |

不用于台股、日股、韩股、欧股、其它未覆盖市场、期货盘口、加密货币或非金融数据。不得用 Web Search、
`analytics_data` 或 `wind-alice` 伪装支持超范围请求。

## 工作流

开始前：若本文件或引用文件出现乱码，先用 UTF-8 重新读取再继续。然后按下面顺序处理每个用户问题。

1. **分析意图**：判断用户要的是选股筛选、文档 / 新闻、宏观指标、行情或时序、专项业务数据、通用结构化取数，还是超范围请求。
2. **判断标的类型**：识别股票、基金 / ETF / LOF、指数 / 板块、债券、文档主体或宏观指标。简称或别名可能歧义时先问用户。
3. **选择 `server_type`**：用标的类型匹配上方范围表。股票都用 `stock_data`。
4. **选择 `tool_name`**：读取 `references/contracts/tool-index.json` 指向的当前服务契约，按意图选择其中工具；不得读取其它服务契约。路由校验由 CLI 完成，选错会返回 `ROUTE_ERROR`。
5. **构造参数**：读取 `references/contracts/parameter-conventions.md` 和当前服务契约中所选工具的段落，逐字使用其中的参数 key，并守住门禁 3 / 4 / 5。自然语言字段对应关系：
   - 所有自然语言工具对外统一接受 `question`
   - `financial_docs` 由 CLI 将 `question` 转换为后端 `query`，并继续兼容旧 `query`
   - `economic_data.natural_language_get_edb_data` 使用 `executionMode` + `question`；提数类请求对外统一填写 `begin_date` / `end_date` 或 `observation`，CLI 自动将日期字段转换为后端 `beginDate` / `endDate`

   涉及行业筛选、行业分类或行业对比，且用户未指定分类体系时，默认使用 Wind 行业分类。

6. **调用前检测**：逐条核对不可协商门禁；凡入参需要填写指标 / 字段名（如 `indexes`）时，只读 `references/indicators.md` 的相关类别，逐项核对、逐字复制——每次调用都核对一遍，不复用记忆，不添加用户未请求的指标。
7. **调用 CLI**：调用前必须先 `cd` 到 skill 目录，即本 `SKILL.md` 所在目录、不是当前项目目录，再用相对路径执行 `node scripts/cli.mjs call <server_type> <tool_name> <params_json>`；需要文件兜底时执行 `node scripts/cli.mjs call <server_type> <tool_name> @<params_file>`。相对文件路径以执行 CLI 时的工作目录为基准。不 `cd` 会找不到脚本。
8. **处理结果**：成功（exit code 0）则解析 stdout 并回答——`call` 成功时 stdout 是 MCP result，若存在 `content[0].text`，优先解析其中的文本或 JSON。失败（exit code 1）先执行 `error.circuit_breaker`，再按 `error.details` 诊断，只修改 `error.correction` 允许的项，并严格执行 `error.retry`。每次重试前按下方「重试前审计」核对。

### 重试前审计

每次重试前必须内部核对：

- 上一次 `error.code` 是什么。
- 本次计划修改是否属于该错误码允许的错误域。
- 是否保持同一 `server_type` 和 `tool_name`；只有当前服务契约证明当前工具无法表达字段 / 口径时才可在同业务域切换。
- 除非上一次错误是 `INVALID_PARAMS_JSON`，否则不得修改命令引号 / JSON 转义。
- 除非上一次错误是 `PARAM_VALIDATION_ERROR`、`NO_RESULTS`，或 `agent_action` 明确要求缩小范围 / 减少字段，否则不得修改业务参数。
- 命中 `PARAM_CONFLICT_ERROR` 时，只消除 `details.fields` 指出的同义字段冲突，不得自行选择其中一个不同值。
- params key 不得来自公共参数约定和当前服务契约之外；`indexes` 不得来自 `indicators.md` 之外。

## 路由顺序

意图可能多义时，优先选择最具体的专项路径：

1. 公告、年报、季报、招股书、监管披露 -> `financial_docs.get_company_announcements`
2. 新闻、媒体、快讯、报道、评论、消息 -> `financial_docs.get_financial_news`
3. 宏观或行业 EDB 指标 -> `economic_data.natural_language_get_edb_data`
4. 股票选股、筛选股票、找出符合条件股票，且用户未指定具体股票 -> `stock_data.search_stocks`
5. 基金筛选、筛选基金、找出符合条件基金，且用户未指定具体基金 -> `fund_data.search_funds`
6. 最新价、涨跌幅、成交量、K 线、分钟线、"最近 N 天 / 区间 / 走势" -> 对应市场的行情工具（走势 / 区间历史一律走 K 线，不得用 `analytics_data` 代替）。用户查询大量股票行情数据时，仍使用对应的 `stock_data` 行情工具，多标的传入方式按工具合约执行，不得为了省调用次数改用 `analytics_data.get_financial_data`。
7. 财务、股本、股东、事件、技术、风险、持仓、业绩、主体财务 -> 对应领域 NL 工具
8. 专项路由无法覆盖的结构化取数 -> `analytics_data.get_financial_data`

`analytics_data` 不是复杂问句入口，也不是批量行情入口。股票行情、K 线、分钟行情、价格指标等请求只要能映射到 `stock_data` 行情工具，就必须继续使用 `stock_data`；多标的传入方式按工具合约执行，不得因为标的较多就改用 `analytics_data.get_financial_data` 兜底。只有专项工具无法覆盖剩余结构化数据，或允许的专项路径因字段 /
口径 / 无结果失败后，才可用它补取并合并结果。

不得将某次 `analytics_data.get_financial_data` 兜底成功视为 `stock_data` 行情工具不可用；后续新的股票行情、K 线、分钟行情、价格指标请求仍必须重新按路由规则优先使用 `stock_data`。

## params JSON 写法

若执行器会重复转义 JSON，使用 `@file` 可避免 JSON 本身经过 shell：

```bash
node scripts/cli.mjs call stock_data get_stock_kline @request.json
```

`request.json` 必须是 UTF-8 编码的 JSON object；路径含空格时只需给整个 `@路径` 加 shell 引号。内联参数继续按下表执行。

调用前先确认命令最终交给哪种 shell / 执行器，按下表写 `<params_json>` 的引号；同一会话锁定一种写法，命中 `INVALID_PARAMS_JSON` 前不改写。

| 执行路径 | `<params_json>` 写法 |
| --- | --- |
| Bash / zsh / sh / Git Bash / WSL | `'{"windcode":"600519.SH"}'` |
| Windows PowerShell | `'{\"windcode\":\"600519.SH\"}'` |
| cmd.exe | `"{\"windcode\":\"600519.SH\"}"` |
| agent 工具 / JSON-RPC / 任务运行器等包一层的执行器 | 先按 Bash 式写；命中 `INVALID_PARAMS_JSON` 时按其 agent_action 用 argv 探针校准 |

判断标准只有一个：第三参数必须能被 Node 作为一个 argv 读取；普通值直接 `JSON.parse`，以 `@` 开头时读取其余部分指定的 UTF-8 文件再 `JSON.parse`。不要凭屏幕显示判断转义对错。

## 资源导航

| 读取或运行                       | 何时                                                                     | 权威于                           |
| -------------------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| `references/contracts/tool-index.json` | **MUST**：选定 `server_type` 后查一次，只取当前服务的 `contract_ref` | 服务到契约文件的导航 |
| `references/contracts/parameter-conventions.md` | **MUST**：构造参数前读一次 | 跨服务统一字段和值规则 |
| `references/contracts/*.md` | **MUST**：只读索引指向的一个服务文件 | 当前服务工具字段、场景、示例 |
| `references/tool-validation-rules.json` | MAY：更新工具参数校验时                                           | CLI 本地参数校验规则             |
| `references/indicators.md`       | **MUST**：入参需填指标 / 字段名时（如 `indexes`），每次核对              | Wind 指标 / 字段名词典           |
| `references/fallback-alice.md`   | MAY：判定可切 `wind-alice` 后                                            | wind-alice 最终兜底流程          |

引用优先级：CLI stdout 的 `error.code` / `error.details` / `error.retry` / `error.correction` 是当前失败的直接指令；
业务参数以公共参数约定、索引指向的当前服务契约和 `references/indicators.md` 为准；命令传递写法见「params JSON 写法」表。
不同 reference 看似冲突时，停止重试并说明文档不一致，不得自行选择更方便的解释。

## 失败与回答

失败处理遵循门禁 7：先按 `error.circuit_breaker` 熔断剩余批量调用，再按 `error.details` / `error.retry` / `error.correction` 执行。这些字段已内联诊断、期望值、允许修改项和重试策略，不需要查阅其它错误文档；`agent_action` 仅作兼容性摘要。
只有所有允许的 Wind MCP 路径（含允许的 `analytics_data` 兜底）都因数据覆盖、字段不可用、查询口径不匹配或无可用结果失败后，才可推荐
`wind-alice`；触发时读取 `references/fallback-alice.md` 并先问用户。

不得因以下错误使用 analytics 兜底或 wind-alice：认证、额度、网络、后端不可用、命令传递、路由错误。

回答遵循门禁 8：只返回 Wind 实际数据。若数据时效、缺失字段、报告期滞后、无结果或口径限制会
影响解释，必须说明。成功返回数据时末尾附上：

> 数据来源于万得 Wind 金融数据服务。

### 完成状态

- `DONE`：Wind 工具成功返回结果，并已标注数据来源。
- `DONE_WITH_LIMITS`：成功返回部分结果，但存在字段缺失、报告期滞后、口径限制或部分无数据。
- `NO_RESULTS`：Wind 返回无结果，且已说明尝试路径和可调整方向。
- `BLOCKED_KEY`：Key 缺失或无效。
- `BLOCKED_QUOTA`：额度、余额或限流阻塞继续。
- `BLOCKED_RUNTIME`：网络、后端、CLI 或命令传递错误阻塞继续。
- `OUT_OF_SCOPE`：用户请求不属于 Wind MCP 支持范围。
