# global_stock_data 工具契约

> 何时读：选择 server_type=global_stock_data 后读对应段落 | 权威于：工具字段、参数、场景、示例

调用前仍需校验 `references/tool-manifest.json`；行情快照 `indexes` 仍以
`references/indicators-<category>.md` 为唯一权威清单。

## 工具总表

**`tool_name` 必须逐字取自本表；不在表内的名字一律不存在，禁止自造或拼凑。**

| tool_name | 入参 |
| --- | --- |
| `search_global_stocks` | `question`（+`lang` / `version`） |
| `get_global_stock_price_indicators` | `windcode` + `indexes` |
| `get_global_stock_kline` | `windcode` + `begin_date` + `end_date` |
| `get_global_stock_quote` | `windcode`（+`begin` / `end`） |
| `get_global_stock_basicinfo` / `get_global_stock_fundamentals` / `get_global_stock_equity_holders` / `get_global_stock_events` / `get_global_stock_technicals` / `get_global_stock_risk_metrics` | `question`（+`lang`） |

字段级细节（`indexes` 取值、`period` 枚举、日期格式）见下方各工具段落与 `references/indicators-<category>.md`。

## 参数签名

| 工具组 | 入参 | 适用范围 |
| --- | --- | --- |
| 行情类 | `{windcode, ...}` | 港美股行情工具 |
| 港美股筛选 | `{question, lang?, version?}` | `search_global_stocks` |
| 专项 NL | `{question, lang?}` | NL 工具 |

params JSON 的 key 必须逐字复制本文件的字段名。不得把用户口语、其它 API 习惯或通用证券字段名
翻译成别名 key；例如行情类必须使用 `windcode`，不得写成 `code`、`ticker`、`symbol`、
`sec_code` 或 `stock_code`。

单次工具调用只查询一个标的。行情类 `windcode` 必须是单个字符串，禁止传数组、对象、
逗号分隔多代码、空格分隔多代码或把多个代码拼成一个字符串。用户要求多个标的对比时，
必须拆成多次同工具调用后合并结果。

`windcode` 优先传用户给出的单个标的名称或代码。Wind 可解析中文名、简称和标准代码，例如：

- 港股：`00700.HK`
- 美股：`AAPL.O`、`MSFT.O`

简称或别名可能映射多个标的时先问用户，不要让后端静默选错。

## 港美股筛选

`global_stock_data.search_global_stocks`（港美股筛选）从港股 / 美股中筛选符合条件的股票，
返回港股 / 美股代码列表。

触发条件：用户未指定具体港股 / 美股，而是描述选股条件，例如市场、市值、涨跌幅、行业、
交易所、上市地或其它筛选条件。

不要用于：已指定单只港股 / 美股的行情 / 财务查询；A 股、基金、指数、债券筛选；
需要返回字段值而非股票代码列表的取数。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `question` | 是 | 自然语言港美股筛选问句；调用前移除空白字符，不得添加用户未给出的筛选条件 |
| `lang` | | `"English"` / `"中文"`；默认 `"中文"` |
| `version` | | 后端版本参数；仅当用户或系统明确指定时传入，不得自造 |

示例：`{"question":"筛选港股中市值超1000亿港元的科技股"}`

## 行情工具

### 行情快照指标

用于最新值或其它单时点行情字段。

| tool_name |
| --- |
| `get_global_stock_price_indicators` |

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `windcode` | 是 | 单个标的名称或代码；禁止数组、多代码字符串或逗号拼接 |
| `indexes` | 是 | 逗号分隔的精确指标名；每个值必须逐字存在于 `references/indicators-<category>.md` |

`indexes` 只能覆盖用户明确请求的指标，不得为了"更完整"追加用户未提到的字段。
`indexes` 禁止猜测、翻译、改写。不得传入未收录的英文缩写、拼音、API 字段名、
用户口语词或自行翻译词；若字段不在
`references/indicators-<category>.md`，改用合适的 NL 工具，或说明该快照字段不可用。
用户口语字段必须映射为表内精确字段后再传入，例如"今开"传 `今日开盘价`，
"昨收"传 `前收盘价`；找不到表内精确字段时不要传入快照工具。

以下仅是常用候选，用于定位用户已请求的字段；不得把候选列表当作默认字段集。
传参前仍要逐项核对 `references/indicators-<category>.md`：

- 通用：`中文简称`、`最新成交价`、`前收盘价`、`今日开盘价`、`今日最高价`、
  `今日最低价`、`成交量`、`成交额`、`涨跌`、`涨跌幅`
- 港美股：`换手率`、`52周最高`、`52周最低`

### K 线

用于历史行情序列。

| tool_name |
| --- |
| `get_global_stock_kline` |

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `windcode` | 是 | | 单个标的名称或代码；禁止数组、多代码字符串或逗号拼接 |
| `begin_date` | 是 | | `yyyyMMdd` |
| `end_date` | 是 | | `yyyyMMdd` |
| `count` | | | 正数表示从 `begin_date` 向后取 N 条；负数表示从 `end_date` 向前取 N 条 |
| `period` | | `"10"` | `1`=1分, `3`=5分, `4`=10分, `5`=15分, `6`=30分, `7`=60分, `8`=120分, `9`=240分, `10`=日K, `11`=周K, `12`=月K, `13`=年K, `14`=季K, `15`=半年K |
| `aftime` | | `"0"` | `"0"`=前复权, `"1"`=后复权 |
| `issusp` | | `"1"` | `"0"`=不含停牌, `"1"`=含 |
| `afdate` | | | 可选复权基准日，`yyyyMMdd` |

### 分钟行情

用于日内走势或分钟级行情数据。

| tool_name |
| --- |
| `get_global_stock_quote` |

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `windcode` | 是 | | 单个标的名称或代码；禁止数组、多代码字符串或逗号拼接 |
| `begin` | | `LAST` | `yyyyMMdd` 或 `LAST` |
| `end` | | `LAST` | `yyyyMMdd` 或 `LAST` |

## 领域 NL 工具

公共参数：

- `question: string` 写成标的加业务问题。
- `lang?: "English" | "中文"` 默认 `"中文"`。
- 调用前移除自然语言字段值中的空白字符。

| 工具 | 适用场景 | `question` 示例 |
| --- | --- | --- |
| `search_global_stocks` | 港股 / 美股股票筛选，返回代码列表 | `"筛选港股中市值超1000亿港元的科技股"` |
| `get_global_stock_basicinfo` | 公司档案、注册地、经营范围、交易所、行业、指数成份 | `"AAPL.O公司基本档案"` |
| `get_global_stock_fundamentals` | 财务、PE / PB / PS、历史分位 | `"腾讯(00700.HK)2024年ROE和营收"` |
| `get_global_stock_equity_holders` | 股本、主要股东、机构持仓、限售解禁 | `"腾讯(00700.HK)前十大股东"` |
| `get_global_stock_events` | IPO、增发、配股、并购、监管、分红 | `"腾讯(00700.HK)分红历史"` |
| `get_global_stock_technicals` | 多周期涨跌幅、MACD、KDJ、RSI、BOLL、融资融券 | `"AAPL.O的MACD和RSI"` |
| `get_global_stock_risk_metrics` | Beta、Alpha、波动率、Sharpe、最大回撤、VaR | `"AAPL.O过去1年Beta和波动率"` |

## 调用示例

```bash
node scripts/cli.mjs call global_stock_data search_global_stocks '{"question":"筛选港股中市值超1000亿港元的科技股"}'
node scripts/cli.mjs call global_stock_data get_global_stock_kline '{"windcode":"00700.HK","begin_date":"20260401","end_date":"20260430"}'
node scripts/cli.mjs call global_stock_data get_global_stock_quote '{"windcode":"AAPL.O"}'
```
