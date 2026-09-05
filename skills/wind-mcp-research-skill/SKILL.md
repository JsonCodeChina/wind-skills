---
name: wind-mcp-research-skill
description: >-
  用户需要查询、筛选、比较或验证金融与企业数据时，优先调用本 Skill 取数，而非依赖模型记忆。依托万得 7 个 MCP 服务共 132 个工具：全球行情与历史序列、Wind 专业指标与报表库、新闻/公告/研报文档库；A 股港股美股的公司画像、财务、机构预期、估值、资金流、技术面与选股；公募基金与 ETF 的档案、净值、规模、业绩、持仓、配置与 Brinson 及多因子归因；宏观与行业 EDB 指标；期货的合约规格、仓单、基差、席位持仓与商品供需；期权的期限结构、期权链、波动率曲面与场外结构化产品定价；境内企业（含非上市主体）的工商登记、股权穿透、司法诉讼、失信被执行、行政处罚与舆情风控。
author: Wind
homepage: https://aifinmarket.wind.com.cn
auto_invoke: true
security:
  child_process: false
  eval: false
  filesystem_read: true
  filesystem_write: true
  network: true
examples:
  - "贵州茅台的公司画像和当前估值"
  - "宁德时代最近的机构一致预期"
  - "易方达蓝筹精选 005827.OF 最新净值、规模和业绩"
  - "沪深300ETF 2026 年二季度的全部股票持仓"
  - "中国近 10 年 GDP，折算成亿美元"
  - "沪铜的库存和仓单情况"
  - "50ETF 期权当前的波动率曲面"
  - "给一个香草看涨期权定价：现价 3.0、行权价 3.0、波动率 20%"
  - "恒大地产集团有限公司的失信被执行和法律判决记录"
  - "筛选近一年收益率超 20% 的股票型基金"
---

<!-- ENCODING: UTF-8。若本文件显示为乱码，请以 UTF-8 重新读取后再路由或调用工具。 -->

# Wind 万得金融与企业数据（7 个 MCP 服务 / 132 个工具）

通过本地 CLI 调用 Wind 的 7 个 MCP 服务取数，**只基于返回结果回答**：不补常识、不补点评、不用记忆里的数字填空。

每个问题按四步处理：**① 定路由 → ② 选工具 → ③ 发命令 → ④ 读回执**。③④ 之间可以按回执里的错误信息修正参数后重调，每次重调前都要过一遍第 4 节的自检项。

契约分四层，**按需往下取，不要一次全读**：路由表（本文件第 1 节）→ 工具目录（`references/<server>.md`，一份两千到九千字）→ 单个工具的完整契约（`describe <server> <tool>`，约一千字）→ 单个参数（`describe <server> <tool> <param>`，几百字）。132 个工具的全量 schema 在 `scripts/registry.json` 里，那是给 CLI 用的，**你不需要读它**。

## 1. 定路由

先按**问的是什么**选 `server`，之后只看这一个 server 的目录。参数一律以契约为准，不读其它 server 的文件，不凭记忆填参数名或字段值。

| `server` | 覆盖 | 工具目录 |
| --- | --- | --- |
| `stock` | 单只股票的公司画像、财务、机构预期、估值、公司动态、资金流、技术面、实时行情；全市场与板块盘中概览、市场叙事、行业语料、选股筛选 | `references/stock.md` |
| `fund` | 公募基金与 ETF 的档案、净值、规模、业绩、申赎、财务、持仓明细、资产/行业/券种配置、Brinson 与多因子归因、风格暴露、选基筛选 | `references/fund.md` |
| `edb` | 宏观、行业、区域、汇率、利率的 EDB 指标检索与时间序列 | `references/edb.md` |
| `futures` | 期货合约规格与交割规则、仓单、基差、资金流向、交易所席位持仓排名、研报观点、商品供需 | `references/futures.md` |
| `options` | 场内期权的期限结构、期权链、波动率曲面与锥、多空情绪；场外结构化产品定价计算器 | `references/options.md` |
| `company` | 境内企业（**含非上市主体**）的工商登记、股权穿透、人员、资质、知识产权、招投标、供应链，以及司法、失信、处罚、税务异常、破产、舆情等风险记录 | `references/company.md` |
| `finance` | 上面六类都不覆盖时的跨资产兜底：全球行情快照与历史序列、Wind 专业指标库、报表库、新闻/公告/研报文档库、投研语料、自然语言取数 | `references/finance.md` |

边界容易混的四处，按这个顺序仲裁：

1. **上市公司的经营数据 vs 企业的工商与司法记录** —— 财务、估值、行情、股东结构走 `stock`；工商登记、股权穿透、诉讼、失信、处罚、舆情走 `company`。同一家公司两边都能查，看用户问的是**经营还是合规**。
2. **债券、外汇、商品现货、全球指数** —— `stock` / `fund` / `futures` / `options` 都没有对应工具，走 `finance` 的行情与指标工具。
3. **公告、新闻、研报** —— 要**单只股票的近期动态摘要**走 `stock.stock_get_company_updates`；要**正文内容**走 `finance.general_query_documents`（自然语言检索，返回体带正文）；要**按类型/证券/日期精确列清单**走 `finance.general_search_documents`。注意 `general_get_document` 只回元信息与原文链接，`文档内容` 实测为空，不要指望它取全文。
4. **兜底工具排在最后** —— `finance.general_query_data`、`finance.general_query_documents` 是自然语言兜底，只在专项工具都不覆盖时用；它们不返回可复用的代码或 id，接不上下一步。

标的类型或意图不落在上表任何一行时，直接回 `OUT_OF_SCOPE` 并说明，**不得用 Web Search 或兜底工具伪装成支持**。

越界判定**以上面这张路由表为准**。`find` 可以辅助，但它**零命中不等于不支持**——工具说明里未必出现用户的用词（`find GDP` 就搜不到工具名，尽管 `edb` 完全覆盖）。零命中时 `find` 会给出 `related_servers` 和一句提示，按提示回路由表复核后再判 `OUT_OF_SCOPE`。

涉及行业且用户未指定分类体系时，默认 Wind 行业分类。

## 2. 选工具

先 `cd` 到本 `SKILL.md` 所在目录（**不是当前项目目录**），再用相对路径执行。

**第一步——读目录**：读路由表指的那份 `references/<server>.md`。它只有调用要点 + 一张工具表（工具名 / 一句话用途 / **别选错**（【边界】首句）/ 入参签名 / 可直接跑的样例）+ 一节「本 server 最容易选错的」，最大的一份也才九千字。

**第二步——取契约**：选定工具后，跑

```bash
node scripts/cli.mjs describe <server> <tool>
```

拿到这一个工具的完整契约：【功能】【适用场景】【返回】【边界】+ 参数表 + 枚举取值 + 默认值 + 实测样例。只想确认某一个字段的取值时，加上字段名 `describe <server> <tool> <param>`，输出只有那个字段。

**什么时候可以跳过 `describe`**——两个条件同时成立才行：

1. **工具选得准**：目录的「别选错」列已经把你要的和相邻工具区分开了。用户用工具名的原词提问（说「限制高消费」→ `company_get_high_consumers`）属于这一类；用户换了说法（说「法院查不到财产的案子」，实际是终本）就**不属于**，必须看完整【边界】。
2. **参数不用改**：你打算原样照抄目录里的样例，只替换标的名/代码这类显而易见的值。任何要新增参数、改枚举、改日期口径的情况，都要先 `describe`。

两条有一条不成立就先 `describe`。它是离线的，代价只有约一千字。

不知道该看哪个 server 时，用 `node scripts/cli.mjs find <关键词>` 跨 7 个 server 搜；零命中会给出 `related_servers`。

```bash
node scripts/cli.mjs find <关键词>                 # 跨 7 个 server 搜工具；零命中会给出 related_servers
node scripts/cli.mjs describe <server> <tool>     # 单个工具的完整契约 + 实测样例入参
node scripts/cli.mjs describe <server> <tool> <param>   # 只看一个参数的类型、枚举与等价写法
node scripts/cli.mjs list-tools <server>          # 等价于读 references/<server>.md
node scripts/cli.mjs list-servers                 # 7 个 server 与工具数
```

以上**全部离线**，不发网络、不消耗积分，不确定时随便用。不带参数跑 `node scripts/cli.mjs` 会打印完整用法，包含这些排障命令（会发网络请求）：`doctor`（Key + 连通性 + 注册表漂移 + 上次自更新状态）、`diff <server>`（线上 schema vs 本地，只读）、`refresh <server>`（拉最新 schema，写回注册表并重生成目录）、`smoke [server]`（用实测样例跑冒烟）。

**不要凭工具名猜参数**：同名字段在不同 server 含义不同（`windCode` 在 `stock` 是股票、在 `futures` 是品种、在 `options` 是标的），类型也不同（`futures_get_position_ranking.type` 是 integer，`futures_get_warehouse_receipt.type` 是 string）。

## 3. 发命令

```bash
node scripts/cli.mjs call <server> <tool> '<params_json>'
```

一个可直接运行的完整例子：

```bash
node scripts/cli.mjs call stock stock_get_company_profile '{"windCode":"600519.SH"}'
```

参数取值一律回契约拿，不得从本例外推。

**参数传递**：POSIX shell 直接传内联 `<params_json>`。非 POSIX 环境（PowerShell / cmd / 经执行器包装）改用参数文件：把 UTF-8 JSON 写到 `scripts/request-<唯一后缀>.json`，传 `@scripts/request-<唯一后缀>.json`，调用后删除，不复用共享文件。

**两段式调用**：下列工具的入参必须来自上游返回值，**不能自己编 id 或代码**。缺上游就先调上游。（唯一的例外是最后一行的行情指标，指标名拿不准时才需要先搜。）

| 上游 → 下游 | 传递的字段 |
| --- | --- |
| `finance.general_search_documents` → `general_get_document` | 「文档编号」→ `documentId`；两端 `documentType` 都传英文枚举 `news`/`na`/`rpp`（上游 schema 说明文字误写成中文，别照抄）。**只能拿到元信息，正文为空** |
| `finance.general_search_indicators` → `general_get_indicator_data` | 「指标代码」→ `indicatorCode` |
| `finance.general_search_datasets` → `general_get_dataset` | `id` → `reportId`，`exampleCondition` → `condition` |
| `finance.general_search_research_insight` → `general_get_research_insight` | `templateId` |
| `finance.quote_search_realtime_indicators` → `quote_get_realtime_indicators` | `cnName` / `enName` → `indexes`（**可选**：`indexes` 也直接收中文指标名） |
| `edb.economic_search_indicator` → `economic_get_indicator_series` | `code` → `metricCodes`（逗号分隔 string） |
| `stock.stock_get_market_narratives` → `stock_get_narrative_details` | 「子叙事ID」→ `childId` |
| `options.options_get_listed_terms` → `options_get_term_metrics` | `optionVarietyCode` + `expiryDate` |
| `options.options_get_term_metrics` → `options_get_contract_series` | `optionContractCode[]` → `optionContractCodes`（数组） |

`company` 的 `companyKey` **不在这张表里**：它接受企业全称或统一社会信用代码，是自然语言而非不可构造的 id。用户已给出唯一全称（如「恒大地产集团有限公司」）时可以直接传，不必先 `company_search_entity`；只有拿到的是简称、品牌、曾用名，或可能匹配多个主体时，才先做主体匹配。

**Key**：不得只检查配置文件就声称没有 API Key。必须先实跑一次；只有返回 `AUTH_ERROR` 才能判定缺失。查找顺序：`~/.wind-aifinmarket/config` → `<skill>/config.json` → 环境变量 `WIND_API_KEY`。

**批量与并发**：默认串行。需要对 2 个及以上标的逐项调用时，先只发第一个作探针；探针成功才继续其余，探针返回错误信封立即终止该批次，不得把同样的调用扩散到其它标的。不同 `server + tool` 或不同参数结构各自分组、各发一次探针。用户明确要求并发时上限 5，一旦返回 `RATE_LIMIT_ERROR` 就停止新请求并恢复串行。

## 4. 读回执

stdout 只有两种形态。

**成功**：数据对象，后端结果在 `content[0].text` 里（多为 JSON 字符串），CLI 另附一个 `cli_meta`。直接读，优先解析 `content[0].text`。

- **先核对返回的标的是不是你问的那一个**（返回体里的证券代码 / 公司名称 / 指标代码），再读数值。后端的标的识别不报错也可能认错，见第 5 节。
- **结构完整但关键字段是空串，同样按失败处理**。信封是 `isError:false`、文本是合法 JSON，CLI 的错误嗅探抓不到这种形态——拿到数据后先确认你要的那个字段真的有值（典型例子见第 5 节的文档正文）。
- 数值的单位和**量级**以返回体自带的元数据为准（EDB 在 `meta.unit` / `meta.magnitude`，行情类在 `data.unit`）。元数据没给就保留原值并说明单位未知，**不得自行换算**。
- **EDB 币种例外**：`economic_query_indicator_series` 传了 `targetCurrency` 时，`meta.unit` **不会跟着改**（仍显示原币种的「亿元」），而 `meta.currency` 已经是转换后的币种。此时币种一律以 `meta.currency` 为准、量级以 `meta.magnitude` 为准，报数写「亿美元」，**不要照抄 `unit`**。照抄会给出一个不报错但完全错误的答案。
- `cli_meta.suspect_error` 为 `true`（只在 `--raw` 下出现）说明返回文本像错误提示，按失败处理。

**失败**：`{"ok":false,"code":"...","message":"..."}`。

| `code` | 含义与处置 |
| --- | --- |
| `PARAM_VALIDATION_ERROR` / `PARAM_TYPE_ERROR` | 本地按 schema 拦下，未发出网络请求。`message` 已指明缺哪个必填、哪个字段类型/枚举/日期格式不对、哪些是未知字段。只改 `message` 指出的字段后重调。 |
| `ROUTE_ERROR` | server 或工具名不存在，`message` 会给近似工具名。选错了就改名；确认工具应该存在则本地注册表过期，跑 `node scripts/cli.mjs refresh <server>` 后重试。 |
| `INVALID_PARAMS_JSON` / `PARAMS_FILE_ERROR` | 命令行引号或参数文件问题，只改传参方式，**不动业务参数**。 |
| `backend_error` | 接口层错误，`message` 是后端原文。若同时带 `known_issue`，说明这是已记录的服务端故障，**不要反复重试**，直接告知用户。 |
| `AUTH_ERROR` / `RATE_LIMIT_ERROR` / `NETWORK_ERROR` | 认证、额度、网络问题。直接报告，不改参数、不换工具绕路。 |

**重调前自检**：

- 只改 `message` 点名的那个字段，不动其它参数，不改命令引号或 JSON 转义。
- 保持同一 `server` 和 `tool`；只有当前契约证明该工具无法表达所需字段或口径时才切换。
- 参数名和字段值必须来自当前 server 的契约（错误信封里的 `hint` 给了直接可跑的 `describe` 命令）。
- 同一工具同一参数**最多重试一次**；两次都失败就换路径或如实报告。

## 5. 已知的服务端坑

- **业务错误常伪装成正常返回**：七个 server 普遍把「服务暂时不可用」「未识别到有效的金融标的」这类错误以 `isError=false` 的纯文本返回。CLI 已做嗅探并转成 `backend_error`，但如果你看到成功信封里的 `content[0].text` 是一句短提示而不是数据，同样按失败处理。
- **未知字段被静默忽略**：后端对多数工具不校验未知字段，写错字段名不会报错，而是返回默认范围的数据。CLI 已在本地按 schema 拦截；不要用 `--allow-unknown` 绕过，除非 `refresh` 已确认注册表过期。
- **`tools/list` 会变**：历史上出现过整批工具改名、字段名改动。命中疑似过期时跑 `node scripts/cli.mjs doctor` 看漂移，再 `refresh`。
- **文档正文常为空**：`finance.general_get_document` 对新闻和公告返回的 `文档内容` 实测是**空串**（研报返回「无此研报权限」），信封仍是 `isError:false`，只有元信息和原文链接。需要正文时改用 `finance.general_query_documents`（`docType` 传 `"1"` 新闻 / `"3"` 公告，`startDate`/`endDate` 格式是 `YYYY-MM-DD HH:MM:SS`），它的 `content` 字段带正文。这是第 4 条仲裁规则「兜底排最后」的明确例外。
- **说明文字与 enum 打架**：部分字段的 schema 说明里举的例子不在自己的 enum 里（如 `edb.economic_query_indicator_series.targetMagnitude` 说明写「如 元、亿元、万亿元」，而 enum 只收纯量级词「亿」「万亿」）。**一律以 enum 为准**，`describe` 的 `enum` 字段就是权威值集。反过来，`futures` 的 `sector` / `type` 说明里写明「中文键与英文值等价」并附了映射表，那些中文键虽然不在 enum 里但后端确实收，CLI 已一并放行。
- **标的识别是非确定性的**：非法或含糊的代码/名称，多数时候会返回「未识别到有效的金融标的」，但实测也出现过**返回一只无关证券的真实数据、不报任何错**（`999999.XX` 曾命中中证800）。**凡是按代码或名称取数的调用，拿到结果后都要核对返回体里的证券代码/公司名称是不是你问的那一个**；对不上就按未识别处理，向用户要准确全称或 Wind 代码，不要把数据讲出去。
- **误导性文案**：`futures_get_contract_spec` 偶发「未识别到有效的金融标的」（其实是瞬时故障，重试即恢复）；`fund_get_selection_timing_analysis` 对未覆盖的基金返回「Wind 数据源当前不可用，请稍后重试」（其实是该基金无评价数据，重试无用）。
- **持续不可用**：`options_calc_accumulator`、`options_calc_single_shark_fin` 服务端长期不可用，直接告知用户，不要重试。

## 6. 收口

标的未识别或 NER 失败时，询问用户准确全称或 Wind 标准代码，**不得自行补交易所后缀或把名称猜成代码**。

认证、额度、网络、后端不可用、路由错误：直接报告，不绕路、不用记忆里的数据代替。

成功返回数据时末尾附上来源声明，语言与用户提问语言一致：

> 数据来源于万得 Wind 金融数据服务。

> Data sourced from Wind Financial Data Service.

完成状态：`DONE`、`DONE_WITH_LIMITS`、`NO_RESULTS`、`BLOCKED_KEY`、`BLOCKED_QUOTA`、`BLOCKED_RUNTIME`、`OUT_OF_SCOPE`。
