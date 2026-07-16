# `analytics_data` 工具契约

仅当专项服务无法覆盖结构化取数时使用。不得用于替代股票行情、K 线、Quote 或价格指标。公共字段规则见 `references/contracts/parameter-conventions.md`。

## `get_financial_data`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `question` | 是 | 单一、简洁的结构化取数问题 |
| `lang` | 否 | 对外用 `中文` / `English`；CLI 转成 `CNS` / `ENS` |

首次调用保持用户原意，不增加筛选条件。首次失败、空数据或明显不匹配后，才可在同一取数意图内改写或拆分一次。

```json
{"question":"贵州茅台最新收盘价","lang":"中文"}
```
