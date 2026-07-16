# Wind MCP 工具契约导航

本文件仅为兼容入口，不再承载34个工具的完整契约。不要一次读取所有服务文件。

## 固定读取顺序

1. 从 `references/tool-manifest.json` 选择合法的 `server_type + tool_name`。
2. 读取 `references/contracts/parameter-conventions.md`。
3. 查 `references/contracts/tool-index.json`，只读取所选 `server_type` 的一个 `contract_ref`。
4. 只有所选工具包含 `indexes` 时，按索引的 `indicator_ref` 和 `indicator_search_hint` 定位指标。

| server_type | 契约文件 |
| --- | --- |
| `stock_data` | `references/contracts/stock-data.md` |
| `fund_data` | `references/contracts/fund-data.md` |
| `index_data` | `references/contracts/index-data.md` |
| `bond_data` | `references/contracts/bond-data.md` |
| `financial_docs` | `references/contracts/financial-docs.md` |
| `economic_data` | `references/contracts/economic-data.md` |
| `analytics_data` | `references/contracts/analytics-data.md` |

字段、场景和示例以对应服务契约为准；CLI 本地校验以 `references/tool-validation-rules.json` 为准。
