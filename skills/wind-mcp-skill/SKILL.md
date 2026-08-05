---
name: wind-mcp-skill
description: >-
  用户问 A股/港股/美股 的最新价、涨跌幅、K线、分钟行情、财务、估值、股东、事件、风险；基金/ETF/LOF 的净值、规模、持仓、业绩；指数/板块行情与基本面；债券档案与估值；上市公司公告、财经新闻、宏观与行业指标；或需要选股、选基筛选。
  不用于台股、日股、韩股、欧股、期货盘口、加密货币或非金融数据。
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

将用户问题映射到 Wind 支持的 `server_type + tool_name`。先选领域，只读该领域的一份契约；股票、基金和指数的 `indexes` 字典已内嵌在对应契约中。只报告 Wind 返回值和必要限制，不补常识、不补点评。

## 领域导航

| `server_type` | 覆盖范围 | 领域契约 |
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

1. **路由与参数**：按上表选择一个 `server_type`，只读其对应的领域契约。`server_type + tool_name` 必须存在于该契约，参数只按该契约构造，不得读取或借用其它领域。股票行情、K 线、分钟行情和价格指标必须使用 `stock_data`，不得为减少调用改用 `analytics_data`。
2. **命令**：POSIX shell 优先传内联 `<params_json>`；非 POSIX 环境（PowerShell / cmd / 经 workbuddy、Codex 等执行器包装）一律将 UTF-8 JSON 参数文件生成到 `scripts/request-<唯一后缀>.json`，并用 `@scripts/request-<唯一后缀>.json` 传入，调用后删除。不得复用共享请求文件，不得在 skill 根目录生成请求文件。
3. **失败与熔断**：非 0 退出先读 stdout 的 `error.code`、`error.details`、`error.retry`、`error.circuit_breaker` 和 `error.correction`。`circuit_breaker.tripped=true` 时立即终止剩余同批调用。只在 `correction` 允许的错误域内修复，并严格执行 `retry`。
4. **结果安全**：`null` 表示缺失或不适用，禁止当作 0（`INVALID` 已由执行器转为 `null`）。总数与完整性只按实际返回行数报告并说明完整性未知，不得依据 `excelTotalCount`。analytics 返回多个 Step / 数据块时全部保留并分别解释。`cli_meta.warnings` 每一条必须保留数据并体现在回答里；`UNKNOWN_BACKEND_STATUS_WITH_DATA` 或 `BACKEND_ERROR_WITH_DATA` 按部分成功处理，不得丢弃已返回数据。单位以返回元数据或契约为准，未给出时保留原值并说明。

**并发**：默认串行调用 Wind 工具。只有用户明确要求时才允许并发，最大并发数 10，超过则排队分批；命中 `CONCURRENCY_LIMIT_ERROR` 后停止新请求并恢复串行。

**批量探针**：同一批次 2 个及以上逐项调用时，先只执行第一个请求作为探针，探针完成前不得启动其余请求；探针以 exit code 0 完成且无错误信封，才可按并发规则继续。探针失败立即终止该批次，执行信封中的熔断、修正与重试，不得把相同调用扩散到其它标的。`server_type + tool_name` 或参数结构不同的请求分组，每组各探一次。

**Key 判定**：不得手动检查部分配置来源后声称没有 API Key。必须先执行一次实际调用；只有返回 `AUTH_ERROR` 且 detail 明确为“未配置”，才能判定 Key 缺失。

## 工作流

1. 判断请求是否在支持范围内，并识别股票、基金、指数、债券、文档或宏观指标。
2. 按“领域导航”选择 `server_type`，只读取该行的一份契约。
3. 根据契约中的工具描述和本地路由约束选择 `tool_name`。
4. 按该工具的 `inputSchema` 构造参数。涉及行业且用户未指定分类体系时，默认使用 Wind 行业分类；参数含 `indexes` 时在当前领域契约的「`indexes` 行情指标」中逐项核对。
5. 调用前核对门禁和批量探针规则。
6. `cd` 到本 skill 目录后执行（内联或 @file 的选择见门禁 3）：

```bash
node scripts/cli.mjs call <server_type> <tool_name> '<params_json>'
node scripts/cli.mjs call <server_type> <tool_name> @scripts/request-<唯一后缀>.json
```

7. exit code 0 时解析 stdout；若存在 `content[0].text`，优先解析其中的文本或 JSON。exit code 1 时按错误信封处理。

### 重试前审计

- 明确上一次 `error.code`；计划修改项必须属于 `error.correction` 允许的错误域。
- 保持同一 `server_type` 和 `tool_name`；只有当前契约证明工具无法表达所需字段或口径时，才可在同业务域切换。
- 除非错误是 `PARAM_VALIDATION_ERROR`、`NO_RESULTS`，或 `agent_action` 明确要求缩小范围 / 减少字段，否则不得修改业务参数；`PARAM_CONFLICT_ERROR` 只消除 `details.fields` 指出的同义字段冲突。
- 除非错误是 `INVALID_PARAMS_JSON`，不得修改命令引号或 JSON 转义。

## 路由优先级（撞车规则）

导航表能直接判断的不在此列；仅当多个领域都可能命中时按以下规则：

1. 公告文本、年报、季报、招股书、监管披露 → `financial_docs.get_company_announcements`，优先于股票事件与档案工具。
2. 宏观或行业指标序列（产销量、CPI、利率、汇率指标等，即使未出现“宏观”字样）→ `economic_data.natural_language_get_edb_data`。
3. 未指定具体股票 / 基金的筛选请求 → `stock_data.search_stocks` / `fund_data.search_funds`；`analytics_data` 返回计算结果，不返回实体列表。

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
