# `stock_data` 工具契约

只用于股票：A 股、港股、美股共用本服务。公共字段规则见 `references/contracts/parameter-conventions.md`。

| tool_name | 意图 | 必填 | 可选 |
| --- | --- | --- | --- |
| `search_stocks` | 未指定具体股票的选股筛选 | `question` | `lang`, `version` |
| `get_stock_price_indicators` | 最新价、涨跌幅、单时点行情指标 | `windcode`, `indexes` | — |
| `get_stock_kline` | 历史 K 线、区间、走势 | `windcode`, `begin_date`, `end_date` | `period`, `count`, `aftime`, `issusp`, `afdate` |
| `get_stock_quote` | 分钟行情、日内行情 | `windcode` | `begin_date`, `end_date` |
| `get_stock_basicinfo` | 公司档案、主营、行业、IPO | `question` | `lang` |
| `get_stock_fundamentals` | 盈利、资产负债、现金流、增长率 | `question` | `lang` |
| `get_stock_equity_holders` | 股本、股东、实控人、限售 | `question` | `lang` |
| `get_stock_events` | IPO、增发、并购、ST、分红 | `question` | `lang` |
| `get_stock_technicals` | MACD、KDJ、RSI、BOLL、融资融券 | `question` | `lang` |
| `get_risk_metrics` | Beta、Alpha、波动率、Sharpe、VaR | `question` | `lang` |

## 专项规则

- `search_stocks` 只返回筛选出的股票范围；已指定具体股票时改用相应行情或领域工具。
- 行情、K 线、分钟行情和价格指标不得改用 `analytics_data` 节省调用次数。
- `indexes` 每次只读 `references/indicators.md` 中股票相关字段并逐项核对。
- 市值口径：`总市值1`=不含限售股，`总市值2`=含限售股。用户只说“总市值”且上下文不明确时必须询问，不得默认。

## 示例

```json
{"question":"筛选A股中的银行股","lang":"中文"}
{"windcode":"600519.SH","indexes":"中文简称,最新成交价,涨跌幅"}
{"windcode":"600519.SH","begin_date":"20260701","end_date":"20260715","period":"10"}
{"windcode":"AAPL.O","begin_date":"LAST","end_date":"LAST"}
```
