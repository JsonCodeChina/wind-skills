# `economic_data` 工具契约

只用于宏观和行业 EDB 指标。公共字段规则见 `references/contracts/parameter-conventions.md`。

## `natural_language_get_edb_data`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `executionMode` | 是 | `search` / `fetch` / `searchFetch`；也兼容 `仅搜索` / `仅提数` / `搜索并提数` |
| `question` | 是 | 搜索时传自然语言指标名；fetch 时传一个或多个 EDB 指标代码 |
| `begin_date` / `end_date` | 条件必填 | 提数时间范围；与 `observation` 互斥；CLI 转为后端驼峰字段 |
| `observation` | 条件必填 | 近 N 期传数字字符串，全量传 `all`；与日期范围互斥 |

`fetch` / `searchFetch` 必须显式提供完整日期范围或 `observation`。日期范围请求若被后端误报为 `observation` 错误，视为后端问题：停止自动修正并透传错误，不得把日期范围擅自改成 `observation`，以免改变查询口径。

```json
{"executionMode":"searchFetch","question":"中国GDP","observation":"10"}
{"executionMode":"searchFetch","question":"中国CPI同比","begin_date":"2024-01-01","end_date":"2026-07-15"}
```
