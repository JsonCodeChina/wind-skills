# `fund` 工具契约 —— 基金投研

> 由 `scripts/registry.json` 生成（vserver_fund_research，21 个工具 / 68 个参数）。
> 参数名、类型、枚举和必填项**以本文件为准**，不要凭记忆填；本地 CLI 会按同一份 schema 拦截不合法入参。

**覆盖**：公募基金与 ETF 的档案、净值、规模、业绩、申赎状态、财务；资产/行业/券种配置与股票、债券、基金持仓明细；Brinson 归因、多因子收益归因、风格暴露、选股择时能力；相似基金、ETF 申赎清单、自然语言选基。

## 调用要点

- **两类入参风格，别混用**：批量档案类（`fund_get_basic_info` / `nav` / `size` / `performance` / `financials` / `purchase_redemption_status` / `listed_historical_price`）用 `windCodes`（**数组**）；单基金分析类（持仓、配置、归因、风格、相似基金、PCF）用 `windCode`（**字符串**）。
- 持仓与配置类工具的 `reportDate` 是**必填**，格式 `YYYY-MM-DD`，通常填季末（如 `2026-06-30`）；填非报告期日期时后端返回「截至该日可获得的最新一期」，不会报错。
- `fund_screener` 的自然语言字段是 **`query`**，不是 `question`——这是七个 server 里唯一的例外。
- 归因类必须给基准：`fund_get_brinson_attribution` 用 `benchCode`，`fund_get_return_attribution` 用 `benchmarkWindCode`，两者字段名不同。
- `fund_get_selection_timing_analysis` 只覆盖部分主动管理基金；被动指数、货币、未覆盖样本会返回「Wind 数据源当前不可用，请稍后重试」——**这是覆盖缺失的误导文案，重试无用**，应改为向用户说明该基金无评价数据。

## 工具目录

| 工具 | 用途 | 入参 |
| --- | --- | --- |
| [`fund_get_similar_funds`](#fund_get_similar_funds) | 根据基金代码查询基金的相似基金信息，寻找同类可比基金候选。 | **windCode**, startDate, endDate, onlyValid |
| [`fund_get_brinson_attribution`](#fund_get_brinson_attribution) | 根据基金代码、比较基准和分析区间查询指定基准的 Brinson 归因分析。 | **windCode**, **benchCode**, reportDate, heldFundType, queryMode, industryStandard |
| [`fund_get_style_analysis`](#fund_get_style_analysis) | 根据基金代码和分析区间查询基金风格暴露分析数据，可指定风格或使用默认组合。 | **windCode**, startDate, endDate, cycle, indexs |
| [`fund_get_return_attribution`](#fund_get_return_attribution) | 根据基金代码、基准及分析区间查询基金多因子模型分析结果，分析基金收益变化的主要因子来源。 | **windCode**, **benchmarkWindCode**, **startDate**, **endDate**, modelType, cycle, marketIndex, riskRate, marketStyle, includeComponents |
| [`fund_get_selection_timing_analysis`](#fund_get_selection_timing_analysis) | 根据基金代码和分析区间查询基金主动管理能力分析结果，评估选股能力、择时能力和综合主动管理能力。 | **windCode**, year, date |
| [`fund_get_asset_allocation`](#fund_get_asset_allocation) | 查询基金在指定日期可获取的最新资产配置数据。 | **windCode**, **reportDate** |
| [`fund_get_industry_allocation`](#fund_get_industry_allocation) | 根据基金代码和报告期查询基金行业配置结构及行业分析数据。 | **windCode**, **reportDate**, classificationType |
| [`fund_get_bond_type_allocation`](#fund_get_bond_type_allocation) | 根据基金代码和指定日期查询截至该日可获得的最新债券券种结构。 | **windCode**, **reportDate** |
| [`fund_get_equity_holdings`](#fund_get_equity_holdings) | 根据基金代码和报告期查询基金全部股票持仓明细。 | **windCode**, **reportDate**, industryType |
| [`fund_get_top_equity_holdings`](#fund_get_top_equity_holdings) | 根据基金代码和报告期查询基金披露的重仓股票持仓明细。 | **windCode**, **reportDate**, industryType |
| [`fund_get_bond_holdings`](#fund_get_bond_holdings) | 根据基金代码和报告期查询基金披露的重仓债券持仓信息。 | **windCode**, **reportDate** |
| [`fund_get_top_fund_holdings`](#fund_get_top_fund_holdings) | 根据基金代码和报告期查询组合中重仓持有的其他公募基金明细，适用于 FOF、MOM 及其他持有公募基金的基金产品。 | **windCode**, **reportDate** |
| [`fund_get_etf_pcf`](#fund_get_etf_pcf) | 查询某只 ETF 在指定日期的申购赎回成分证券及现金替代参数。 | **windCode**, **asOfDate** |
| [`fund_get_basic_info`](#fund_get_basic_info) | 获取单只或多只基金的基础档案，包含产品识别、分类、成立日期、管理人、基金经理和业绩比较基准等字段。 | **windCodes**, includeFields |
| [`fund_get_nav`](#fund_get_nav) | 获取单只或多只基金截至指定查询日期可取得的时点单位净值。 | **windCodes**, asOfDate, includeFields |
| [`fund_get_purchase_redemption_status`](#fund_get_purchase_redemption_status) | 获取单只或多只基金最新的交易和申赎状态。 | **windCodes**, includeFields |
| [`fund_get_performance`](#fund_get_performance) | 根据基金代码和分析区间查询基金业绩表现及风险评价数据。 | **windCodes**, includeFields, asOfDate, benchmarkWindCode |
| [`fund_get_listed_historical_price`](#fund_get_listed_historical_price) | 根据基金代码和指定交易日查询基金交易行情及市场交易数据。 | **windCodes**, includeFields, tradeDate |
| [`fund_get_size`](#fund_get_size) | 根据基金代码和指定日期或报告期查询基金规模信息。 | **windCodes**, includeFields, asOfDate |
| [`fund_get_financials`](#fund_get_financials) | 根据基金代码和报告期查询基金财务报表相关的产品级数据。 | **windCodes**, includeFields, reportPeriod |
| [`fund_screener`](#fund_screener) | 根据自然语言问句，从公募基金及 ETF 等基金市场识别基金实体、预定义指标及筛选条件，支持按基金规模、净值表现、收益风险等指标，以及基金类型、基金管理人、基金经理、跟踪指数、投资主题、行业方向等分类条件组合反查基金，返回标准化基金数据或符合条件的基金代码列表。 | **query** |

_加粗为必填。_

## 工具契约

### `fund_get_similar_funds`

- **功能**：根据基金代码查询基金的相似基金信息，寻找同类可比基金候选。
- **适用场景**：用于寻找同类产品，比较候选基金的相似度得分、成立日期、规模、评级、申赎状态和基金经理等基本信息；已确定目标基金后再进行比较。
- **返回**：返回同类可比基金列表及上述基本字段；查询基金自身从候选中剔除，候选不足时按实际可用数量返回，字段缺失单独说明。
- **边界**：相似度结果用于筛选同类候选，不等同于业绩、评级或风险结论；无法判断查询目的时先按基金数据类别选择相应能力。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `startDate` | 否 | string | — | — | 开始日期 YYYY-MM-DD；省略时按 endDate 往前一年；不得晚于 endDate。 |
| `endDate` | 否 | string | — | — | 截止日期 YYYY-MM-DD；省略时用调用当天。 |
| `onlyValid` | 否 | boolean | — | 默认 `true` | 控制相似度分析报表是否只展示初始基金。 |

样例：`{"windCode":"510300.OF"}`

### `fund_get_brinson_attribution`

- **功能**：根据基金代码、比较基准和分析区间查询指定基准的 Brinson 归因分析。
- **适用场景**：用于分析资产配置效应、行业或板块选择效应和交互效应；核对基金与基准在各行业或板块的配置差异、收益差异及超额收益来源。
- **返回**：返回行业或板块、基金与基准权重和收益、差异项，以及配置、选择、交互效应和归因贡献；标注分析区间、持仓范围和行业分类口径。
- **边界**：比较基准、区间和持仓口径必须保持一致；结果适合与行业配置、基金净值因子和业绩表现结合核对，不替代其中任一单项数据；不适用于单只证券明细或未指定基准的收益判断。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `benchCode` | 是 | string | — | 默认 `"000001.SH"` | 比较基准 Wind 代码（指数或基金）；默认 000001.SH。 |
| `reportDate` | 否 | string | — | — | 查询报告期（季度末）YYYY-MM-DD；省略时取最新报告期（输出 reportDateDefaulted=true）。 |
| `heldFundType` | 否 | string | `1` / `2` | 默认 `"1"` | 持仓模式，1=全部持股（默认，中报/年报）/ 2=重仓持股（季报）。 |
| `queryMode` | 否 | string | `1` / `2` | 默认 `"2"` | 查询模式，1=当前报告期区间 / 2=下一季度区间（默认）。 |
| `industryStandard` | 否 | string | `0` / `1` / `2` / `3` / `5` | 默认 `"2"` | 行业分类标准，0=证监会 / 1=申万一级 / 2=万得一级（默认）/ 3=中信一级 / 5=申万一级2021。 |

样例：`{"windCode":"510300.OF","benchCode":"000300.SH","reportDate":"2026-06-30"}`

### `fund_get_style_analysis`

- **功能**：根据基金代码和分析区间查询基金风格暴露分析数据，可指定风格或使用默认组合。
- **适用场景**：用于查看月度或季度风格暴露变化、最新一期主导风格、各风格暴露占比和拟合优度；默认关注大盘价值、大盘成长、小盘价值、小盘成长和债券现金五类。
- **返回**：返回各周期末的风格暴露、各风格占比和拟合优度，并标注实际日期、分析频率和缺失周期；最新一期暴露可用于识别主导风格。
- **边界**：风格暴露是模型分析结果，不等同于实际持仓明细或净值收益归因；可与持仓结构和多因子结果交叉核对，分析频率和区间应保持一致；拟合不足或缺期时不作延伸判断。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `startDate` | 否 | string | — | — | 开始日期 YYYY-MM-DD；省略时按 endDate 前推 1 年。 |
| `endDate` | 否 | string | — | — | 截止日期YYYY-MM-DD；省略时用调用当天。 |
| `cycle` | 否 | string | `monthly` / `quarterly` | 默认 `"monthly"` | 分析周期 monthly（默认）/ quarterly；不支持 weekly/daily/yearly。 |
| `indexs` | 否 | array | — | — | 风格指数 Wind 代码列表，留空用默认 5 个（大盘价值/大盘成长/小盘价值/小盘成长/中债总财富）；支持自定义任意 Wind 风格指数代码，最多 50 个。 |

样例：`{"windCode":"510300.OF","startDate":"2025-09-01","endDate":"2026-09-01"}`

### `fund_get_return_attribution`

- **功能**：根据基金代码、基准及分析区间查询基金多因子模型分析结果，分析基金收益变化的主要因子来源。
- **适用场景**：用于查看基金相对市场、规模、价值、盈利、投资等因子的敏感度，核对主动收益分解、区间收益贡献和风险贡献。
- **返回**：返回模型口径、各因子敏感度、主动收益分解、区间收益贡献、风险贡献及因子模型对基金收益的拟合优度；实际区间与所选基准单独标明。
- **边界**：模型因子只覆盖所选模型纳入的因子，不等同于行业持仓归因；应与基金相对基准表现和行业配置结果按同一期间交叉核对；缺少基准或模型条件时只返回可计算部分。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `benchmarkWindCode` | 是 | string | — | 默认 `"510300BI.WI"` | 基准 Wind 代码（指数或基金），例如 510300BI.WI。 |
| `startDate` | 是 | string | — | — | 开始日期，格式 YYYY-MM-DD；必须 ≤ endDate。应根据分析周期和因子模型设置合理的分析区间，确保区间内有足够的有效样本，否则可能无法完成归因分析。 |
| `endDate` | 是 | string | — | — | 截止日期YYYY-MM-DD；必填。 |
| `modelType` | 否 | string | `capm` / `ff3` / `ff4` / `ff5` / `ff6` | 默认 `"ff5"` | 因子模型 capm / ff3 / ff4 / ff5（默认）/ ff6；模型不含的因子项返回 null。 |
| `cycle` | 否 | string | `weekly` / `monthly` / `quarterly` / `yearly` / `daily` | 默认 `"weekly"` | 分析周期 weekly / monthly / quarterly / yearly / daily（默认）。 |
| `marketIndex` | 否 | string | — | 默认 `"881001.WI"` | MKT 计算用的市场指数 Wind 代码，默认 881001.WI（万得全A）。 |
| `riskRate` | 否 | string | `1` / `2` / `3` / `4` / `5` / `6` / `7` / `8` | 默认 `"2"` | 无风险收益类型 1=一年定存税前 / 2=一年定存税后（默认）/ 3=一年期国债 / 4=央票 / 5=银行间七日回购 / 6=五年定存税前 / 7=零 / 8=十年定存税前。 |
| `marketStyle` | 否 | string | `0` / `1` / `2` / `3` | 默认 `"0"` | 风格因子口径 0=Wind 因子库（默认）/ 1=中信标普 / 2=申万 / 3=巨潮。 |
| `includeComponents` | 否 | array | — | 默认 `[]` | 组件开关数组，留空返回标准 4 类（factor_exposure/fit/return_decomposition/risk_decomposition），含 correlation 时追加因子相关系数。 |

样例：`{"windCode":"510300.OF","benchmarkWindCode":"000300.SH","startDate":"2025-09-01","endDate":"2026-09-01"}`

### `fund_get_selection_timing_analysis`

- **功能**：根据基金代码和分析区间查询基金主动管理能力分析结果，评估选股能力、择时能力和综合主动管理能力。
- **适用场景**：用于查看主动管理能力得分、同类排名、同类分位，比较基金主动管理能力与同类平均水平。
- **返回**：返回选股、择时及综合能力指标或得分、同类排名、分位情况、同类平均水平和比较差异，并标注统计区间、同类样本数和数据状态。
- **边界**：该结果依赖成立年限、分析区间和同类样本；样本不足时按不适用或未计算表达，不以底层异常替代业务状态；可与区间业绩和净值因子结果结合，但不单独形成交易结论。

> ⚠ **已知问题**：仅部分基金有评价数据；被动指数/货币/未覆盖样本返回「Wind 数据源当前不可用，请稍后重试」（误导文案，重试无用）。已验证可用样本：000001.OF、005827.OF

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "000001.OF" 或 "华夏成长"。 |
| `year` | 否 | string | `1` / `2` / `3` / `5` | 默认 `"3"` | 诊断周期 1=近1年 / 2=近2年 / 3=近3年（默认）/ 5=近5年。 |
| `date` | 否 | string | — | — | 统计日期 YYYY-MM-DD；必须为真实月末日期；省略时用最近月末。 |

样例：`{"windCode":"000001.OF","year":"3"}`

### `fund_get_asset_allocation`

- **功能**：查询基金在指定日期可获取的最新资产配置数据。
- **适用场景**：用于查看股票、债券、基金、权证、现金及其他资产占基金净值的比例，并比较各类资产占比与上一报告期的变化。
- **返回**：返回资产类别、占基金净值比例、相较上一报告期的变动、实际披露日期和报告期；未持有、未披露与数据缺失分开表达。
- **边界**：这是报告期资产结构，不替代行业或单只证券持仓；比较变化时应使用相邻披露期，并与规模和持仓合计按同一报告期核对；指定日期无可用披露时说明实际日期。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `reportDate` | 是 | string | — | — | 查询报告期（季度末）YYYY-MM-DD；返回该日期前最近一期已披露报告。 |

样例：`{"windCode":"510300.OF","reportDate":"2026-06-30"}`

### `fund_get_industry_allocation`

- **功能**：根据基金代码和报告期查询基金行业配置结构及行业分析数据。
- **适用场景**：查看行业持仓市值、占基金净值比例、占股票投资市值比例及上期变化；支持申万、中信、AMAC、GICS、证监会、国证等分类，QDII可按 GICS 查询。
- **返回**：返回行业代码/名称、持仓市值、两种占比及变化、行业同类平均占比、行业指数收益率和行业 PE，标注分类标准、分母和报告期。
- **边界**：两种占比的分母不能混用；可与全部股票持仓及相对基准的行业归因结合核对，但不返回单只股票明细；更换分类标准或报告期后，行业代码和同类平均值不可直接横比。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `reportDate` | 是 | string | — | — | 查询报告期（季度末）YYYY-MM-DD；返回该日期前最近一期已披露报告期。 |
| `classificationType` | 否 | string | `3` / `4` / `5` / `6` / `10` / `11` | 默认 `"5"` | 行业分类标准，省略时 QDII 返回 GICS、非 QDII 默认 5（万得一级）；显式传入按指定分类返回。可选 3=中信一级 / 4=中信二级 / 5=万得一级（默认）/ 6=万得二级 / 10=申万一级2021 / 11=申万二级2021。 |

样例：`{"windCode":"510300.OF","reportDate":"2026-06-30"}`

### `fund_get_bond_type_allocation`

- **功能**：根据基金代码和指定日期查询截至该日可获得的最新债券券种结构。
- **适用场景**：用于查看国债、金融债、企业债、可转债、同业存单等券种占债券投资市值的比例，并比较各券种占比与上一报告期的变化。
- **返回**：返回券种、占债券投资市值比例、相较上一报告期的变动、实际披露日期和债券投资分母；无债券时返回合法空或不适用状态。
- **边界**：券种比例的分母是债券投资市值，不与基金净值或全部资产比例混用；可与债券明细和资产配置按同一报告期核对；当前值或上期值缺失时不计算变化。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "000003.OF" 或 "华夏聚利A"。 |
| `reportDate` | 是 | string | — | — | 截止日期（季度末）YYYY-MM-DD；返回该日期前最近一期已披露报告。 |

样例：`{"windCode":"510300.OF","reportDate":"2026-06-30"}`

### `fund_get_equity_holdings`

- **功能**：根据基金代码和报告期查询基金全部股票持仓明细。
- **适用场景**：用于查看股票代码、名称、持股数量、持仓市值、占基金净值比例、占股票投资市值比例和相较上一报告期的持仓增减变化；在可取得时查看区间涨跌幅、行业、上市地和所属国家。
- **返回**：返回每只股票的持仓字段及全部股票持仓合计，包括总持仓市值、占基金净值比例等汇总指标，并标注报告期和缺失字段。
- **边界**：这是已披露报告期的持仓明细，不代表报告期之间的实时仓位；可与前十大重仓、行业配置和归因结果按同一报告期组合核对，行业标准或报告期不同不能直接比较。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `reportDate` | 是 | string | — | — | 查询报告期（季度末）YYYY-MM-DD；返回该日期前最近一期已披露报告期。 |
| `industryType` | 否 | string | `2` / `3` / `4` / `5` / `6` / `7` / `8` / `10` …（共 9 项，用 describe 看全） | 默认 `"7"` | 行业分类口径，默认 7=Wind 一级；可选 2=中信一级 / 3=中信二级 / 4=AMAC / 5=GICS一级 / 6=GICS二级 / 7=Wind一级 / 8=Wind二级 / 10=申万2021一级 / 11=申万2021二级。 |

样例：`{"windCode":"510300.OF","reportDate":"2026-06-30"}`

### `fund_get_top_equity_holdings`

- **功能**：根据基金代码和报告期查询基金披露的重仓股票持仓明细。
- **适用场景**：用于查看前十大重仓股票、持股数量、持仓市值、占基金净值比例、占股票投资市值比例，以及相较上一报告期的持仓变化、占流通股比例和连续重仓期数。
- **返回**：返回重仓股票代码、名称、数量、市值、占比、变化、行业、最早重仓日期、重仓报告期数、持仓分位和十大股东标记；报告期和缺失原因单独标注。
- **边界**：重仓结果是已披露持仓中的重点子集，不等同于全部股票持仓或实际控制关系；可与全部股票明细、行业结构和持仓变化组合核对，报告期与行业标准必须一致。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "510300.OF" 或 "华夏成长"。 |
| `reportDate` | 是 | string | — | — | 查询报告期（季度末）YYYY-MM-DD；返回该日期前最近一期已披露报告期。 |
| `industryType` | 否 | string | `0` / `1` / `2` / `3` / `4` / `5` / `6` / `7` …（共 12 项，用 describe 看全） | 默认 `"7"` | 行业分类标准，默认 7=万得一级；可选 0=证监会 / 1=申万一级 / 2=申万二级 / 3=申万三级 / 4=中信一级 / 5=中信二级 / 6=中信三级 / 7=万得一级 / 8=万得二级 / 9=万得三级 / 10=国证一级 / 11=国证二级。 |

样例：`{"windCode":"510300.OF","reportDate":"2026-06-30"}`

### `fund_get_bond_holdings`

- **功能**：根据基金代码和报告期查询基金披露的重仓债券持仓信息。
- **适用场景**：用于查看债券代码、名称、持仓市值、占基金净值比例、债券类型、债项或主体等级，以及违约、城投、永续等信用风险标签。
- **返回**：返回每只重仓债券的上述明细及相较上一报告期的持仓变化；普通基金没有债券持仓时按合法空或不适用表达，不把无记录当作系统故障。
- **边界**：重仓债券只代表披露的重点券种，不等同于全部债券资产或券种结构；可与债券券种结构和资产配置按同一报告期核对，信用标签缺失时保持空值。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "000003.OF" 或 "华夏聚利A"。 |
| `reportDate` | 是 | string | — | — | 查询报告期（季度末）YYYY-MM-DD；返回该日期前最近一期已披露报告期。 |

样例：`{"windCode":"000001.OF","reportDate":"2026-06-30"}`

### `fund_get_top_fund_holdings`

- **功能**：根据基金代码和报告期查询组合中重仓持有的其他公募基金明细，适用于 FOF、MOM 及其他持有公募基金的基金产品。
- **适用场景**：用于分析 FOF 或 MOM 的持基结构，查看被持基金代码、名称、持有市值、持有份额、占基金净值比例和占持基市值比例。
- **返回**：返回被持基金明细及相较上一报告期的持基变化；普通基金不适用时明确标记，适用基金无记录时返回合法空结果。
- **边界**：只覆盖组合持有的其他公募基金，不替代股票或债券持仓；应结合产品类型判断“不适用”和“无记录”，两期口径一致时再比较持基变化。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "005156.OF" 或 "嘉实领航资产配置A"。 |
| `reportDate` | 是 | string | — | — | 查询报告期（季度末）YYYY-MM-DD；返回该日期前最近一期已披露报告期。 |

样例：`{"windCode":"005220.OF","reportDate":"2026-06-30"}`

### `fund_get_etf_pcf`

- **功能**：查询某只 ETF 在指定日期的申购赎回成分证券及现金替代参数。
- **适用场景**：用于核对成分证券 Wind 代码、名称和申赎数量，查看现金替代类型、现金替代比例及固定替代金额。
- **返回**：返回成分证券及申赎参数，并区分请求日期和实际公告日期；未取得指定日期清单时标识实际日期、回退情况或不适用状态。
- **边界**：这是 ETF 申赎清单，不替代单日行情或技术指标；清单估值或申赎核对时应与同日行情及基金身份信息结合，实际公告日与请求日不一致时按实际公告日解释。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 单只基金代码或基金名称，例如 "510300.OF" 或 "中证500ETF南方"。 |
| `asOfDate` | 是 | string | — | — | PCF 公告日期 YYYY-MM-DD；返回该日期前最近一期已披露的 PCF。 |

样例：`{"windCode":"510300.SH","asOfDate":"2026-09-03"}`

### `fund_get_basic_info`

- **功能**：获取单只或多只基金的基础档案，包含产品识别、分类、成立日期、管理人、基金经理和业绩比较基准等字段。
- **适用场景**：用于确认基金代码与简称，查看基金分类、成立日期、管理人、现任基金经理、业绩比较基准及按需档案字段。
- **返回**：返回每只基金的识别信息和基础档案；自然名称无法唯一匹配时返回候选或歧义状态，不静默选取其他基金。
- **边界**：基础档案适合作为后续净值、规模、持仓和业绩查询的实体入口，不包含这些专题数据；名称或代码无法唯一匹配时先确认基金主体，再进行后续查询。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCodes` | 是 | array | — | — | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `includeFields` | 否 | array | — | — | 指定需要返回的字段助记符列表，留空返回默认字段包（成立日/投资类型/管理人/基金经理/业绩基准）；可选 f_info_setupdate=基金成立日 / f_info_investtype=投资类型(二级分类) / f_info_mgrcomp=基金管理人 / f_info_fundmanager=基金经理(现任) / f_info_benchmark=业绩比较基准 / f_info_fullname=基金全称 / f_info_code=基金代码 / f_info_frontendcode=基金前端代码 / f_info_backendcode=基金后端代码 / s_info_isincode=ISIN代码 / f_info_firstinvesttype=投资类型(一级分类) / f_info_type=基金类型 / f_style_marketvaluestyleattribute=市值-风格属性 / f_info_investmentregion=投资区域 / f_info_maturitydate_2=基金到期日 / f_info_loflisteddate=上市日期 / f_info_exchmarket=基金上市地点 / f_info_minholdingperiod=基金最短持有期 / f_info_t0ornot=是否T+0交易 / f_info_custodianbank=基金托管人 / f_info_foreigninvestmentadvisor=境外投资顾问 / f_info_foreigncustodian=境外托管人 / f_info_investobject=投资目标 / f_info_investscope=投资范围 / f_info_investstrategy2=基金投资策略 / f_info_investingregiondescription=主要投资区域说明 / f_info_managementfeeratio=管理费率 / f_info_custodianfeeratio=托管费率 / f_info_salefeeratio=销售服务费率 / f_info_purchasefeeratio=最高申购费率 / f_info_redemptionfeeratio=最高赎回费率 / f_info_relatedcode=关联基金代码；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |

样例：`{"windCodes":["510300.OF","000001.OF"]}`

### `fund_get_nav`

- **功能**：获取单只或多只基金截至指定查询日期可取得的时点单位净值。
- **适用场景**：用于查看单位净值、复权或累计单位净值、净值日期和币种；货币基金可查看万份收益和 7 日年化收益率，并按需展开公布类型。
- **返回**：返回基金代码、名称、实际净值日期、单位净值及按需字段；查询截止日与实际净值所属日期分开标注。
- **边界**：仅返回时点值，不提供历史或区间净值序列、分红拆分折算、区间收益、排名评级、风险指标、规模份额、场内行情或申赎状态；与规模勾稽时必须使用同一实际净值日，区间计算需另取历史数据。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCodes` | 是 | array | — | — | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `asOfDate` | 否 | string | — | — | 截止日期 YYYY-MM-DD；不传用调用当天；实际净值日期以 f_nav_date2 为准，不一定等于截止日。 |
| `includeFields` | 否 | array | — | — | 指定字段助记符列表，留空返回默认净值字段包（单位净值/复权净值/累计净值/净值日期/币种/公布类型等）；可选 f_nav_date2=基金净值日期 / f_nav_unit=单位净值 / f_nav_adjusted=复权单位净值 / fund_navcur=单位净值币种 / f_nav_publishtype=基金净值公布类型 / f_nav_accumulated=累计单位净值 / f_mmf_unityield=万份基金单位收益 / f_mmf_annualizedyield=7日年化收益率；货币基金可请求万份收益/7日年化；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |

样例：`{"windCodes":["510300.OF","000001.OF"],"asOfDate":"2026-09-03"}`

### `fund_get_purchase_redemption_status`

- **功能**：获取单只或多只基金最新的交易和申赎状态。
- **适用场景**：用于查看合并申赎状态，必要时展开申购状态、赎回状态、大额申购限额、场内交易状态、暂停或恢复运作日，以及定开基金封闭与开放日。
- **返回**：返回每只基金的申赎及交易状态和相关日期；只返回可用状态，不支持按日期查询历史状态，并标注当前状态更新时间。
- **边界**：只反映最新可取得状态，不提供历史状态、申赎费率、申赎清单、场内行情或基金基础档案；判断某一日期的交易资格时需结合状态生效日期和产品类型，不能用当前状态回填历史。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCodes` | 是 | array | — | — | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `includeFields` | 否 | array | — | — | 指定字段助记符列表，留空返回默认申赎状态字段包（申购赎回状态 + 申购/赎回状态 + 交易状态 + 大额申购限额等）；可选 f_dq_status=申购赎回状态 / f_info_pchmstatus=申购状态 / f_info_redmstatus=赎回状态 / f_pchredm_largepchmaxamt=单日大额申购限额 / s_dq_tradestatus=交易状态 / f_info_date_suspension=基金暂停运作日 / f_info_date_resumption=基金恢复运作日 / f_info_startdateofclosure=定开基金封闭起始日 / f_info_lastopenday=定开基金上一开放日 / f_info_expectedendingday=预计封闭期结束日 / f_info_expectedopenday=预计下期开放日；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |

样例：`{"windCodes":["510300.OF","000001.OF"]}`

### `fund_get_performance`

- **功能**：根据基金代码和分析区间查询基金业绩表现及风险评价数据。
- **适用场景**：用于查看不同区间收益、同类排名和 Wind 评级，比较波动率、回撤、下行风险及 Sharpe、信息比率、Alpha、Beta 等风险调整收益指标。
- **返回**：返回收益、同类排名、Wind 评级、风险指标和风险调整收益指标，并标注统计区间、截止日、年化口径和基准；缺失与不适用分开表达。
- **边界**：各收益和风险指标必须按同一截止日、频率、年化方式和基准解释；可与单位净值、主动管理和因子分析组合核对，但本结果只描述历史统计，不延伸为交易判断。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCodes` | 是 | array | — | — | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `includeFields` | 否 | array | — | — | 字段助记符列表，留空返回默认包（10 收益+8 排名+2 评级+12 风险三窗口）；可选 f_return_1w=近1周回报 / f_return_1m=近1月回报 / f_return_3m=近3月回报 / f_return_6m=近6月回报 / f_return_1y=近1年回报 / f_return_2y=近2年回报 / f_return_3y=近3年回报 / f_return_5y=近5年回报 / f_return_ytd=今年以来回报 / f_return_std=成立以来回报 / f_nav_periodreturnranking_1w=近1周回报排名 / f_nav_periodreturnranking_1m=近1月回报排名 / f_nav_periodreturnranking_3m=近3月回报排名 / f_nav_periodreturnranking_6m=近6月回报排名 / f_nav_periodreturnranking_1y=近1年回报排名 / f_nav_periodreturnranking_3y=近3年回报排名 / f_nav_periodreturnranking_5y=近5年回报排名 / f_nav_periodreturnranking_ytd=今年以来回报排名 / f_rating_wind3y=Wind3年评级 / f_rating_wind5y=Wind5年评级 / f_risk_stdevyearly=年化波动率 / f_risk_maxdownside=最大回撤 / f_risk_maxdownside_recoverdays=最大回撤恢复天数 / f_risk_downsiderisk=下行风险 / f_risk_annutrackerror_index=跟踪误差(跟踪指数,年化) / f_risk_sharpe=Sharpe / f_risk_inforatio=信息比率 / f_risk_treynor=Treynor / f_risk_sortino=Sortino / f_risk_calmar=Calmar / f_risk_alpha=Alpha_FUND / f_risk_beta=Beta_FUND；f_risk_*（除评级）自动展开近1/3/5年窗口；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |
| `asOfDate` | 否 | string | — | — | 截止日期 YYYY-MM-DD；非交易日回溯至前一交易日；不传用最近交易日。 |
| `benchmarkWindCode` | 否 | string | — | 默认 `"000300.SH"` | 风险调整字段基准指数，默认 000300.SH。 |

样例：`{"windCodes":["510300.OF","000001.OF"],"asOfDate":"2026-09-03"}`

### `fund_get_listed_historical_price`

- **功能**：根据基金代码和指定交易日查询基金交易行情及市场交易数据。
- **适用场景**：用于查看收盘价、成交量、IOPV、折溢价率、净流入额和融资融券余额等交易指标。
- **返回**：返回基金代码、名称、实际交易日及可取得的行情指标，单位和币种分开标注；场外基金的场内指标返回不适用。
- **边界**：这是指定交易日的单日行情，不替代技术分析或申赎清单；技术指标应沿用同一价格序列和交易日，跨日期比较时需明确实际交易日。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCodes` | 是 | array | — | — | 基金代码或基金名称列表，例如 ["510300.OF", "中证500ETF南方"] |
| `includeFields` | 否 | array | — | — | 指定字段助记符列表，留空返回默认行情字段包（收盘价/成交量/IOPV/IOPV溢折率/净流入额/融资融券余额）；可选 f_dq_close=收盘价 / f_dq_volume=成交量 / f_nav_iopv=IOPV / f_nav_iopv_discountratio=IOPV溢折率 / f_mf_netinflow=净流入额 / s_margin_tradingandseclendingbalance=融资融券余额；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |
| `tradeDate` | 否 | string | — | — | 行情交易日 YYYY-MM-DD；非交易日自动回溯；不传用最近交易日；同一请求所有基金共享同一实际交易日。 |

样例：`{"windCodes":["510300.SH"],"tradeDate":"2026-09-03"}`

### `fund_get_size`

- **功能**：根据基金代码和指定日期或报告期查询基金规模信息。
- **适用场景**：用于查看资产净值、份额总数、最新规模、报告期规模和规模变化，并按时点或报告期进行勾稽。
- **返回**：返回每只基金的资产净值、规模、份额及变化字段，分开标注实际日期、报告期和计量单位；缺失或跨时点不可比时明确说明。
- **边界**：最新时点规模与报告期规模不能混用；可与实际净值、份额和持有人结构按同一日期或报告期核对，跨期计算需确认单位和子份额口径一致。

> ⚠ **已知问题**：工具说明提到「reportDate 控制报告期类字段」，但 schema 的 properties 里没有 reportDate。实测传与不传返回完全一致——该字段被静默忽略，报告期类字段始终返回最新一期。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCodes` | 是 | array | — | — | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `includeFields` | 否 | array | — | — | 指定字段助记符列表，留空返回默认规模字段包（5 项：子份额规模/规模合计/份额合计/报告期规模合计/规模变动）；可选 f_info_fundscale_cc=基金子份额规模(公告披露) / f_netasset_total2=基金规模合计 / fundshare_total=基金份额份数合计 / fundnetasset_total=基金规模合计(报告期) / f_prt_netassetchange=基金规模变动；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |
| `asOfDate` | 否 | string | — | — | 截止日期 YYYY-MM-DD，作用于 f_info_fundscale_cc、f_netasset_total2；非交易日回溯；不传用最近交易日。 |

样例：`{"windCodes":["510300.OF","000001.OF"],"asOfDate":"2026-09-03"}`

### `fund_get_financials`

- **功能**：根据基金代码和报告期查询基金财务报表相关的产品级数据。
- **适用场景**：用于查看利润、资产价值、收入、费用和报告期净值增长率等财务指标，核对管理费、托管费等费用项目。
- **返回**：返回实际报告期、利润、资产、收入、费用、期末净资产和报告期净值增长率等字段，金额与单位分开标注；缺失、不适用和未计算分别表达。
- **边界**：财务报表数据按报告期解释，不等同于最新规模快照；应在同一报告期内核对资产、负债与期末净资产，并将净值增长率与业绩统计区分。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCodes` | 是 | array | — | — | 基金代码或基金名称列表，例如 ["000001.OF", "广发稳健增长A"] |
| `includeFields` | 否 | array | — | — | 指定返回的字段助记符列表，留空返回默认字段包（收入/净利润/投资收益/管理费/托管费等）；可选 f_stm_is=收入合计 / f_stm_is_reits_netprofit=净利润 / f_stm_is_79_total=净利润(合计) / f_stm_is_75=基金投资收益 / s_stm07_is_105=财务费用:利息收入 / f_stm_is_76=其他利息收入 / fair_value_change_income=公允价值变动收益 / fund_management_fee=基金管理费 / fund_custody_fee=基金托管费 / fund_sales_service_fee=基金销售服务费 / trading_expenses=交易费用 / audit_fee=审计费用 / other_expenses=其他费用 / interest_expense=利息支出 / ending_net_assets=期末所有者权益(基金净值) / total_assets=资产合计 / total_liabilities=负债合计 / f_nav_return=报告期净值增长率；f_info_windcode、f_info_name 必返、即使未传也会置顶返回。 |
| `reportPeriod` | 否 | string | — | — | 查询报告期 YYYY-MM-DD（季末/半年末/年末）；不传用最近披露期；无数据返回 missing 不回退。 |

样例：`{"windCodes":["510300.OF","000001.OF"],"reportPeriod":"2026-06-30"}`

### `fund_screener`

- **功能**：根据自然语言问句，从公募基金及 ETF 等基金市场识别基金实体、预定义指标及筛选条件，支持按基金规模、净值表现、收益风险等指标，以及基金类型、基金管理人、基金经理、跟踪指数、投资主题、行业方向等分类条件组合反查基金，返回标准化基金数据或符合条件的基金代码列表。
- **适用场景**：基金名称、简称或代码存在歧义时定位基金；将自然语言转换为标准基金、指标或筛选条件；按多个指标或基金分类条件筛选基金；按基金管理人、基金类型、跟踪指数、投资主题等查找基金；为后续净值、持仓、业绩风险等查询准备唯一 Wind 代码。
- **返回**：返回基金名称、Wind 代码、基金类型、基金管理人、指标、日期、数值、单位等标准化数据；筛选场景返回符合条件的基金代码列表，可传入其他基金属性工具继续查询。
- **边界**：已明确具体基金及查询目标时，直接调用对应净值、规模、持仓、业绩风险等属性查询工具；基金市场整体、指数整体及跨资产问题使用对应专业能力。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `query` | 是 | string | — | — | 一句自然语言基金筛选条件，可组合基金类型、区间收益/排名、规模、成立年限、基金经理等。例如 "近一年收益率排名前20的偏股混合型基金"、"规模大于100亿的货币型基金"。 |

样例：`{"query":"规模大于100亿的货币型基金"}`

