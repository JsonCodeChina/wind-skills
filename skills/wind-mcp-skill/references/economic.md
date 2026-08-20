# `economic_data` 工具契约

只用于宏观和行业 EDB 指标。自然语言统一使用 `question`；日期统一使用 `beginDate` / `endDate`（格式 `yyyyMMdd`）。

- 该 server 拆成两个工具：`economic_indicator_search` 只搜索指标、返回元信息；`economic_indicator_data_query` 提取指标时间序列数据。
- 先搜索后提数：不确定指标是否存在时，先用 `economic_indicator_search` 确认指标名称/代码，再用 `economic_indicator_data_query` 取数。
- `economic_indicator_data_query` 必须提供完整日期范围 `beginDate`+`endDate` 或 `observation`，两者互斥。
- 后端将合法日期误报为 observation 格式错误时，视为后端问题：停止自动修正并透传错误。
- 不得把日期范围擅自改成 `observation`，也不要仅将时间范围描述写进 `question`。
- 未搜到指标时返回一句说明文本（如“没有搜索到指标，……”），属正常空结果，据此向用户说明即可。

## 工具契约

### `economic_indicator_search`

根据自然语言需求，从经济数据库中检索并匹配相关经济指标，返回指标的元信息（指标名称、指标代码、频率、单位、来源、数量级等），**不提取指标数据**。适用于查找可用指标、筛选指标及提数前确认指标的场景。

| 参数 | 必填 | 类型 | 枚举 | 示例 / 默认 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `question` | 是 | string | — | 中国近三年 GDP 相关指标 | 自然语言搜索问句，如 中国近三年 GDP 相关指标、上海 CPI 有哪些、有哪些出口相关指标。 |

### `economic_indicator_data_query`

用自然语言获取 Wind EDB 宏观经济指标的时间序列数据（不回答概念、定义等无需访问 EDB 数据的问题）。

| 参数 | 必填 | 类型 | 枚举 | 示例 / 默认 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `question` | 是 | string | — | 提取中国GDP数据 | 自然语言查询问句，如 提取中国GDP数据、查找上海 CPI 数据、帮我找到中国最新一期出口同比数据。 |
| `beginDate` | 否 | string | — | 20230101 | 数据提取开始时间，格式 `yyyyMMdd`。与 `observation` 互斥。 |
| `endDate` | 否 | string | — | 20241231 | 数据提取结束时间，格式 `yyyyMMdd`。与 `observation` 互斥。 |
| `observation` | 否 | integer | — | 10 | 观测期数（正整数）。近 N 期填数字，如“近10期”填 `10`。与 `beginDate`/`endDate` 互斥；返回时间对齐到最低频指标。 |
