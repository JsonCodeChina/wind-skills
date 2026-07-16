# `index_data` 工具契约

只用于指数和板块。公共字段规则见 `references/contracts/parameter-conventions.md`。

| tool_name | 意图 | 必填 | 可选 |
| --- | --- | --- | --- |
| `get_index_price_indicators` | 最新值、涨跌幅等单时点指标 | `windcode`, `indexes` | — |
| `get_index_kline` | 历史 K 线、区间走势 | `windcode`, `begin_date`, `end_date` | `period`, `count`, `aftime`, `issusp`, `afdate` |
| `get_index_quote` | 分钟或日内行情 | `windcode` | `begin_date`, `end_date` |
| `get_index_basicinfo` | 指数档案、发布机构、基日、成份数 | `question` | `lang` |
| `get_index_fundamentals` | PE、PB、PS、营收利润、历史分位 | `question` | `lang` |
| `get_index_technicals` | 涨跌幅、趋势、能量、量价、波动 | `question` | `lang` |

## 专项规则

- `indexes` 每次只读 `references/indicators.md` 的通用字段和“指数专属”字段。
- 已确认的指数标准代码可直接传，例如 `000300.SH`、`HSI.HI`。CLI 只映射少量明确别名，不猜测未知后缀。

## 示例

```json
{"windcode":"000300.SH","indexes":"中文简称,最新成交价,涨跌幅"}
{"windcode":"000300.SH","begin_date":"20260701","end_date":"20260715","period":"10"}
{"question":"沪深300PE和PB历史分位","lang":"中文"}
```
