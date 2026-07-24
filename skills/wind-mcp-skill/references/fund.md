# `fund_data` 工具契约

只用于基金、ETF、LOF。参数名称、类型、必填项、默认值和枚举以本文件各工具的契约为准。

- `search_funds` 只用于未指定具体产品的基金筛选。
- `indexes` 逐字取自本文件的「`indexes` 行情指标」。
- 场外基金代码如 `005827.OF`；ETF/LOF 代码如 `588200.SH`、`159915.SZ`。

## 目录

- [工具契约](#工具契约)
- [`indexes` 行情指标](#indexes-行情指标)

<!-- BEGIN MCP TOOLS/LIST GENERATED CONTRACT -->
## 工具契约

### `get_fund_price_indicators`

获取指定场内交易基金（ETF/LOF）某一具体价格指标的最新快照值。需要提供场内交易基金代码和指标名称（如：开盘价、最高价、最低价、收盘价、成交量）。返回单一当前值，而非时间序列。当用户询问一只或多只基金的当前/最新价格或任何单一指标值时，使用此工具。

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `windcode` | 是 | string | — | — | 一个或多个基金名称或者基金代码，如588200.SH。 |
| `indexes` | 否 | string | — | "最新交易日,交易时间,最新成交价,前收盘价,今日开盘价,今日最高价,今日最低价,成交量" | 指标字段，多个字段用英文逗号分隔；可选值见本文件的「`indexes` 行情指标」。 |

### `get_fund_kline`

获取指定场内交易基金（ETF/LOF）在指定日期范围内的日级行情时间序列。每条记录代表一个交易日，包含：开盘价、收盘价、最高价、最低价、成交量、换手率、涨跌幅、均价。当用户需要多日价格历史时，使用此工具。

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `windcode` | 是 | string | — | — | Wind代码，格式如 华夏成长  或 000001.OF，用于标识具体的基金 |
| `begin_date` | 是 | string | — | — | 开始日期：必须显式填写绝对日期，格式 yyyy-MM-dd，如 2026-03-25。 |
| `end_date` | 是 | string | — | — | 结束日期：必须显式填写绝对日期，格式 yyyy-MM-dd，如 2026-03-25。 |
| `count` | 否 | integer | — | — | 为正数表示从begin_date往后取的数据条数；为负数表示从end_date往前取的数据条数 |
| `period` | 否 | string | 1min / 5min / 10min / 15min / 30min / 60min / 120min / 240min / 1d / 1w / 1mo / 1y / 1q / 6mo | "1d" | K 线周期。 |
| `aftype` | 否 | string | — | — | 复权类型：0=前复权，1=后复权，默认0。前复权更常用 |
| `issusp` | 否 | string | — | — | 是否包含停牌数据：0=不包含，1=包含，默认1 |
| `afdate` | 否 | string | — | — | 复权基准日期，格式 yyyy-MM-dd，如 2026-03-25。通常不需要指定。 |

### `get_fund_financials`

获取基金财务报表及分红数据，涵盖利润指标（单季度及合计基金利润、份额利润）、资产价值（净值及总值）、收入明细（利息、投资、公允价值变动）、费用项目（管理费、托管费、销售服务费）、来自财务报表的报告期净值增长率、以及分红数据（分红次数、分红总额、单位分红、分红条款）

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `question` | 是 | string | — | — | This parameter accepts natural language queries about fund financial statement and dividend data. The query should specify: (1) target fund name - Wind code (e.g., '008988.OF') or fund name (e.g., '大成科技创新A', '华夏成长混合', '易方达蓝筹精选'); (2) financial data category - profit metrics (quarterly/aggregate fund profit, per-share profit), asset values (NAV/Net Asset Value, GAV/Gross Asset Value, total asset value, fund share-class AUM), income breakdown (interest income, investment income, fair value change income, other income, total income), expense items (management fee, custodian fee, customer maintenance fee, sales service fee), NAV growth rate (reporting period return), or dividend data (dividend frequency, total dividend amount, per-unit dividend, dividend policy terms). LLM should normalize fund names and infer query scope from context - e.g., '大成科技创新A的费用' implies expense items query; '008988的分红情况' implies dividend data query; 'XX基金的财务数据' implies comprehensive financial statement query. |
| `lang` | 否 | string | zh-CN / en-US | "zh-CN" | 返回语言：zh-CN=简体中文，en-US=英文。 |

### `get_fund_holdings`

获取基金持仓及资产配置明细，涵盖各资产类别构成（股票、债券、权证、存款、其他）及其占净值/总值比例与期间变动、重仓股及扩展指标（占流通股比例、持仓变动、涨跌幅）、多标准行业配置（申万、Wind、中信）、重仓债券持仓、以及重仓基金（FOF）持仓。

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `question` | 是 | string | — | — | This parameter accepts natural language queries about fund portfolio holdings and asset allocation data. The query should specify: (1) target fund name - Wind code (e.g., '008988.OF') or fund name (e.g., '大成科技创新A', '工银产业债A', '华夏行业配置C'); (2) holdings data category - asset class composition (equities, bonds, warrants, deposits, other assets with NAV/GAV ratios and period-over-period changes), top stock holdings with extended metrics (stock code/name, shares held, market value, proportion to NAV/GAV, float proportion, position changes, price performance), sector allocation across multiple standards (SWS/Shenwan, Wind, CITIC industry classifications with sector name, investment value, proportion to NAV), top bond holdings (bond code/name, shares held, market value, proportion to NAV/bond investment), or top fund-of-fund holdings (FOF fund's underlying fund positions with code/name, shares, market value, position changes). LLM should normalize fund names and infer query scope from context - e.g., '大成科技创新A的持仓' implies comprehensive holdings query; '工银产业债A的重仓债券' implies top bond holdings query; 'XX基金的行业配置' implies sector allocation query. |
| `lang` | 否 | string | zh-CN / en-US | "zh-CN" | 返回语言：zh-CN=简体中文，en-US=英文。 |

### `get_fund_company_info`

获取基金管理公司档案、团队及资产配置数据，涵盖公司基本信息（名称、成立日期、注册资本、地址、管理层）、基金经理团队指标（人数、人均管理产品数、任职年限统计、团队成熟度）、公司旗下全部基金的合计管理规模（基金数量、在管规模合计及排名与增长率、非货币规模）、以及公司层面资产配置含股票、债券、基金、权证、存款、其他资产的投资市值及占净值/总值比例。

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `question` | 是 | string | — | — | 基金管理公司基本信息、团队及资产配置数据的自然语言查询 |
| `lang` | 否 | string | zh-CN / en-US | "zh-CN" | 返回语言：zh-CN=简体中文，en-US=英文。 |

### `get_fund_quote`

获取指定场内交易基金（ETF/LOF）在显式日期范围内的分钟级行情时间序列。每条记录代表一分钟，包含：价格、均价、成交量、换手率。当用户需要日内价格走势、逐分钟交易数据或任何日内时间序列数据时，使用此工具。

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `windcode` | 是 | string | — | — | 基金名称或者基金代码，如588200.SH。 |
| `begin_date` | 是 | string | — | — | 查询开始日期，格式 yyyy-MM-dd；不支持隐式默认值。 |
| `end_date` | 是 | string | — | — | 查询结束日期，格式 yyyy-MM-dd；不支持 `LAST` 或隐式默认值。 |

### `get_fund_info`

获取单只或多只基金的基础档案，包含产品识别、分类、成立日期、管理人、基金经理、业绩比较基准等字段。

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `question` | 是 | string | — | — | 查询基金基本档案及产品结构信息，涵盖基金身份（代码、简称、全称）、投资类型与风格、业绩比较基准、费率结构（管理费、托管费、申购费、赎回费）、现任基金经理详情（姓名、任职期限、管理规模、管理基金数）、管理人名称与托管人名称、发行数据（成立日、发行规模、发行对象、发行方式）、以及指数跟踪专项信息（跟踪指数、上市日期、封闭运作期）。例如：查询大成科技创新A基金的基金身份、投资类型、业绩比较基准 |
| `lang` | 否 | string | zh-CN / en-US | "zh-CN" | 返回语言：zh-CN=简体中文，en-US=英文。 |

### `get_fund_holders`

获取基金持有人结构及资金流动数据，涵盖投资者构成（个人与机构持有比例）、持有人户数、申购赎回情况（报告期及单季度份额）、以及持有人口径下的份额总数与期间份额变动率。

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `question` | 是 | string | — | — | This parameter accepts natural language queries about fund shareholder and capital flow data. The query should specify: (1) target fund - full name, abbreviation, or Wind code (e.g., '大成科技创新A', '008988.OF', '华夏成长'); (2) data scope - investor composition (% held by individuals vs. institutions), holder count (number of shareholders), subscription/redemption flows (reporting-period net purchase/redemption volume and single-quarter volume), AUM and share changes (total shares outstanding, period-over-period AUM change with growth rate). LLM should normalize fund names and infer missing context - e.g., 'XX基金的持有人结构' implies investor composition and holder count query; 'XX基金的申购赎回情况' implies subscription/redemption data; 'XX基金规模变动' implies AUM change and growth rate data. |
| `lang` | 否 | string | zh-CN / en-US | "zh-CN" | 返回语言：zh-CN=简体中文，en-US=英文。 |

### `get_fund_performance`

获取基金业绩表现、排名及二级市场交易数据，涵盖多时间维度年化收益率、基于回报的净值增长（复权、累计、区间）、同类排名（按规模、多周期回报、风险调整指标含波动率/跟踪误差/选股能力/选时能力）、ETF/LOF专项指标（折溢价率、IOPV、净流入额、行情价格及成交量）、融资融券余额、以及风险调整业绩指标（年化Alpha、Beta、年化夏普、年化特雷诺、年化信息比率、最大回撤）。

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `question` | 是 | string | — | — | This parameter accepts natural language queries about fund performance, ranking, and secondary market trading data. The query should specify: (1) target fund name - Wind code (e.g., '008988.OF') or fund name (e.g., '大成科技创新A', '华夏成长混合', '易方达蓝筹精选'); (2) performance data category - annualized returns across multiple horizons (1-week, 1-month, 3-month, 6-month, 1-year, 2-year, 3-year, 5-year, 10-year annualized returns), return-based NAV growth (adjusted NAV growth rate, accumulated NAV growth rate, interval NAV growth rate); (3) peer rankings - multi-period return rankings (1-week/1-month/3-month/6-month/1-year/2-year/3-year/5-year/10-year return rankings). NOTE: Size-based ranking and risk-adjusted metric rankings (volatility ranking, tracking error ranking, stock-picking ability ranking, market-timing ability ranking) may require separate queries or are not supported in current API version; (4) ETF/LOF-specific metrics - premium/discount rate (IOPV溢折率), IOPV (Indicative Optimized Portfolio Value), net inflows (区间净流入额), market prices and trading volume (收盘价、成交量); (5) margin trading data - margin balance (融资余额), short balance (融券余额); (6) risk-adjusted performance indicators - annualized Alpha, Beta, annualized Sharpe ratio, annualized Treynor ratio, annualized Information ratio, maximum drawdown. LLM should normalize fund names and infer query scope from context - e.g., '大成科技创新A的业绩' implies comprehensive performance query; 'XX基金的排名' implies multi-period return rankings; 'XX基金的ETF指标' implies ETF/LOF-specific metrics; '008988的风险指标' implies risk-adjusted performance indicators query. IMPORTANT: When user requests '同类排名', focus on multi-period return rankings. If user specifically requests size ranking or risk-adjusted metric rankings (volatility/tracking error/stock-picking/market-timing ability rankings), inform user that these rankings may need separate queries through other tools. |
| `lang` | 否 | string | zh-CN / en-US | "zh-CN" | 返回语言：zh-CN=简体中文，en-US=英文。 |

### `search_funds`

从全市场基金中筛选符合条件的基金产品，返回基金代码列表。适用于用户未指定具体基金、而是描述筛选条件的场景。

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `question` | 是 | string | — | "筛选股票型基金中近一年收益率超20%的产品" | 自然语言基金筛选问句，描述筛选条件（如基金类型、收益率、管理规模等），返回符合条件的基金代码列表。例：筛选股票型基金中近一年收益率超20%的产品 |
| `lang` | 否 | string | zh-CN / en-US | "zh-CN" | 返回语言：zh-CN=简体中文，en-US=英文。 |
<!-- END MCP TOOLS/LIST GENERATED CONTRACT -->

<!-- BEGIN DOMAIN INDICATORS -->
## `indexes` 行情指标

仅供 `get_fund_price_indicators` 使用。只选择用户明确请求的字段，逐字复制；多个字段用英文逗号连接。表内没有的字段不得猜测。

### 基础行情与元信息

`最新交易日`、`交易时间`、`中文简称`、`最新成交价`、`前收盘价`、`今日开盘价`、`今日最高价`、`今日最低价`、`最新均价`、`涨跌`、`涨跌幅`、`5分钟涨跌幅`、`成交量`、`成交额`、`现量`、`现额`、`交易状态`、`上市日期`、`流通份额`

### 盘口、成交与流动性

`买一价`、`买二价`、`买三价`、`买四价`、`买五价`、`卖一价`、`卖二价`、`卖三价`、`卖四价`、`卖五价`、`买一量`、`买二量`、`买三量`、`买四量`、`买五量`、`卖一量`、`卖二量`、`卖三量`、`卖四量`、`卖五量`、`报买方`、`报卖方`、`外盘`、`内盘`、`成交笔数`、`日成交量`、`日成交额`、`近1分钟成交额`、`近3分钟成交额`、`近5分钟成交额`、`近7日平均成交额`、`换手率`、`量比`、`委比`、`振幅`、`基于Wind算法的量比`

### 净值、规模与状态

`最新净值`、`上期净值`、`累计净值`、`最新净值增长率`、`年初以来净值增长率`、`成立以来净值增长率`、`近一周净值增长率`、`近一月净值增长率`、`近一季净值增长率`、`近半年净值增长率`、`近一年净值增长率`、`近两年净值增长率`、`近三年净值增长率`、`近五年净值增长率`、`贴水率`、`基金最新份额`、`申购状态`、`整体溢价率`、`基金综合评级`、`基金规模`、`七日年化收益率`、`万份基金收益`、`IOPV`

### 多周期与技术指标

`5日涨跌幅`、`10日涨跌幅`、`20日涨跌幅`、`60日涨跌幅`、`120日涨跌幅`、`250日涨跌幅`、`年初至今涨跌幅`、`上市以来涨跌幅`、`收盘涨跌`、`收盘涨跌幅(%)`、`近3年涨跌幅`、`近5年涨跌幅`、`近10年涨跌幅`、`近20年涨跌幅`、`近30年涨跌幅`

`指数平滑异同移动平均`、`DIF快线`、`随机指标K值`、`随机指标D值`、`随机指标J值`、`6周期相对强弱指标`、`12周期相对强弱指标`、`抛物线转向指标`、`布林中轨`、`布林上轨`、`布林下轨`、`5周期移动平均`、`10周期移动平均`、`20周期移动平均`、`60周期移动平均`、`120周期移动平均`、`250日均线`、`连续上涨天数`、`5日乖离率`、`36日乖离`、`14周期顺势指标`、`26周期能量指标`、`12周期心理线指标`、`近1分钟涨跌幅`、`近3分钟涨跌幅`、`MACD多头金叉信号`、`MACD空头死叉信号`

### 资金流向与盘前盘后

`连红天数`、`当日主力净流入额`、`当日主力净流入占比`、`近5日主力净流入额`、`近5日主力净流入占比`、`近5日主力净流入天数`、`近10日主力净流入额`、`近10日主力净流入占比`、`近10日主力净流入天数`、`近20日主力净流入额`、`近20日主力净流入占比`、`近20日主力净流入天数`、`近60日主力净流入额`、`近60日主力净流入占比`、`近60日主力净流入天数`

`火箭发射`、`高台跳水`、`涨停封板`、`跌停封板`、`涨停开板`、`跌停开板`、`涨幅达到3%`、`跌幅达到3%`、`创20日新高`、`创20日新低`、`主力挂单买入`、`主力挂单卖出`、`主力撤单买入`、`主力撤单卖出`

`盘前最新价`、`盘前涨跌额`、`盘前涨跌幅`、`盘前成交额`、`盘前涨速`、`盘后最新价`、`盘后涨跌幅`
<!-- END DOMAIN INDICATORS -->
