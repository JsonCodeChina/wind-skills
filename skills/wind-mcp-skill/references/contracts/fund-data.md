# `fund_data` 工具契约

只用于基金、ETF、LOF。公共字段规则见 `references/contracts/parameter-conventions.md`。

| tool_name | 意图 | 必填 | 可选 |
| --- | --- | --- | --- |
| `search_funds` | 未指定具体基金的产品筛选 | `question` | `lang`, `version` |
| `get_fund_price_indicators` | 最新价、净值、规模等单时点指标 | `windcode`, `indexes` | — |
| `get_fund_kline` | 基金历史 K 线、区间走势 | `windcode`, `begin_date`, `end_date` | `period`, `count`, `aftime`, `issusp`, `afdate` |
| `get_fund_quote` | 基金分钟或日内行情 | `windcode` | `begin_date`, `end_date` |
| `get_fund_info` | 档案、费率、经理、风格、业绩基准 | `question` | `lang` |
| `get_fund_financials` | 利润、净值、收入、费用、分红 | `question` | `lang` |
| `get_fund_holdings` | 重仓股、资产配置、行业配置 | `question` | `lang` |
| `get_fund_performance` | 业绩、排名、ETF 二级交易 | `question` | `lang` |
| `get_fund_holders` | 持有人结构、申赎、规模变动 | `question` | `lang` |
| `get_fund_company_info` | 基金公司档案、经理团队 | `question` | `lang` |

## 专项规则

- `search_funds` 只用于基金筛选；已指定具体产品时使用对应行情或领域工具。
- `indexes` 每次只读 `references/indicators.md` 的通用字段和“基金净值与规模”字段。
- 场外基金示例 `005827.OF`；ETF/LOF 示例 `588200.SH`、`159915.SZ`。

## 示例

```json
{"question":"筛选股票型基金","lang":"中文"}
{"windcode":"588200.SH","indexes":"中文简称,最新成交价,IOPV"}
{"windcode":"588200.SH","begin_date":"2026-07-01","end_date":"2026-07-15","period":"10"}
{"question":"005827.OF最新一期重仓股","lang":"中文"}
```
