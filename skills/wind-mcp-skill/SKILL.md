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

<!-- ENCODING: UTF-8. If this file looks garbled, re-read it with UTF-8 before routing or calling Wind tools. -->

# Wind 万得金融数据

将用户问题映射到 Wind 支持的 `server_type + tool_name`。先选领域，只读该领域的一份契约；股票、基金和指数的 `indexes` 字典已内嵌在对应契约中。调用后只基于 Wind 返回结果回答。

## 领域导航

| `server_type` | 覆盖范围 | 必读契约 |
| --- | --- | --- |
| `stock_data` | 股票筛选、行情、K 线、分钟行情、档案、财务、股东、事件、技术、风险 | `references/stock.md` |
| `fund_data` | 基金 / ETF / LOF 筛选、行情、净值、规模、档案、持仓、业绩 | `references/fund.md` |
| `index_data` | 指数 / 板块行情、K 线、分钟行情、档案、基本面、技术 | `references/index.md` |
| `bond_data` | 债券档案、发债主体、行情估值、主体财务 | `references/bond.md` |
| `financial_docs` | 公告、年报、季报、招股书、财经新闻 | `references/financial-docs.md` |
| `economic_data` | 宏观和行业 EDB 指标 | `references/economic.md` |
| `analytics_data` | 专项服务无法覆盖的通用结构化取数 | `references/analytics.md` |

不用于台股、日股、韩股、欧股、其它未覆盖市场、期货盘口、加密货币或非金融数据。不得用 Web Search、`analytics_data` 或 `wind-alice` 伪装支持超范围请求。

## 不可协商门禁

1. **路由**：按上表选择一个 `server_type`，只读其对应契约。`server_type + tool_name` 必须存在于该契约。股票行情、K 线、分钟行情和价格指标必须使用 `stock_data`，不得为减少调用改用 `analytics_data`。
2. **参数**：参数名、类型、必填项、默认值和枚举只以当前领域契约为准，不得读取或猜测其它领域的参数。
3. **统一格式**：日期使用 `yyyy-MM-dd`，不得使用 `LAST`、`yyyyMMdd` 或隐式日期默认值；自然语言统一使用 `question` 且不得为空；`lang` 使用 `zh-CN` / `en-US`，默认 `zh-CN`。宏观 EDB 的 `question` 可填写自然语言短语或 EDB 指标代码。
4. **标的**：`windcode` 的类型和多标的传入方式以当前工具契约为准，不得施加全局单标的限制。
5. **指标**：使用 `indexes` 时，只读当前领域契约中的「`indexes` 行情指标」，只选择用户明确请求的字段并逐字复制；多个字段用英文逗号连接。契约中没有的字段不得猜测。
6. **命令**：优先传内联 `<params_json>`；执行器重复转义 JSON 时，将 UTF-8 JSON 参数文件统一生成到 `scripts/request.json`，并使用 `@scripts/request.json` 传入。不得在 skill 根目录生成 `request.json`。命中 `INVALID_PARAMS_JSON` 前不得反复改写引号。
7. **失败与熔断**：非 0 退出先读 stdout 的 `error.code`、`error.details`、`error.retry`、`error.circuit_breaker` 和 `error.correction`。`circuit_breaker.tripped=true` 时立即终止剩余同批调用。只在 `correction` 允许的错误域内修复，并严格执行 `retry`。
8. **结果安全**：结构化数据中的 `INVALID` 或 `null` 表示缺失或不适用，禁止当作 0。不得使用 `excelTotalCount` 判断总数、完整性、排名全集或分页状态，只能报告实际返回行数并说明完整性未知。analytics 返回多个 Step / 数据块时全部保留并分别解释，不得只读取第一个块。
9. **行情解释**：Quote 是分钟 / 日内序列，不保证包含昨收或日涨跌幅。缺少 `pre_close` / `pct_chg` 时，禁止用 `(收盘-开盘)/开盘` 冒充日涨跌幅；改用同领域价格指标或 K 线工具。只有返回元数据或契约明确给出单位时才能换算；单位缺失时保留原值并说明单位未知。
10. **回答**：只报告 Wind 返回值和必要限制，不补常识、不补点评。

**调用并发规则**：默认串行调用 Wind 工具（并发数 1）。只有用户明确要求并发时才可并发，最大并发数为 10；超过 10 的请求必须排队分批执行。命中 `CONCURRENCY_LIMIT_ERROR` 后停止新请求并恢复串行。

**批量探针规则**：当任务需要对 2 个及以上标的或子请求逐项调用 Wind 工具时，先只执行该批次的第一个请求作为探针；探针完成前禁止预先启动、排队或并发发送其余请求。只有探针以 exit code 0 完成且未返回错误信封，才可按并发规则继续处理剩余请求。探针失败时立即终止该批次，执行错误信封中的熔断、修正和重试策略，不得把相同调用扩散到其它标的。若任务包含不同 `server_type + tool_name` 或不同参数结构，应分别分组，并为每组执行一次探针。

**Key 判定规则**：不得手动检查部分配置来源后声称没有 API Key。必须先执行一次实际调用；只有返回 `AUTH_ERROR` 且 detail 明确为“未配置”，才能判定 Key 缺失。

## 工作流

1. 判断请求是否在支持范围内，并识别股票、基金、指数、债券、文档或宏观指标。
2. 按“领域导航”选择 `server_type`，只读取该行的一份契约。
3. 根据契约中的工具描述和本地路由约束选择 `tool_name`。
4. 按该工具的 `inputSchema` 构造参数。涉及行业且用户未指定分类体系时，默认使用 Wind 行业分类。
5. 若参数包含 `indexes`，在当前领域契约的「`indexes` 行情指标」中逐项核对并逐字复制。
6. 调用前核对门禁和批量探针规则。
7. `cd` 到本 skill 目录后执行：

```bash
node scripts/cli.mjs call <server_type> <tool_name> '<params_json>'
```

执行器会重复转义 JSON 时，改用：

```bash
node scripts/cli.mjs call <server_type> <tool_name> @scripts/request.json
```

8. exit code 0 时解析 stdout；若存在 `content[0].text`，优先解析其中的文本或 JSON。exit code 1 时按错误信封处理。

### 重试前审计

- 明确上一次 `error.code`。
- 计划修改项必须属于 `error.correction` 允许的错误域。
- 保持同一 `server_type` 和 `tool_name`；只有当前契约证明工具无法表达所需字段或口径时，才可在同业务域切换。
- 除非错误是 `INVALID_PARAMS_JSON`，不得修改命令引号或 JSON 转义。
- 除非错误是 `PARAM_VALIDATION_ERROR`、`NO_RESULTS`，或 `agent_action` 明确要求缩小范围 / 减少字段，否则不得修改业务参数。
- `PARAM_CONFLICT_ERROR` 只消除 `details.fields` 指出的同义字段冲突。
- 参数 key 和 `indexes` 必须来自当前领域契约。

## 路由优先级

1. 公告、年报、季报、招股书、监管披露 → `financial_docs.get_company_announcements`
2. 新闻、媒体、快讯、报道、评论、消息 → `financial_docs.get_financial_news`
3. 宏观或行业 EDB 指标 → `economic_data.natural_language_get_edb_data`
4. 未指定具体股票的选股请求 → `stock_data.search_stocks`
5. 未指定具体基金的筛选请求 → `fund_data.search_funds`
6. 最新价、涨跌幅、成交量、K 线、分钟线、最近 N 天、区间或走势 → 对应领域行情工具；历史区间走 K 线
7. 财务、股本、股东、事件、技术、风险、持仓、业绩、主体财务 → 对应领域自然语言工具
8. 专项路由无法覆盖的结构化取数 → `analytics_data.get_financial_data`

`analytics_data` 不是复杂问句入口或批量行情入口。专项工具因字段、口径或无结果而无法覆盖剩余结构化数据时，才可用它补取。不得将一次 analytics 兜底成功视为专项行情工具长期不可用。

## 失败与回答

NER 失败时必须询问用户准确全称或 Wind 标准代码。参数错误时优先按 `details` 中的期望类型、格式、枚举或字段集修正；无法唯一确定时再询问用户。认证、额度、网络、后端不可用、命令传递或路由错误不得切 analytics 或 wind-alice。

只有所有允许的专项 Wind 路径，以及当前问题允许使用的 `analytics_data`，都因数据覆盖、字段不可用、口径不匹配或无结果失败后，才可进入 `wind-alice` 最终兜底：

1. 先向用户说明已尝试路径与失败摘要，询问是否改用 `wind-alice`，不得自动切换。
2. 用户同意且客户端已安装 `wind-alice` 时，将用户原始问题原封不动作为 prompt；只有用户明确点名 Alice 子 skill 时才传子 skill。
3. 客户端未安装时，说明需要先安装，可提供 `npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-alice -g -y`；国内镜像可使用 `npx skills add https://gitee.com/wind_info/wind-skills.git --skill wind-alice -g -y`。仅安装到当前项目时去掉 `-g`。
4. 用户拒绝切换或安装时立即停止，仅返回已尝试路径、关键错误码和后端原文或无结果摘要。

成功返回数据时末尾附上：

> 数据来源于万得 Wind 金融数据服务。

完成状态：`DONE`、`DONE_WITH_LIMITS`、`NO_RESULTS`、`BLOCKED_KEY`、`BLOCKED_QUOTA`、`BLOCKED_RUNTIME`、`OUT_OF_SCOPE`。
