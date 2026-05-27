# index_data 工具契约

> 何时读：选择 server_type=index_data 后读对应段落 | 权威于：工具字段、参数、场景、示例

调用前仍需校验 `references/tool-manifest.json`；行情快照 `indexes` 仍以
`references/indicators-<category>.md` 为唯一权威清单。

## 工具总表

**`tool_name` 必须逐字取自本表；不在表内的名字一律不存在，禁止自造或拼凑。**

| tool_name | 入参 |
| --- | --- |
| `get_index_price_indicators` | `windcode` + `indexes` |
| `get_index_kline` | `windcode` + `begin_date` + `end_date` |
| `get_index_quote` | `windcode`（+`begin` / `end`） |
| `get_index_basicinfo` / `get_index_fundamentals` / `get_index_technicals` | `question`（+`lang`） |

字段级细节（`indexes` 取值、`period` 枚举、日期格式）见下方各工具段落与 `references/indicators-<category>.md`。

## 参数签名

| 工具组 | 入参 | 适用范围 |
| --- | --- | --- |
| 行情类 | `{windcode, ...}` | 指数行情工具 |
| 专项 NL | `{question, lang?}` | NL 工具 |

params JSON 的 key 必须逐字复制本文件的字段名。行情类必须使用 `windcode`，不得写成
`code`、`ticker`、`symbol`、`sec_code` 或 `stock_code`。

单次工具调用只查询一个标的。行情类 `windcode` 必须是单个字符串，禁止传数组、对象、
逗号分隔多代码。用户要求多个指数对比时，必须拆成多次同工具调用后合并结果。

`windcode` 优先传用户给出的单个标的名称或代码。Wind 可解析中文名、简称和标准代码，例如：

- 指数：`000300.SH`、`000905.SH`、`HSI.HI`

简称或别名可能映射多个标的时先问用户，不要让后端静默选错。

## 行情工具

### 行情快照指标

用于最新值或其它单时点行情字段。

| tool_name |
| --- |
| `get_index_price_indicators` |

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `windcode` | 是 | 单个标的名称或代码；禁止数组、多代码字符串或逗号拼接 |
| `indexes` | 是 | 逗号分隔的精确指标名；每个值必须逐字存在于 `references/indicators-<category>.md` |

`indexes` 只能覆盖用户明确请求的指标，不得为了"更完整"追加用户未提到的字段。
`indexes` 禁止猜测、翻译、改写。不得传入未收录的英文缩写、拼音、API 字段名、
用户口语词或自行翻译词；若字段不在
`references/indicators-<category>.md`，改用合适的 NL 工具，或说明该快照字段不可用。
用户口语字段必须映射为表内精确字段后再传入。

以下仅是常用候选，用于定位用户已请求的字段；不得把候选列表当作默认字段集。
传参前仍要逐项核对 `references/indicators-<category>.md`：

- 通用：`中文简称`、`最新成交价`、`前收盘价`、`今日开盘价`、`今日最高价`、
  `今日最低价`、`成交量`、`成交额`、`涨跌`、`涨跌幅`
- 指数：`成分股贡献点数`、`上涨家数`、`下跌家数`、`平盘家数`

### K 线

用于历史行情序列。

| tool_name |
| --- |
| `get_index_kline` |

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
| `get_index_quote` |

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
| `get_index_basicinfo` | 指数档案、发布机构、基日、基点、成份数量 | `"沪深300指数档案"` |
| `get_index_fundamentals` | PE / PB / PS、营收、利润、现金流、历史分位 | `"沪深300PE/PB历史分位"` |
| `get_index_technicals` | 多周期涨跌幅、趋向、反趋向、能量、量价、波动 | `"中证500的MACD和RSI"` |

## 调用示例

```bash
node scripts/cli.mjs call index_data get_index_price_indicators '{"windcode":"000300.SH","indexes":"最新成交价,涨跌幅,成交量,成交额"}'
node scripts/cli.mjs call index_data get_index_kline '{"windcode":"000300.SH","begin_date":"20260401","end_date":"20260430"}'
```
