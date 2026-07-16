# `bond_data` 工具契约

只用于债券；本服务没有行情快照、K 线或 Quote 工具。公共字段规则见 `references/contracts/parameter-conventions.md`。

| tool_name | 意图 | 必填 | 可选 |
| --- | --- | --- | --- |
| `get_bond_basicinfo` | 债券档案、发行、规模、票息、期限、兑付 | `question` | `lang` |
| `get_bond_issuer_info` | 发债主体、注册地、行业、股权结构 | `question` | `lang` |
| `get_bond_market_data` | 报价、估价、久期、凸性、利差 | `question` | `lang` |
| `get_bond_financial_data` | 发债主体营收、利润、资产、负债 | `question` | `lang` |

```json
{"question":"国债2601基本信息","lang":"中文"}
{"question":"国债2601久期和凸性","lang":"中文"}
```
