# natural_language_get_edb_data 日期字段真实后端测试

| 用例 | 参数 | exit | 结果 | 错误摘要 |
| --- | --- | ---: | --- | --- |
| canonical_date_fields | `{"executionMode":"searchFetch","question":"中国GDP","begin_date":"2025-01-01","end_date":"2026/07/15"}` | 1 | 失败：`NETWORK_ERROR` | fetch failed (server=economic_data) |
| backend_native_date_fields | `{"executionMode":"searchFetch","question":"中国GDP","beginDate":"20250101","endDate":"20260715"}` | 0 | 成功 |  |
| observation_control | `{"executionMode":"searchFetch","question":"中国GDP","observation":"10"}` | 0 | 成功 |  |

## 判定

- 该脚本记录统一字段、后端原生字段和 `observation` 对照的实际结果，不把网络错误判定为业务失败。
- `begin_date/end_date → beginDate/endDate` 的确定性转换结论由静态 CLI 回归覆盖；真实后端用例用于补充端到端观察。
- 完整原始响应见 `raw-results.json`。
