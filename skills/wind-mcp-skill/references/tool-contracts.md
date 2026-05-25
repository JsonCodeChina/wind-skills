# wind-mcp-skill 工具契约

> 何时读：选定工具后只读对应段落 | 权威于：各工具字段 / 参数 / 示例 | 不覆盖：`indexes` 取值（见 `references/indicators.md`）

按 `SKILL.md` 完成路由判定后，只读取本文件中与所选工具相关的段落。
调用前仍需校验 `references/tool-manifest.json`；行情快照 `indexes` 仍以
`references/indicators.md` 为唯一权威清单。

## 目录

1. 参数签名
2. 行情工具
3. 领域 NL 工具
4. 文档工具
5. 宏观工具
6. 通用取数兜底
7. 调用示例

## 参数签名

| 工具组 | 入参 | 适用范围 |
| --- | --- | --- |
| 行情类 | `{windcode, ...}` | 股票 / 港美股 / 基金 / 指数行情工具 |
| 专项 NL | `{question, lang?}` | `stock_data`、`global_stock_data`、`fund_data`、`index_data`、`bond_data` NL 工具 |
| 文档 RAG | `{query, top_k?}` | `financial_docs` 工具 |
| 宏观 EDB | `{metricIdsStr, ...}` | `economic_data.get_economic_data` |
| 通用结构化取数 | `{question, lang?}` | `analytics_data.get_financial_data` |

params JSON 的 key 必须逐字复制本文件的字段名。不得把用户口语、其它 API 习惯或通用证券字段名
翻译成别名 key；例如行情类必须使用 `windcode`，不得写成 `code`、`ticker`、`symbol`、
`sec_code` 或 `stock_code`。

`windcode` 优先传用户给出的标的名称或代码。Wind 可解析中文名、简称和标准代码，例如：

- A 股：`600519.SH`、`8XXXXX.BJ`
- 港股：`00700.HK`
- 美股：`AAPL.O`、`MSFT.O`
- 场外基金：`005827.OF`
- ETF / LOF：`588200.SH`、`159915.SZ`
- 指数：`000300.SH`、`000905.SH`、`HSI.HI`

简称或别名可能映射多个标的时先问用户，不要让后端静默选错。

## 行情工具

### 行情快照指标

用于最新值或其它单时点行情字段。

| server_type | tool_name |
| --- | --- |
| `stock_data` | `get_stock_price_indicators` |
| `global_stock_data` | `get_global_stock_price_indicators` |
| `fund_data` | `get_fund_price_indicators` |
| `index_data` | `get_index_price_indicators` |

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `windcode` | 是 | 标的名称或代码 |
| `indexes` | 是 | 逗号分隔的精确中文指标名；调用前逐字段到 `references/indicators.md` 核对 |

`indexes` 禁止猜测、翻译、改写或使用英文指标名。若字段不在
`references/indicators.md`，改用合适的 NL 工具，或说明该快照字段不可用。
用户口语字段必须映射为表内精确字段后再传入，例如“今开”传 `今日开盘价`，
“昨收”传 `前收盘价`；找不到表内精确字段时不要传入快照工具。

以下仅是常用候选，传参前仍要逐项核对 `references/indicators.md`：

- 通用：`中文简称`、`最新成交价`、`前收盘价`、`今日开盘价`、`今日最高价`、
  `今日最低价`、`成交量`、`成交额`、`涨跌`、`涨跌幅`
- 股票：`换手率`、`量比`、`委比`、`涨停价`、`跌停价`、`52周最高`、
  `52周最低`、`总市值1`、`流通市值`、`市盈率(TTM)`、`市净率`、`股息率`
- 基金：`IOPV`、`贴水率`、`基金最新份额`、`基金规模`、`最新净值`、
  `累计净值`、`七日年化收益率`
- 指数：`成分股贡献点数`、`上涨家数`、`下跌家数`、`平盘家数`

### K 线

用于历史行情序列。

| server_type | tool_name |
| --- | --- |
| `stock_data` | `get_stock_kline` |
| `global_stock_data` | `get_global_stock_kline` |
| `fund_data` | `get_fund_kline` |
| `index_data` | `get_index_kline` |

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `windcode` | 是 | | 标的名称或代码 |
| `begin_date` | 是 | | `yyyyMMdd` |
| `end_date` | 是 | | `yyyyMMdd` |
| `count` | | | 正数表示从 `begin_date` 向后取 N 条；负数表示从 `end_date` 向前取 N 条 |
| `period` | | `"10"` | `1`=1分, `3`=5分, `4`=10分, `5`=15分, `6`=30分, `7`=60分, `8`=120分, `9`=240分, `10`=日K, `11`=周K, `12`=月K, `13`=年K, `14`=季K, `15`=半年K |
| `aftime` | | `"0"` | `"0"`=前复权, `"1"`=后复权 |
| `issusp` | | `"1"` | `"0"`=不含停牌, `"1"`=含 |
| `afdate` | | | 可选复权基准日，`yyyyMMdd` |

### 分钟行情

用于日内走势或分钟级行情数据。

| server_type | tool_name |
| --- | --- |
| `stock_data` | `get_stock_quote` |
| `global_stock_data` | `get_global_stock_quote` |
| `fund_data` | `get_fund_quote` |
| `index_data` | `get_index_quote` |

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `windcode` | 是 | | 标的名称或代码 |
| `begin` | | `LAST` | `yyyyMMdd` 或 `LAST` |
| `end` | | `LAST` | `yyyyMMdd` 或 `LAST` |

## 领域 NL 工具

公共参数：

- `question: string` 写成标的加业务问题。
- `lang?: "English" | "中文"` 默认 `"中文"`。
- 调用前移除自然语言字段值中的空格。

### A 股：`stock_data`

| 工具 | 适用场景 | `question` 示例 |
| --- | --- | --- |
| `get_stock_basicinfo` | 公司档案、主营、行业、IPO、上市板 | `"600519.SH公司基本档案"` |
| `get_stock_fundamentals` | 盈利、资产负债、利润、现金流、增长率、银行业专项 | `"贵州茅台2024年ROE和净利润增速"` |
| `get_stock_equity_holders` | 股本、流通、前十大股东、实控人、限售 | `"贵州茅台前十大股东"` |
| `get_stock_events` | IPO、增发、配股、并购、ST、分红 | `"宁德时代2024年增发和并购事件"` |
| `get_stock_technicals` | MACD、KDJ、RSI、BOLL、融资融券、龙虎榜 | `"贵州茅台近60日MACD走势"` |
| `get_risk_metrics` | Beta、Jensen Alpha、波动率、Sharpe、VaR | `"贵州茅台过去1年Beta和波动率"` |

### 港股 / 美股：`global_stock_data`

| 工具 | 适用场景 | `question` 示例 |
| --- | --- | --- |
| `get_global_stock_basicinfo` | 公司档案、注册地、经营范围、交易所、行业、指数成份 | `"AAPL.O公司基本档案"` |
| `get_global_stock_fundamentals` | 财务、PE / PB / PS、历史分位 | `"腾讯(00700.HK)2024年ROE和营收"` |
| `get_global_stock_equity_holders` | 股本、主要股东、机构持仓、限售解禁 | `"腾讯(00700.HK)前十大股东"` |
| `get_global_stock_events` | IPO、增发、配股、并购、监管、分红 | `"腾讯(00700.HK)分红历史"` |
| `get_global_stock_technicals` | 多周期涨跌幅、MACD、KDJ、RSI、BOLL、融资融券 | `"AAPL.O的MACD和RSI"` |
| `get_global_stock_risk_metrics` | Beta、Alpha、波动率、Sharpe、最大回撤、VaR | `"AAPL.O过去1年Beta和波动率"` |

### 基金 / ETF / LOF：`fund_data`

| 工具 | 适用场景 | `question` 示例 |
| --- | --- | --- |
| `get_fund_info` | 基金档案、费率、经理、风格、业绩基准 | `"易方达蓝筹精选(005827.OF)基金档案"` |
| `get_fund_financials` | 利润、净值、收入、费用、分红 | `"005827.OF2024年净利润和分红"` |
| `get_fund_holdings` | 重仓股、资产配置、行业配置 | `"005827.OF最新一期重仓股"` |
| `get_fund_performance` | 业绩、排名、ETF / 二级交易 | `"005827.OF近1年业绩排名"` |
| `get_fund_holders` | 持有人结构、申赎、规模变动 | `"005827.OF持有人结构"` |
| `get_fund_company_info` | 基金管理公司档案、经理团队 | `"易方达基金管理公司档案"` |

### 指数 / 板块：`index_data`

| 工具 | 适用场景 | `question` 示例 |
| --- | --- | --- |
| `get_index_basicinfo` | 指数档案、发布机构、基日、基点、成份数量 | `"沪深300指数档案"` |
| `get_index_fundamentals` | PE / PB / PS、营收、利润、现金流、历史分位 | `"沪深300PE/PB历史分位"` |
| `get_index_technicals` | 多周期涨跌幅、趋向、反趋向、能量、量价、波动 | `"中证500的MACD和RSI"` |

### 债券：`bond_data`

`bond_data` 没有行情快照工具。债券行情和估值请求走 NL 工具。

| 工具 | 适用场景 | `question` 示例 |
| --- | --- | --- |
| `get_bond_basicinfo` | 债券档案、发行、规模、价格、票面利率、期限、兑付 | `"国债2601基本信息"` |
| `get_bond_issuer_info` | 发债主体名称、注册地、行业、股权结构、企业背景 | `"国债2601发债主体"` |
| `get_bond_market_data` | 报价、估价、溢价、久期、凸性、利差 | `"国债2601久期和凸性"` |
| `get_bond_financial_data` | 发债主体营收、利润、资产、负债 | `"国债2601主体2024年营收"` |

## 文档工具

用户询问文档内容或新闻时，优先使用 `financial_docs`。

| 工具 | 适用场景 |
| --- | --- |
| `get_company_announcements` | 官方公告、监管披露、年报、半年报、季报、招股书 |
| `get_financial_news` | 第三方财经新闻、市场报道、政策和政经动态 |

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `query` | 是 | 调用时不含空格的自然语言查询 |
| `top_k` | | 返回文档数量 |

## 宏观工具

宏观和行业 EDB 指标使用 `economic_data.get_economic_data`。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `metricIdsStr` | 是 | 自然语言指标查询，不是指标 ID |
| `beginDate` / `endDate` | | `yyyyMMdd` |
| `freq` | | `日`=`1`, `工作日`=`2`, `周`=`3`, `月`=`4`, `季`=`5`, `半年`=`6`, `年`=`7`, `年度`=`8` |
| `magnitude` | | `个`, `千`, `万`, `百万`, `千万`, `亿`, `十亿`, `百亿`, `千亿`, `万亿` |
| `currency` | | `USD`, `CNY`, `EUR`, `JPY`, `AUD`, `GBP`, `CHF`, `CAD`, `SGD`, `HKD`, `MYR`, `BYR` |
| `searchType` | | `深度`=`0`, `精确`=`1` |
| `ifUnion` | | `开启`=`1`, `不开启`=`2` |

## 通用取数兜底

只有专项路由无法覆盖的结构化取数任务，才使用 `analytics_data.get_financial_data`。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `question` | 是 | 简洁的自然语言取数问题 |
| `lang` | | `CNS`=中文默认，`ENS`=英文 |

规则：

1. 首次调用必须将用户原始问题去除所有空格后传入，不得改写、概括、翻译或增加用户未给出的筛选条件。
2. 只有首次调用失败、返回空数据或明显不匹配请求后，才可改写或拆分 `question`。
3. 一个 analytics 问题只聚焦一个取数动作；复杂分析先拆成简单取数步骤，再综合结果。
4. 若任务需要先发现范围，再对范围内成员二次取数，必须显式分步执行。无法得到可靠范围或后端没有可用排名口径时，停止并说明限制。

## 调用示例

以下示例默认在本 skill 目录下执行。优先把命令工作目录设为 `<skill_dir>`，
再使用 `node scripts/cli.mjs ...`。

```bash
node scripts/cli.mjs call stock_data get_stock_price_indicators '{"windcode":"600519.SH","indexes":"中文简称,最新成交价,涨跌幅,成交量"}'   # indexes 逐字抄 indicators.md
node scripts/cli.mjs call stock_data get_stock_kline '{"windcode":"600519.SH","begin_date":"20260401","end_date":"20260430"}'   # 日期 yyyyMMdd，不带 -
node scripts/cli.mjs call global_stock_data get_global_stock_kline '{"windcode":"00700.HK","begin_date":"20260401","end_date":"20260430"}'
node scripts/cli.mjs call fund_data get_fund_price_indicators '{"windcode":"588200.SH","indexes":"中文简称,最新成交价,IOPV,贴水率"}'
node scripts/cli.mjs call financial_docs get_financial_news '{"query":"美联储利率政策","top_k":5}'   # query 无空格
node scripts/cli.mjs call economic_data get_economic_data '{"metricIdsStr":"中国CPI同比","freq":"月","beginDate":"20240101","endDate":"20261231"}'   # 宏观用 beginDate/endDate
```
