# `finance` 工具目录 —— 全球通用金融数据与文档库

> **这是目录，不是完整契约。** 表里的样例可以照抄直接跑；要改参数、要看【边界】、要看枚举取值，
> 先跑 `node scripts/cli.mjs describe finance <tool>`（离线、不花积分、单个工具约 1 千字）。
> 本文件由 `scripts/registry.json` 生成（vserver_finance_data，13 个工具 / 32 个参数），不要手改。

**覆盖**：行情快照与历史序列、Wind 专业指标库、已配置报表库、新闻/公告/研报文档库、投研参考语料、自然语言兜底取数。

## 调用要点

- 本 server 是**跨资产兜底入口**：债券、外汇、商品、全球指数等在 stock / fund / futures / options 里没有专项工具的品种，走这里。
- 四对工具是**强制两段式**，第二段的 id / 代码只能来自第一段的返回值，不能自己编，字段名两端还不一样：`general_search_indicators` 的「指标代码」→ `general_get_indicator_data.indicatorCode`；`general_search_datasets` 的 `id` → `general_get_dataset.reportId`、`exampleCondition` → `condition`；`general_search_documents` 的「文档编号」→ `general_get_document.documentId`；`general_search_research_insight` 的 `templateId` → `general_get_research_insight.templateId`。`quote_search_realtime_indicators`→`quote_get_realtime_indicators` 是**可选**的一段（指标名拿不准时才先搜）。
- `general_query_data` 与 `general_query_documents` 是自然语言兜底，**只在结构化工具都不覆盖时用**；它们不返回可复用的代码或 id，无法接续下一步。
- `quote_get_realtime_indicators` 的 `windCodes` 是**逗号分隔 string**，不是数组；`indexes` 同样是逗号分隔 string，中文指标名和英文字段名都收，拿不准就先调 `quote_search_realtime_indicators` 取 `cnName` / `enName`。
- `quote_get_historical_data_series` 的时间区间**嵌在 `params` 对象里**，且要按日期取数必须先设 `params.rangeflag = 2`，否则 `startDate`/`endDate` 不生效、静默返回最近 N 条。
- `general_search_documents` 与 `general_get_document` 的 `documentType` **都用英文枚举** `news`（新闻）/ `na`（公告）/ `rpp`（研报）。上游的说明文字写成中文是 schema 的笔误，别照抄。
- **要文档正文用 `general_query_documents`，不要用 `general_get_document`**：后者只返回标题、时间、来源和原文链接，`文档内容` 实测为空（研报还会返回「无此研报权限」）。`general_search_documents` → `general_get_document` 这条链路只适合**按类型/证券/日期精确列清单并核对元信息**。

## 工具目录

| 工具 | 用途 | 别选错（【边界】首句） | 入参（加粗=必填） | 可直接跑的样例 |
| --- | --- | --- | --- | --- |
| `quote_search_realtime_indicators` | 查询 Wind 行情服务当前可用的行情指标，返回指标中文名称和英文代码，为全球金融标的的最新行情或历史行情查询准备字段。 | 当有明确资产指标工具时不触发 | **keyword** | `{"keyword":"最新价"}` |
| `quote_get_realtime_indicators` | 按一个或多个已明确的 Wind 代码查询全球金融标的最新行情快照，覆盖全球市场中的股票、债券、基金、指数、期货、外汇、衍生品等品种。 | 当有明确资产行情工具时不触发 | **windCodes**, **indexes** | `{"windCodes":"600519.SH,000858.SZ","indexes":"中文简称,最新成交价,涨跌幅"}` |
| `quote_get_historical_data_series` | 按已明确的股票 Wind 代码、行情指标、周期和时间范围查询历史分时走势或 K 线数据。 | 当有明确资产历史分时走势或K线工具时不触发 | **windCode**, type, params | 参数较多，见 `describe` |
| `general_search_indicators` | 按专业金融指标名称检索 Wind 指标元数据，返回指标名称、指标代码、参数定义和可复用的取数示例，并根据证券代码匹配相应市场的指标体系。 | 当用本能力是专业金融指标字典，不返回证券实际数值 | **keyword**, windCode, maxCount | `{"keyword":"收盘价","windCode":"600519.SH","maxCount":3}` |
| `general_get_indicator_data` | 按明确的 Wind 证券代码和专业指标代码查询结构化金融指标数据，支持股票、债券、基金等证券品种的多证券、多指标批量取数，并可指定日期、复权、币种等计算参数。 | 当有明确资产历史分时走势或K线工具时不触发 | **windCode**, **indicatorCode**, parameter | `{"windCode":"600519.SH","indicatorCode":"s_dq_close"}` |
| `general_search_datasets` | 按关键词搜索或浏览当前已配置的金融报表，为后续报表取数确定报表标识和输入条件。 | 本能力只发现报表及其取数条件，不返回报表记录 | keyword | `{"keyword":"股本"}` |
| `general_get_dataset` | 按已确认的报表标识和对应条件读取当前已配置金融报表中的记录。 | 只查询当前已配置的报表，报表标识和 condition 必须与该报表的 inputSchema 对应 | **reportId**, **condition** | `{"reportId":"InstitutionalInvestors21","condition":{"windCode":"600519.SH"}}` |
| `general_search_documents` | 在全球财经新闻、全球公司公告和全球研究报告库中检索文档清单，支持按文档类型、关键词、Wind 证券代码和发布日期范围组合筛选。 | 需要浏览、筛选或锁定文档时使用本能力 | **documentType**, keyword, windCode, startDate, endDate | `{"documentType":"news","keyword":"贵州茅台","startDate":"2026-08-01","endDate":"2026-09-04"}` |
| `general_get_document` | 按已明确的文档编号和文档类型读取一篇财经新闻、公司公告或研究报告的完整信息。 | 本能力每次只读取一篇特定的文档，不负责搜索或浏览文档列表 | **documentType**, **documentId** | `{"documentType":"news","documentId":"869E674971F056E2D9A147BC8E616228"}` |
| `general_query_documents` | 用自然语言直接检索海量财经新闻报道和公司公告内容，覆盖全球金融实体、市场事件及企业信息披露。 | 本能力独立完成自然语言文档检索，不要求先取得文档编号，但结果是多篇相关文档或片段，不等同于某一篇文档的确定全文 | **question**, docType, queryMode, topK, startDate, endDate | `{"question":"贵州茅台最新新闻","topK":2}` |
| `general_search_research_insight` | 浏览和筛选当前可用的参考投研语料清单，覆盖分类体系、术语表、研究框架、标的映射关系等资料，为后续展开具体参考内容定位模板标识。 | 本能力只提供参考条目索引，不展开具体条目的字段、层级和正文 | keyword | `{}` |
| `general_get_research_insight` | 按已明确的参考投研语料标识读取指定条目的详细内容，包括字段定义、层级关系、说明文字、摘要和示例条目。 | 只读取一个已确认的参考条目，不负责发现有哪些模板可用 | **templateId**, arg | `{"templateId":"T001"}` |
| `general_query_data` | 用自然语言查询 Wind 全球金融数据库中的标准化行情、财务和宏观指标，覆盖全球市场全资产大类金融数据（如股票、债券、基金、指数、期货、外汇、衍生品、宏观数据等），并支持具有明确 Wind 标识或确切名称的全球市场对象。 | 问题必须同时包含至少一个明确的 Wind 标准证券或宏观标识（或可唯一确定的名称）和至少一个预定义标准指标 | **question** | `{"question":"贵州茅台最新收盘价"}` |

## 已知故障

| 工具 | 问题 |
| --- | --- |
| `quote_get_realtime_indicators` | 2026-09-05 复测服务端不可用（3 次重试均返回「服务暂时不可用，请稍后重试」）；2026-09-04 曾正常 |
| `general_search_documents` | schema 里 documentType 的**说明文字**写「可选值: 新闻、公告、研报」，但 enum 声明的是 news / na / rpp。实测两种都能调通且结果一致；一律按 enum 传英文值，与下游 general_get_document 保持一致。 |
| `general_get_document` | 2026-09-05 实测：只返回元信息（标题、发布时间、来源、原文链接），`文档内容` 字段是**空串**——新闻和公告都取不到正文，研报则返回「无此研报权限」。要正文请改用 `general_query_documents`（自然语言检索，返回体带 content 正文/摘要）。样例里的 documentId 取自当日检索结果，可能过期，过期后需重新走 `general_search_documents` 拿新编号。 |
| `general_query_documents` | `docType` 的枚举是数字字符串 `1`（新闻）/ `3`（公告），不是中文；`queryMode` 同样是 `1`/`2`/`3`。schema 说明里的中文只是标注含义，别当值传。研报不在本工具覆盖范围内。 |

## 本 server 最容易选错的

`general_query_documents`（要正文，自然语言）vs `general_search_documents`（要清单，按类型/证券/日期）——前者给内容，后者给编号，`general_get_document` 拿不到正文。

拿不准就 `node scripts/cli.mjs describe finance <tool>` 看完整的【边界】，它比上表的一句话摘要说得清楚。
