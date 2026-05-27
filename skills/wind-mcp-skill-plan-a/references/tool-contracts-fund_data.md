# fund_data 工具契约

> 何时读：选择 server_type=fund_data 后读对应段落 | 权威于：工具字段、参数、场景、示例

调用前仍需校验 `references/tool-manifest.json`；行情快照 `indexes` 仍以
`references/indicators-<category>.md` 为唯一权威清单。

## 工具总表

**`tool_name` 必须逐字取自本表；不在表内的名字一律不存在，禁止自造或拼凑。**

| tool_name | 入参 |
| --- | --- |
| `search_funds` | `question`（+`lang` / `version`） |
| `get_fund_price_indicators` | `windcode` + `indexes` |
| `get_fund_kline` | `windcode` + `begin_date` + `end_date` |
| `get_fund_quote` | `windcode`（+`begin` / `end`） |
| `get_fund_info` / `get_fund_financials` / `get_fund_holdings` / `get_fund_performance` / `get_fund_holders` / `get_fund_company_info` | `question`（+`lang`） |

字段级细节（`indexes` 取值、`period` 枚举、日期格式）见下方各工具段落与 `references/indicators-<category>.md`。

## 参数签名

| 工具组 | 入参 | 适用范围 |
| --- | --- | --- |
| 行情类 | `{windcode, ...}` | 基金行情工具 |
| 基金筛选 | `{question, lang?, version?}` | `search_funds` |
| 专项 NL | `{question, lang?}` | NL 工具 |

params JSON 的 key 必须逐字复制本文件的字段名。不得把用户口语、其它 API 习惯或通用证券字段名
翻译成别名 key；例如行情类必须使用 `windcode`，不得写成 `code`、`ticker`、`symbol`、
`sec_code` 或 `stock_code`。

单次工具调用只查询一个标的。行情类 `windcode` 必须是单个字符串，禁止传数组、对象、
逗号分隔多代码、空格分隔多代码或把多个代码拼成一个字符串。

`windcode` 优先传用户给出的单个标的名称或代码。Wind 可解析中文名、简称和标准代码，例如：

- 场外基金：`005827.OF`
- ETF / LOF：`588200.SH`、`159915.SZ`

简称或别名可能映射多个标的时先问用户，不要让后端静默选错。

## 基金筛选

`fund_data.search_funds`（基金筛选）从基金产品中筛选符合条件的基金，返回基金代码列表。

触发条件：用户未指定具体基金 / ETF / LOF，而是描述筛选条件，例如基金类型、ETF 主题、
收益率、管理规模、基金公司、投资主题、风险收益特征或其它筛选条件。

不要用于：已指定单只基金的净值 / 规模 / 档案 / 持仓 / 业绩查询；股票、指数、债券筛选；
需要返回字段值而非基金代码列表的取数。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `question` | 是 | 自然语言基金筛选问句；调用前移除空白字符，不得添加用户未给出的筛选条件 |
| `lang` | | `"English"` / `"中文"`；默认 `"中文"` |
| `version` | | 后端版本参数；仅当用户或系统明确指定时传入，不得自造 |

示例：`{"question":"筛选股票型基金中近一年收益率超20%的产品"}`

## 行情工具

### 行情快照指标

用于最新值或其它单时点行情字段。

| tool_name |
| --- |
| `get_fund_price_indicators` |

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
- 基金：`IOPV`、`贴水率`、`基金最新份额`、`基金规模`、`最新净值`、
  `累计净值`、`七日年化收益率`

### K 线

用于历史行情序列。

| tool_name |
| --- |
| `get_fund_kline` |

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
| `get_fund_quote` |

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
| `search_funds` | 全市场基金产品筛选，返回代码列表 | `"筛选股票型基金中近一年收益率超20%的产品"` |
| `get_fund_info` | 基金档案、费率、经理、风格、业绩基准 | `"易方达蓝筹精选(005827.OF)基金档案"` |
| `get_fund_financials` | 利润、净值、收入、费用、分红 | `"005827.OF2024年净利润和分红"` |
| `get_fund_holdings` | 重仓股、资产配置、行业配置 | `"005827.OF最新一期重仓股"` |
| `get_fund_performance` | 业绩、排名、ETF / 二级交易 | `"005827.OF近1年业绩排名"` |
| `get_fund_holders` | 持有人结构、申赎、规模变动 | `"005827.OF持有人结构"` |
| `get_fund_company_info` | 基金管理公司档案、经理团队 | `"易方达基金管理公司档案"` |

## 调用示例

```bash
node scripts/cli.mjs call fund_data search_funds '{"question":"筛选股票型基金中近一年收益率超20%的产品"}'
node scripts/cli.mjs call fund_data get_fund_price_indicators '{"windcode":"588200.SH","indexes":"中文简称,最新成交价,IOPV,贴水率"}'
node scripts/cli.mjs call fund_data get_fund_kline '{"windcode":"588200.SH","begin_date":"20260401","end_date":"20260430"}'
```
