# `economic_data` 工具契约

只用于宏观和行业 EDB 指标。公共字段规则见 `references/contracts/parameter-conventions.md`。

- 对外日期字段使用 `begin_date` / `end_date`，CLI 转成后端 `beginDate` / `endDate`。
- `仅提数` / `搜索并提数` 必须提供完整日期范围或 `observation`，两者互斥。

<!-- BEGIN MCP TOOLS/LIST GENERATED CONTRACT -->
## 工具契约

### `natural_language_get_edb_data`

根据自然语言问句或 EDB 指标代码，从 Wind EDB 经济数据库中搜索指标并获取时间序列数据。
支持三种执行模式：
·仅搜索（search）：根据自然语言问句搜索匹配的 EDB 指标，返回指标列表及指标元信息（如指标名称、指标代码、频率、单位等），不返回具体数值数据。
·仅提数（fetch）：根据用户提供的一个或多个 EDB 指标代码获取时间序列数据。
·搜索并提数（searchFetch）：先根据自然语言问句搜索匹配指标，再返回对应指标的时间序列数据。

输入说明：
executionMode：执行模式，可选值为 search、fetch、searchFetch。
question：
当 executionMode=search 或 searchFetch 时，为自然语言查询字符串，例如“中国GDP”“美国CPI”。
当 executionMode=fetch 时，为一个或多个 EDB 指标代码，多个代码使用英文逗号分隔，例如 G0000069,G8411182。
beginDate、endDate：查询时间范围，格式为 yyyyMMdd。
observation：观测区间类型，例如 3，表示最近3期数据，与时间范围参数二选一。

调用约束：
当 executionMode=fetch 或 searchFetch 且需要返回具体数值数据时，必须显式提供 beginDate/endDate 或 observation。
不要仅将时间范围描述写入 question 中。

返回结果：
搜索模式返回指标列表及指标元信息。
提数模式返回指标时间序列数据，包含指标代码、指标名称、日期和值。
搜索并提数模式同时返回匹配指标信息及对应时间序列数据。

适用于 EDB 指标发现、指标信息查询、历史数据获取等场景。

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `executionMode` | 是 | string | 仅搜索 / 仅提数 / 搜索并提数 | — | 执行方式。仅搜索：用户只想查找、筛选或推荐宏观经济指标，不需要返回具体数值。仅提数：用户已经给出明确指标代码，需要直接提取数据。搜索并提数：用户用自然语言描述指标并要求返回具体数据，需要先搜索指标再提数。 |
| `question` | 是 | string | — | — | 查询内容。执行方式为【仅提数】时，填入指标代码，多个代码用英文逗号分隔，如 G0000069,G8411182。执行方式为【仅搜索、搜索并提数】时，填入指标或经济数据的自然语言描述，如 中国GDP、上海CPI、出口相关指标。注意：question 主要用于指标搜索或指标代码提数，不应依赖工具从 question 中自动解析日期；时间范围应通过 beginDate/endDate 或 observation 显式传入。 |
| `beginDate` | 否 | string | — | — | 数据提取开始时间，格式为 yyyyMMdd。与 observation 参数互斥，不应同时填写。仅在【仅提数、搜索并提数】时生效。注意：当用户需要返回具体时间序列数据，且问题包含明确或隐含时间范围时，调用方应显式传入 beginDate/endDate；不要仅将时间范围写在 question 中。若用户未表达时间范围，可按业务默认规则补齐。 |
| `endDate` | 否 | string | — | — | 数据提取结束时间，格式为 yyyyMMdd。与 observation 参数互斥，不应同时填写。仅在【仅提数、搜索并提数】时生效。注意：当用户需要返回具体时间序列数据，且问题包含明确或隐含时间范围时，调用方应显式传入 beginDate/endDate；不要仅将时间范围写在 question 中。 |
| `observation` | 否 | string | — | — | 观测期数。用户要求提取近 N 期数据时填入数字字符串，如“近10期”填 '10'；用户要求查看全量数据时填 'all'。与 beginDate/endDate 参数互斥，不应同时填写。仅在【仅提数、搜索并提数】时生效。注意：若用户表达的是近 N 期，优先使用 observation；若用户表达的是具体日期区间，优先使用 beginDate/endDate。 |
<!-- END MCP TOOLS/LIST GENERATED CONTRACT -->
