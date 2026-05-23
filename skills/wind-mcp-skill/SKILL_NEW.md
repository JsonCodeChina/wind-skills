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

# Wind 万得金融数据

使用本 skill 通过 Wind MCP 工具获取金融数据。流程必须停留在 Wind
支持的路径内：先判定路由，再校验工具契约，然后调用 CLI，最后返回结果并标注 Wind 数据来源。

## 适用范围

### 支持的数据

| server_type | 覆盖范围 | 路由要点 |
| --- | --- | --- |
| `stock_data` | A 股 | 行情快照 / K 线 / 分钟行情 + 档案 / 财务 / 股东 / 事件 / 技术 / 风险 |
| `global_stock_data` | 港股 / 美股 | 与 `stock_data` 同结构，工具名带 `global_` 前缀 |
| `fund_data` | 基金 / ETF / LOF | 行情 + 档案 / 财务 / 持仓 / 业绩 / 持有人 / 管理公司 |
| `index_data` | 指数 / 板块 | 行情 + 档案 / 基本面 / 技术 |
| `bond_data` | 债券 | 仅 NL 工具；债券档案 / 发债主体 / 行情估值 / 主体财务 |
| `financial_docs` | 公告 / 财经新闻 | 公告 RAG + 新闻 RAG |
| `economic_data` | 宏观 / 行业指标 | EDB 指标查询 |
| `analytics_data` | 通用结构化取数 | 只在专项路由无法覆盖时兜底 |

以下场景不使用本 skill：

- 欧股、日股或其它未覆盖市场。
- 汇率、期货盘口、加密货币或非金融数据。
- 用 Web Search 绕过 Wind 路由、参数错误、Key、权限、限流或网络问题。

数据时效：

- 行情快照和分钟行情是当日准实时数据。
- K 线是收盘历史序列。
- 财务和档案通常来自最近一期定期报告。
- `WIND_API_KEY` 有日调用额度。

## 硬门禁

- 构造参数或调用工具前，必须先完成路由判定。
- 调用前必须按工具契约和 `references/tool-manifest.json` 校验
  `server_type + tool_name`。
- 调用任何 `*_price_indicators` 前，必须读取 `references/indicators.md`，
  并逐个核对 `indexes` 的中文字段名完全一致。
- 在 Codex 中调用 Wind 后端命令时，必须使用
  `sandbox_permissions: "require_escalated"`；这是工具调用参数，不是 shell 参数。
- 调用 Wind CLI 时，必须在本 skill 目录下执行；优先把命令工作目录设为
  `<skill_dir>`，再使用 `node scripts/cli.mjs ...`。
- CLI 返回 `KEY_MISSING` 时，必须先用 AskUserQuestion 让用户选择由 agent 打开
  开发者中心，还是由用户自行获取 Key；不得未经确认直接执行 `open-portal`。
- 本 skill 禁止用 Web Search 兜底。

## 输入与上下文

只收集路由和调用所需的上下文：

1. 判定用户意图：文档、宏观指标、行情时序、专项业务 NL，或不支持 / 兜底场景。
2. 判定标的类型和市场：A 股、港股、美股、基金、ETF / LOF、指数 / 板块、债券、
   文档或宏观指标。
3. NL 字段保留用户原始问题；调用时自然语言字段值不得包含空格。
4. 只有必填信息无法安全推断时才提问，例如简称歧义或缺少必填日期范围。

简称或别名可能映射到多个标的时，必须先问用户指的是哪一个。例如遇到 `茅台`
时，不得静默选择其中一只。

## 工作流

按以下顺序执行。

### 阶段 1：路由

按固定顺序判定路由：

1. **文档优先**：
   - 新闻、媒体、快讯、报道、评论、消息 -> `financial_docs.get_financial_news`
   - 公告、年报、半年报、季报、招股书、监管披露 -> `financial_docs.get_company_announcements`
2. **宏观指标**：
   - GDP / CPI / PPI / PMI / 社融 / 利率 / 失业率 / 进出口等 -> `economic_data.get_economic_data`
3. **行情快照与时序**：
   - 最新价、涨跌幅、成交量、K 线、分钟线、日内走势等 -> 从 `stock_data`、
     `global_stock_data`、`fund_data`、`index_data` 中选择匹配市场的行情工具
4. **专项业务 NL**：
   - 财务、股本、股东、事件、技术、风险、持仓、业绩、主体财务等 -> 选择对应领域
     server 的 NL 工具
5. **结构化取数兜底**：
   - 只有前四类路由都无法覆盖时 -> `analytics_data.get_financial_data`

`analytics_data` 不得抢占已明确的专项路由。每个用户问题先确定一个主路由，再处理重试或兜底。

### 阶段 2：选择工具和参数

1. 读取 `references/tool-contracts.md` 中对应工具的契约段落。
2. 使用正确的自然语言字段名：
   - 领域 NL 工具和 `analytics_data` 使用 `question`
   - `financial_docs` 使用 `query`
   - `economic_data` 使用 `metricIdsStr`
3. 需要核对合法工具清单时，读取 `references/tool-manifest.json`。
4. 涉及行业筛选或行业分类时，用户未明确指定分类体系则默认使用 Wind 行业分类。

### 阶段 3：调用前校验

调用前逐字段检查：

- 字段名、必填项、类型、日期格式和枚举值必须符合所选工具契约。
- K 线调用必须同时包含 `begin_date` 和 `end_date`。
- 分钟行情调用使用 `begin` / `end`，不是 `begin_date` / `end_date`。
- EDB 调用使用 `beginDate` / `endDate`。
- `aftime` 只能是 `"0"` 或 `"1"`。
- A 股使用 `stock_data`；港股 / 美股使用 `global_stock_data`。
- 单次工具调用只放一个标的；对比场景拆成多次调用后合并结果。

### 阶段 4：调用 CLI

命令必须在本 skill 目录下执行。优先把命令工作目录设为 `<skill_dir>`，
再使用相对脚本路径；不要在任意工作目录下只靠绝对脚本路径调用。

```bash
node scripts/cli.mjs call <server_type> <tool_name> '<params_json>'
```

如果调用工具只能指定 shell 命令而不能指定工作目录，先切到 `<skill_dir>`
再执行上述命令。

CLI 契约：

- 成功：exit code 为 `0`；stdout 直接输出数据结果，不包 envelope。
- 失败：exit code 非 `0`；stdout 输出
  `{ ok: false, error: { code, agent_action } }`。
- 成功和失败都只解析 stdout。stderr 只承载内部日志和更新提示。
- stderr 出现更新提示时，简短转述即可，不改变主结果判定。

Shell 引号和转义错误常导致 `INVALID_PARAMS_JSON`。此时只修 JSON 引号或转义，
并重试同一组 `server_type + tool_name`，不得换路由掩盖转义问题。

### 阶段 5：回答

返回用户请求的数据。若数据时效、缺失字段或口径限制会影响解释，必须说明，并在末尾附上：

> 数据来源于万得 Wind 金融数据服务。

## 决策规则

| 场景 | 动作 |
| --- | --- |
| 用户要公告、年报、招股书或监管披露 | 使用 `financial_docs.get_company_announcements` |
| 用户要最新财经新闻或政策新闻 | 使用 `financial_docs.get_financial_news` |
| 用户要宏观或行业 EDB 指标 | 使用 `economic_data.get_economic_data` |
| 用户要最新价或单时点行情字段 | 使用匹配的 `*_price_indicators` 工具 |
| 用户要日 / 周 / 月行情历史序列 | 使用匹配的 `*_kline` 工具 |
| 用户要日内走势或分钟级数据 | 使用匹配的 `*_quote` 工具 |
| 用户要股票 / 基金 / 指数 / 债券业务明细 | 使用匹配领域的 NL 工具 |
| 用户要债券快照或估值 | 使用 `bond_data.get_bond_market_data`；`bond_data` 没有 quote 工具 |
| 专项路由无法覆盖结构化取数任务 | 完成路由核对后才可使用 `analytics_data.get_financial_data` |
| 用户对比多个标的 | 每次工具调用只查一个标的，之后合并结果 |

## 工具与资源

以下资源是本 skill 的权威依据：

- 运行 `scripts/cli.mjs` 调用 Wind MCP 工具、打开开发者中心并配置 Key。
- 读取 `references/tool-manifest.json` 确认合法的
  `server_type + tool_name` 组合。
- 选定路由后读取 `references/tool-contracts.md` 的对应段落，按详细参数契约构造请求。
- 每次调用行情快照指标工具前读取 `references/indicators.md`。
- 处理 CLI 失败或需要完整错误动作上下文时，读取 `references/error-codes.json`。
- 需要手写 shell 调用、当前 shell 转义不确定，或命中 `INVALID_PARAMS_JSON` 时，
  读取 `references/shell-escaping.md`。
- 达到 wind-alice 最终兜底条件时，读取 `references/fallback-alice.md`。

Wind 后端调用建议申请以下 Codex `prefix_rule`：

```json
["node", "<skill_dir>/scripts/cli.mjs", "call"]
```

## 工具契约摘要

主文件只保留签名边界，具体字段、工具表、常用指标候选和调用示例统一读取
`references/tool-contracts.md` 的对应段落。

| 工具组 | 入参 | 不能混用的字段 |
| --- | --- | --- |
| 行情类 | `{windcode, ...}` | 快照用 `indexes`；K 线用 `begin_date` / `end_date`；分钟行情用 `begin` / `end` |
| 专项 NL | `{question, lang?}` | 不要把 `question` 写成 `query` |
| 文档 RAG | `{query, top_k?}` | 不要把 `query` 写成 `question` |
| 宏观 EDB | `{metricIdsStr, ...}` | `metricIdsStr` 是自然语言指标查询，不是指标 ID |
| 通用结构化取数 | `{question, lang?}` | 只在专项路由无法覆盖时使用 |

约束：

- 选定路由后，必须先读 `references/tool-contracts.md` 再构造最终参数。
- 行情快照调用还必须再读 `references/indicators.md` 并逐字段核对 `indexes`。
- 债券没有行情快照工具；债券行情和估值请求走 `bond_data` NL 工具。
- `analytics_data` 首次调用必须传用户原始问句去空格后的文本，详细改写和拆分规则
  见 `references/tool-contracts.md`。

## 输出契约

输出：

- 用户请求的 Wind 结果，或多次 Wind 调用后的简洁综合。
- 会改变解释的限制，例如报告期滞后、字段覆盖不足、无结果或兜底失败。
- 数据来源标注：

> 数据来源于万得 Wind 金融数据服务。

不得展示工具未支持的精度。若工具没有返回用户要的字段或路由，必须说明限制。

## 校验

每次调用前：

1. 确认已按固定路由顺序判定。
2. 确认工具名和参数匹配所选 server。
3. 确认自然语言字段名没有混用：
   `question`、`query`、`metricIdsStr` 不可互相替换。
4. 确认自然语言字段值不含空格。
5. 使用行情快照指标工具时，确认 `indexes` 字段已从 `references/indicators.md`
   逐项核对。

结束前：

1. 确认返回值均来自 Wind 工具输出。
2. 确认不支持的路由没有用 Web Search 兜底。
3. 确认最终回答包含 Wind 数据来源标注。

## 失败处理

CLI exit code 非 `0` 时，读取 stdout envelope，默认按 `error.agent_action`
执行，再按 `error.code` 选择分支。

### API Key 引导

`KEY_MISSING` 是需要用户参与的分支。先说明当前查询需要
`WIND_API_KEY`，再用 AskUserQuestion 给出选项，不要静默打开页面。

AskUserQuestion 选项必须包含：

| 选项 | 含义 |
| --- | --- |
| 由 agent 打开开发者中心 | 用户同意后执行 `open-portal`，用户登录并取回 Key |
| 用户自行获取 Key | 不执行 `open-portal`，等待用户自行获取 Key 后发回当前会话 |

若当前宿主没有 AskUserQuestion，直接用同样两个选项向用户提问并等待选择。

按用户选择继续：

1. 用户选择由 agent 打开页面时，才执行
   `node <skill_dir>/scripts/cli.mjs open-portal`。成功后读取 stdout 中的
   `url` / `flow_note`，简要说明页面已打开以及下一步需要用户提供 Key。
2. 用户选择自行获取时，不执行 `open-portal`。引导用户登录 Wind 开发者中心获取
   `WIND_API_KEY`，拿到后发回当前会话。
3. 用户发来 Key 后，询问或沿用用户已声明的配置范围：
   - `global`：后续可在其它 Wind skill 调用中复用。
   - `skill`：仅配置到当前 skill 范围。
4. 执行 `node <skill_dir>/scripts/cli.mjs setup-key <KEY> --scope <global|skill>`，
   然后重试触发 `KEY_MISSING` 的原调用。

| Code | 动作 |
| --- | --- |
| `KEY_MISSING` | 进入上方 API Key 引导；先用 AskUserQuestion 让用户选择由 agent 打开开发者中心或自行获取 Key，再配置并重试原调用 |
| `KEY_INVALID` / `KEY_FORBIDDEN_SERVER` | 修复 Key 有效性或权限，不得换工具或换 server 绕过 |
| `RATE_LIMIT_DAILY` / `BALANCE_INSUFFICIENT` | 等额度刷新或使用有效 Key，不得改路由绕过 |
| `RATE_LIMIT_QPS` / `NETWORK_ERROR` / `SERVER_5XX` | 等 3-5 秒后原样重试同一请求 |
| `INVALID_PARAMS_JSON` | 修复 JSON 或 shell 转义后重试同一路由 |
| `UNKNOWN_TOOL_NAME` / `UNKNOWN_SERVER_TYPE` | 重新核对 manifest 并选择合法组合 |
| `PARAM_VALIDATION_ERROR` | 按 `references/tool-contracts.md` 和 `references/indicators.md` 修字段；结构化专项路由修复仍失败后才可用 analytics |
| `NO_RESULTS` | 调整检索关键词；专项结构化路由没有可用结果时才可用 analytics |
| `RESPONSE_PARSE_ERROR` / `MCP_PROTOCOL_ERROR` / `TOOL_RUNTIME_ERROR` / `UNKNOWN` | 保留原始细节；只有本地修正点明确时才重试，否则停止并报告 |

用户已选择由 agent 打开页面，但遇到 `OPEN_PORTAL_FAILED` 时，把 `agent_action`
内嵌的 URL 发给用户手动打开。

Key、权限、额度、余额、网络、后端 5xx 和 JSON 转义错误都不是数据覆盖失败。
不得通过切换 server、改用 `analytics_data`、切到 wind-alice 或 Web Search 绕过。

### 最终兜底：wind-alice

只有所有允许的 wind-mcp-skill 路径，包括允许的 `analytics_data` 兜底，
都因数据覆盖、字段不可用、查询口径不匹配或无可用结果失败后，才可推荐 `wind-alice`。
触发时读取 `references/fallback-alice.md` 并按其中流程执行。

- Key、权限、额度、余额、网络、后端 5xx、JSON 转义、未知 server 或未知 tool
  错误不得推荐 wind-alice。
- 必须确认客户端环境能加载 `wind-alice`；仓库中存在源码不等于已安装。
- 已安装时，切换前必须先问用户。除非用户明确点名 Alice 子 skill，否则将用户原始问题
  原封不动作为 wind-alice prompt。
- 未安装时，说明必须先安装才能使用该兜底路径。
- 用户拒绝后，停止继续 fallback，并返回已尝试的 Wind 路径和失败摘要。

## 重要规则

- 先路由，再构造参数。
- `analytics_data` 是兜底，不是绕开领域工具的捷径。
- `references/indicators.md` 是行情快照 `indexes` 的唯一权威清单。
- 自然语言文本字段在调用时不得包含空格。
- Wind CLI 命令必须在本 skill 目录执行；优先设置命令工作目录，不要依赖任意
  当前目录下的脚本路径解析。
- 单次工具调用只查一个标的；对比场景合并多次调用结果。
- 用户未明确要求其它行业体系时，默认使用 Wind 行业分类。
- 成功返回数据时，末尾必须包含 Wind 数据来源标注。
