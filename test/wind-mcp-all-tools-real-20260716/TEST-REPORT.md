# Wind MCP 全部工具真实后端测试报告

- 测试时间：2026-07-16T03:19:16.951Z 至 2026-07-16T03:20:25.195Z
- 执行方式：串行，默认并发数 1
- Manifest 工具数：34
- 实际执行工具数：34
- 成功：34
- 失败：0
- 总通过率：100.0%

## 分服务结果

| server_type | 成功/总数 |
| --- | ---: |
| `stock_data` | 10/10 |
| `fund_data` | 10/10 |
| `index_data` | 6/6 |
| `bond_data` | 4/4 |
| `financial_docs` | 2/2 |
| `economic_data` | 1/1 |
| `analytics_data` | 1/1 |

## 失败明细

| 工具 | 错误码 | 最终错误摘要 |
| --- | --- | --- |
| — | — | 无 |

## 重试与异常观察

- 本轮共执行 36 次后端调用尝试。
- `stock_data.get_stock_quote` 首次返回 `NETWORK_ERROR: fetch failed`，按错误信封原样重试一次后成功。
- `economic_data.natural_language_get_edb_data` 使用统一日期范围时，后端返回 `UNKNOWN: observation只能是纯数字或者all`；同一工具改用 `observation: "10"` 修正重试后成功。这说明 EDB 日期字段映射已穿过本地校验，但该后端路径仍存在日期范围与 `observation` 契约不一致。

## 回归覆盖

- 3 个 K 线工具使用 ISO/斜杠日期和 `period: day`，验证 CLI 日期及周期归一化。
- 3 个 Quote 工具使用统一的 `begin_date/end_date: LAST`，验证字段映射及 LAST 特例。
- EDB 使用统一的 `begin_date/end_date`，验证到 `beginDate/endDate` 的映射。
- 若 EDB 后端对日期范围返回“observation只能是纯数字或者all”，同一工具按明确错误提示改用 `observation: 10` 修正重试一次，并保留两次证据。
- 21 个标准 `lang` 工具使用 `lang: zh`，验证统一外部词表。
- Analytics 使用 `lang: 中文`，验证到 `CNS` 的后端编码转换。
- 2 个 Financial Docs 工具使用 `question`，验证到后端 `query` 的转换。
- 34 个工具均来自当前 `tool-manifest.json`，脚本启动前会校验无遗漏、无重复。

完整请求、每次尝试、stdout、stderr 和解析结果见 `raw-results.json`。
