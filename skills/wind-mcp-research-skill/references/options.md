# `options` 工具契约 —— 期权

> 由 `scripts/registry.json` 生成（vserver_options_data，17 个工具 / 149 个参数）。
> 参数名、类型、枚举和必填项**以本文件为准**，不要凭记忆填；本地 CLI 会按同一份 schema 拦截不合法入参。

**覆盖**：场内期权的期限结构、期权链截面、合约与品种时间序列、波动率曲面与期限结构、隐含/历史波动率锥、多空情绪；以及场外结构化产品的定价计算器。

## 调用要点

- **两类工具泾渭分明**：`options_get_*` / `options_calc_*_cone` 查**市场真实数据**，需要 `windCode` 与交易日；`options_calc_vanilla|binary|barrier|asian|accumulator|single_shark_fin|autocall_snowball` 是**纯定价计算器**，不查任何市场数据，所有参数（现价、波动率、无风险利率、股息率）都必须由用户给或由你先从别处取好再传入。
- 期权链是三段式：`options_get_listed_terms`（拿 `optionVarietyCode` + `expiryDate`）→ `options_get_term_metrics`（拿 `optionContractCode`）→ `options_get_contract_series`（`optionContractCodes` 是数组）。
- `options_get_volatility_surface` 与 `options_get_iv_term_structure` 用 `time`，格式是 **`YYYY-MM-DD HH:mm`**，不是纯日期；其余工具用 `tradeDate` / `startDate` / `endDate`，格式 `YYYY-MM-DD`。 实测 `time` 会被后端**向最近的计算时点对齐**（传 `15:00` 返回体的 `calculationTime` 是 `15:05`），不会报错也不会精确匹配，取数后核对返回的 `calculationTime` 再报。 ⚠ 返回体里还有一个 `meta_info.calcParams.time`，那是**入参回显**（你传什么它就是什么），和权威的 `calculationTime` 会打架——只读 `calculationTime`。
- 定价计算器的 `volatility`、`riskFreeRate`、`dividendYield` 都是**小数**（0.20 表示 20%），不是百分数。
- `options_calc_accumulator` 与 `options_calc_single_shark_fin` 服务端**持续不可用**（多次尝试、多种参数变体全部返回「服务暂时不可用」）；不要反复重试，直接告知用户该定价能力当前不可用。

## 工具目录

| 工具 | 用途 | 入参 |
| --- | --- | --- |
| [`options_get_listed_terms`](#options_get_listed_terms) | 按期权标的和交易日查询存续期限结构，返回期权品种、到期日、期限类型、合约乘数类型和行权方式。 | **windCode**, **tradeDate** |
| [`options_get_term_metrics`](#options_get_term_metrics) | 按期权品种、交易日、到期日和标的参考价查询期权链截面，返回合约基础信息、量价、隐含波动率及 Delta、Gamma、Vega、Theta。 | **optionVarietyCode**, **tradeDate**, **expiryDate**, underlyingPrice, indicators, strikeLevels |
| [`options_get_contract_series`](#options_get_contract_series) | 按期权合约代码查询指定历史区间内的量价、持仓、隐含波动率和 Delta、Gamma、Vega、Theta 等指标序列。 | **optionContractCodes**, **indicators**, **startDate**, **endDate** |
| [`options_get_variety_series`](#options_get_variety_series) | 按一个或多个期权标的、单一指标和历史区间查询品种维度时间序列，覆盖隐含波动率、历史波动率、PCR 和偏度等指标。 | **windCodes**, **indicator**, **startDate**, **endDate**, tenor, moneyness, deltaLevel, windows |
| [`options_get_variety_stats`](#options_get_variety_stats) | 按一个或多个期权标的、单一指标和历史区间计算品种指标的分布统计，返回当前值、均值、极值、中位数和分位数。 | **windCodes**, **indicator**, **startDate**, **endDate**, tenor, moneyness, deltaLevel, windows |
| [`options_calc_binary`](#options_calc_binary) | 计算现金或资产兑付型二元期权价格，到期时按标的价格是否满足条件支付固定金额或标的资产。 | **assetClass**, **spotPrice**, **optionType**, **strikePrice**, **expirationDate**, **valuationDate**, **volatility**, **riskFreeRate**, **dividendYield**, payoffType, cashAmount, dayCount |
| [`options_calc_barrier`](#options_calc_barrier) | 计算单向障碍期权价格，支持向上或向下障碍、敲入或敲出、返还金以及离散或连续观察。 | **assetClass**, **spotPrice**, **optionType**, **strikePrice**, **barrierLevel**, **barrierDirection**, **barrierType**, **expirationDate**, **valuationDate**, **volatility**, **riskFreeRate**, **dividendYield**, rebate, dayCount, monitoringType, monitoringInterval, pricingMethod |
| [`options_calc_asian`](#options_calc_asian) | 计算亚式期权价格，将观察期内的平均价格纳入现金流并返回期权价值和定价敏感度。 | **assetClass**, **spotPrice**, **optionType**, **strikePrice**, **expirationDate**, **valuationDate**, **averagingStartDate**, **averagingEndDate**, **averagingPrice**, **volatility**, **riskFreeRate**, **dividendYield**, dayCount, observationFrequency, pricingMethod |
| [`options_calc_accumulator`](#options_calc_accumulator) | 计算累计期权价格，支持累购与累沽、线性或固定赔付，以及障碍价格和杠杆率等产品条款。 | **assetClass**, **spotPrice**, **productType**, **payoffType**, **strikePrice**, **barrierPrice**, **expirationDate**, **valuationDate**, **volatility**, **riskFreeRate**, **dividendYield**, leverageRatio, cashAmount, dayCount, observationFrequency, pricingMethod |
| [`options_calc_single_shark_fin`](#options_calc_single_shark_fin) | 计算单向鲨鱼鳍期权价格，使用参与率、障碍价格、敲出收益率和保底收益率描述产品现金流。 | **assetClass**, **spotPrice**, **strikePrice**, **barrierPrice**, **barrierDirection**, **knockoutYield**, **floorYield**, **expirationDate**, **valuationDate**, **barrierStartDate**, **barrierEndDate**, **volatility**, **riskFreeRate**, **dividendYield**, notionalPrincipal, participationRate, dayCount, trackingFrequency |
| [`options_calc_autocall_snowball`](#options_calc_autocall_snowball) | 计算自动赎回 Snowball 产品价格，按敲入、敲出、票息、名义本金和观察频率等条款返回数值结果。 | **assetClass**, **spotPrice**, **coupon**, **knockInPrice**, **knockOutPrice**, **expirationDate**, **valuationDate**, **volatility**, **riskFreeRate**, **dividendYield**, nontional, dayCount, knockOutObserFreq, pricingMethod |
| [`options_get_volatility_surface`](#options_get_volatility_surface) | 按期权标的和参考时间查询波动率曲面，返回不同标准期限和价值状态下的远期价格、行权价及波动率节点。 | **windCode**, **time** |
| [`options_calc_iv_cone`](#options_calc_iv_cone) | 计算标的隐含波动率锥，按不同期限统计历史隐含波动率的最小值、分位数、均值、最大值、当前值及当前分位。 | **windCode**, **startDate**, **endDate** |
| [`options_calc_hv_cone`](#options_calc_hv_cone) | 按指定标的和历史区间计算历史波动率锥，返回历史波动率分布及关键分位数统计。 | **windCode**, **startDate**, **endDate** |
| [`options_get_iv_term_structure`](#options_get_iv_term_structure) | 按标的、价值状态和查询日期获取隐含波动率期限结构，返回不同期限标签对应的波动率。 | **windCode**, **moneyness**, **time** |
| [`options_calc_vanilla`](#options_calc_vanilla) | 计算普通香草期权价格，支持欧式或美式看涨、看跌期权，并按指定或匹配模型返回定价结果。 | **assetClass**, **spotPrice**, **optionType**, **strikePrice**, **expirationDate**, **valuationDate**, **volatility**, **riskFreeRate**, **dividendYield**, exerciseStyle, pricingMethod, dayCount, timeSteps |
| [`options_get_sentiment_data`](#options_get_sentiment_data) | 根据 ETF、股票或期货基础代码与时间区间，查询该品种期权的综合多空情绪数据，覆盖品种级时序、期限级时序、统计特征快照、行权价分布和期限结构对比；支持按期限数量和行权价数量控制返回范围。 | **windCode**, **startDate**, **endDate**, termCount, strikeCount |

_加粗为必填。_

## 工具契约

### `options_get_listed_terms`

- **功能**：按期权标的和交易日查询存续期限结构，返回期权品种、到期日、期限类型、合约乘数类型和行权方式。
- **适用场景**：用于确认当前可用期限，为选择到期日和期权链范围提供依据，并核对欧式期权的期限属性。
- **返回**：逐条返回存续期限及其属性，并标注实际查询日期；没有匹配期限时明确返回无存续记录。
- **边界**：只处理品种和期限层面的存续关系，不展开合约历史行情、链上档位或波动率节点；后续查询应沿用本结果的品种代码和到期日。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 期权标的代码或名称，如510050.SH或华夏上证50ETF。 |
| `tradeDate` | 是 | string | — | — | 交易日（格式为YYYY-MM-DD）。查询上市期权品种期限的日期。 |

样例：`{"windCode":"510050.SH","tradeDate":"2026-09-03"}`

### `options_get_term_metrics`

- **功能**：按期权品种、交易日、到期日和标的参考价查询期权链截面，返回合约基础信息、量价、隐含波动率及 Delta、Gamma、Vega、Theta。
- **适用场景**：用于查看某一到期日的上下档位，比较认购与认沽合约的价格、成交量、持仓量和风险指标。
- **返回**：按合约逐条返回代码、名称、类型、行权价、合约乘数、量价和风险指标，并标注截面交易日；无匹配时明确返回空截面。
- **边界**：只反映一个交易日和一个到期日的截面，不替代存续期限或历史序列；品种、到期日、合约代码及指标应与相关结果逐项核对，不能把档位筛选当成完整市场行情。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `optionVarietyCode` | 是 | string | — | — | 期权品种代码，如510050OP.SH表示上证50ETF期权。通常由上游工具 `options_get_listed_terms` 的返回结果中获取。 |
| `tradeDate` | 是 | string | — | — | 交易日（格式为YYYY-MM-DD）。查询上市期权品种期限的日期。 |
| `expiryDate` | 是 | string | — | — | 期权到期日（格式为YYYY-MM-DD）。指定要获取哪个期限下的期权链。通常由上游工具 `options_get_listed_terms` 的返回结果中获取。 |
| `underlyingPrice` | 否 | number | — | — | 期权标的现价。与strikeLevels配合使用，确定行权价筛选区间的中心点。该数值的单位随资产类型变化（股票为货币单位，指数为点数，商品为对应计价单位等），但传入时直接使用市场报价的原始数值，不做任何单位换算。确保该数值与期权链中的行权价位于同一数值标尺上、可直接比较即可。若不传，则返回该期限下的全部期权合约。 |
| `indicators` | 否 | array | — | 默认 `["lastPrice","settlePrice","volume","openInterest","iv","delta","gamma","vega","theta"]` | 期权指标列表，可选指标包括：最新价、结算价、成交量、持仓量、持仓量变化、隐含波动率、波动率涨跌、delta、gamma、vega、theta,涨跌、涨跌幅、开、高、低 |
| `strikeLevels` | 否 | integer | — | — | 期权合约上下档位个数，如5表示上下各5档。控制返回的期权合约范围。若不传，则忽略档位限制，返回该期限下的全部期权合约。 |

样例：`{"optionVarietyCode":"510050OP.SH","tradeDate":"2026-09-03","expiryDate":"2026-09-23","underlyingPrice":3,"strikeLevels":2}`

### `options_get_contract_series`

- **功能**：按期权合约代码查询指定历史区间内的量价、持仓、隐含波动率和 Delta、Gamma、Vega、Theta 等指标序列。
- **适用场景**：用于查看具体合约的历史价格和结算价，跟踪成交量、持仓量及其变化，复核单合约风险指标。
- **返回**：按合约、交易日和指标逐条返回观测值及单位；未取得的指标保留缺失状态，并标注实际数据区间。
- **边界**：只回答选定合约的历史观测，不替代同日链截面或品种级聚合指标；合约代码和指标应与截面结果一致，标的代码返回的现货字段不得误当作合约历史，未支持指标不得静默丢弃。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `optionContractCodes` | 是 | array | — | — | 需要查询的期权合约代码或标的代码列表，以获取其时间序列。 |
| `indicators` | 是 | array | — | — | 待提取的指标列表，可选值：最新价，涨跌，涨跌幅，结算价，成交量，持仓量，持仓量变化，隐含波动率，波动率涨跌，delta，gamma，vega，theta，开，高，低。 |
| `startDate` | 是 | string | — | — | 开始日期（格式为YYYY-MM-DD）。时序数据查询的起始日期。 |
| `endDate` | 是 | string | — | — | 结束日期（格式为YYYY-MM-DD）。时序数据查询的结束日期。 |

样例：`{"optionContractCodes":["10010972.SH","10010981.SH"],"indicators":["最新价","隐含波动率","delta"],"startDate":"2026-08-20","endDate":"2026-09-03"}`

### `options_get_variety_series`

- **功能**：按一个或多个期权标的、单一指标和历史区间查询品种维度时间序列，覆盖隐含波动率、历史波动率、PCR 和偏度等指标。
- **适用场景**：用于观察品种指标的历史变化，对比多个标的的同一指标，复核指定期限、价值状态或 Delta 档位。
- **返回**：逐交易日返回标的、指标口径和数值，并标注实际数据区间；周末和非交易日不补造观测。
- **边界**：只处理品种层面的聚合序列，不展开单个合约量价或期权链档位；序列可作为分布统计和波动率分析的勾稽基础，但比较时必须保持标的、指标、期限和日期口径一致。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCodes` | 是 | array | — | — | 期权标的代码或名称列表，如["华夏上证50ETF", "510300.SH"]。支持多个标的资产同时查询。 |
| `indicator` | 是 | string | `vol_moneyness` / `vol_delta` / `hv` / `pcr_volume` / `pcr_oi` / `pcr_turnover` / `skew` / `skew_normalized` | — | 待提取的期权品种时序指标类型。可选值：vol_moneyness（价值状态隐波），vol_delta（Delta维度隐波），hv（历史波动率），pcr_volume（成交量PCR），pcr_oi（持仓量PCR），pcr_turnover（成交额PCR），skew（偏度：25d Call vol - 25d Put vol），skew_normalized（相对偏度：(25d Call vol - 25d Put vol)/50d vol）。 |
| `startDate` | 是 | string | — | — | 开始日期（格式为YYYY-MM-DD）。时序数据查询的起始日期。 |
| `endDate` | 是 | string | — | — | 结束日期（格式为YYYY-MM-DD）。时序数据查询的结束日期。 |
| `tenor` | 否 | string | `1W` / `1M` / `2M` / `3M` / `6M` / `9M` / `1Y` / `18M` …（共 14 项，用 describe 看全） | 默认 `"1M"` | 期限标识（当indicator为vol_moneyness、vol_delta、skew或skew_normalized时必填），可选值：1W、1M、2M、3M、6M、9M、1Y、18M、2Y、3Y、4Y、5Y、7Y、10Y。 |
| `moneyness` | 否 | string | `30` / `40` / `60` / `80` / `90` / `95` / `97.5` / `100` …（共 18 项，用 describe 看全） | 默认 `"100"` | 价值状态（当indicator为vol_moneyness时必填，默认值100），可选值：30、40、60、80、90、95、97.5、100、102.5、105、110、120、130、150、175、200、250、300。 |
| `deltaLevel` | 否 | string | `5DP` / `10DP` / `15DP` / `25DP` / `35DP` / `50D` / `35DC` / `25DC` …（共 11 项，用 describe 看全） | 默认 `"50D"` | Delta档位（当indicator为vol_delta时必填，默认值50D），可选值：5DP、10DP、15DP、25DP、35DP、50D、35DC、25DC、15DC、10DC、5DC。 |
| `windows` | 否 | string | — | 默认 `"20"` | 计算窗口（当indicator为hv时必填，默认值20个交易日）。 |

样例：`{"windCodes":["510050.SH"],"indicator":"pcr_volume","startDate":"2026-08-01","endDate":"2026-09-03"}`

### `options_get_variety_stats`

- **功能**：按一个或多个期权标的、单一指标和历史区间计算品种指标的分布统计，返回当前值、均值、极值、中位数和分位数。
- **适用场景**：用于查看隐波、历史波动率、PCR 或偏度在区间内的分布，对比多个标的的历史位置。
- **返回**：逐标的返回统计区间、当前值、均值、极值、中位数及关键分位数，并标注指标参数和实际日期；无有效样本时返回合法空结果或结构化异常。
- **边界**：统计结果应与相同标的、指标、期限、窗口和区间的原始序列勾稽，不能替代逐日序列或合约明细；未来无样本区间不得用相同分位数伪造成功结果。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCodes` | 是 | array | — | — | 期权标的代码或名称列表，如["华夏上证50ETF", "510300.SH"]。支持多个标的资产同时查询。 |
| `indicator` | 是 | string | `vol_moneyness` / `vol_delta` / `hv` / `pcr_volume` / `pcr_oi` / `pcr_turnover` / `skew` / `skew_normalized` | — | 待提取的期权品种时序指标类型。可选值：vol_moneyness（价值状态隐波），vol_delta（Delta维度隐波），hv（历史波动率），pcr_volume（成交量PCR），pcr_oi（持仓量PCR），pcr_turnover（成交额PCR），skew（偏度：25d Call vol - 25d Put vol），skew_normalized（相对偏度：(25d Call vol - 25d Put vol)/50d vol）。 |
| `startDate` | 是 | string | — | — | 开始日期（格式为YYYY-MM-DD）。时序数据查询的起始日期。 |
| `endDate` | 是 | string | — | — | 结束日期（格式为YYYY-MM-DD）。时序数据查询的结束日期。 |
| `tenor` | 否 | string | `1W` / `1M` / `2M` / `3M` / `6M` / `9M` / `1Y` / `18M` …（共 14 项，用 describe 看全） | 默认 `"1M"` | 期限标识（当indicator为vol_moneyness、vol_delta、skew或skew_normalized时必填），可选值：1W、1M、2M、3M、6M、9M、1Y、18M、2Y、3Y、4Y、5Y、7Y、10Y。 |
| `moneyness` | 否 | string | `30` / `40` / `60` / `80` / `90` / `95` / `97.5` / `100` …（共 18 项，用 describe 看全） | 默认 `"100"` | 价值状态（当indicator为vol_moneyness时必填，默认值100），可选值：30、40、60、80、90、95、97.5、100、102.5、105、110、120、130、150、175、200、250、300。 |
| `deltaLevel` | 否 | string | `5DP` / `10DP` / `15DP` / `25DP` / `35DP` / `50D` / `35DC` / `25DC` …（共 11 项，用 describe 看全） | 默认 `"50D"` | Delta档位（当indicator为vol_delta时必填，默认值50D），可选值：5DP、10DP、15DP、25DP、35DP、50D、35DC、25DC、15DC、10DC、5DC。 |
| `windows` | 否 | string | — | 默认 `"20"` | 计算窗口（当indicator为hv时必填，默认值20个交易日）。 |

样例：`{"windCodes":["510050.SH"],"indicator":"hv","startDate":"2026-01-01","endDate":"2026-09-03","windows":"20"}`

### `options_calc_binary`

- **功能**：计算现金或资产兑付型二元期权价格，到期时按标的价格是否满足条件支付固定金额或标的资产。
- **适用场景**：用于比较看涨与看跌二元期权，以及现金兑付和资产兑付条款下的 NPV 与定价敏感度。
- **返回**：返回 NPV、Delta、Rho、Theta、Gamma、Vega 及实际估值日期、定价模型、期权类型和标的类别，数值与单位分开表达。
- **边界**：依赖调用方明确提供现价、行权价、到期日、波动率和利率等参数，不负责补查市场数据；可在相同市场参数下与其他期权模型作基准比较，但不同赔付条款不能混用，结果不构成交易判断。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `assetClass` | 是 | string | `equity` / `fx` / `futures` | — | 标的资产类别, equity: 股票/指数/ETF/基金，fx: 外汇，futures:期货。 |
| `spotPrice` | 是 | number | — | — | 标的资产现价 |
| `optionType` | 是 | string | `call` / `put` | — | 期权类型：看涨(call) 或 看跌(put)。 |
| `strikePrice` | 是 | number | — | — | 执行价格。 |
| `expirationDate` | 是 | string | — | — | 到期日期 (YYYY-MM-DD)。 |
| `valuationDate` | 是 | string | — | — | 估值日期 (YYYY-MM-DD)。 |
| `volatility` | 是 | number | — | — | 年化隐含波动率 (小数形式)。格式转换：如果用户输入 '25' 或 '25%'，请填入 0.25；如果输入 0.25，则保持不变。 |
| `riskFreeRate` | 是 | number | — | — | 年化无风险利率 (小数形式)。对于 FX 期权，填入本币(计价货币)无风险利率。 |
| `dividendYield` | 是 | number | — | — | 第二利率(小数形式)：Equity:输入年化股息率；FX:输入外币(基础货币)无风险利率；Futures:通常填0。 |
| `payoffType` | 否 | string | `cash` / `asset` | 默认 `"cash"` | 二元期权类型：cash:现金或无（Cash-or-Nothing），到期支付固定金额；asset:资产或无（Asset-or-Nothing），到期支付标的价格。 |
| `cashAmount` | 否 | number | — | 默认 `100` | 固定的获赔金额。仅当 payoffType = cash 时有效。 |
| `dayCount` | 否 | string | `actual` / `business` | 默认 `"actual"` | 计日惯例（时间T的计算方式）：actual:基于日历日，business:基于交易日 |

样例：`{"assetClass":"equity","spotPrice":3,"optionType":"call","strikePrice":3,"expirationDate":"2026-12-23","valuationDate":"2026-09-03","volatility":0.2,"riskFreeRate":0.02,"dividendYield":0.01,"payoffType":"cash","cashAmount":100}`

### `options_calc_barrier`

- **功能**：计算单向障碍期权价格，支持向上或向下障碍、敲入或敲出、返还金以及离散或连续观察。
- **适用场景**：用于比较不同障碍价格、障碍方向、观察方式和定价模型下的 NPV 与定价敏感度。
- **返回**：返回 NPV、Delta、Rho、Theta、Gamma、Vega，以及实际估值日期、障碍类型、观察方式和定价模型，数值与单位分开表达。
- **边界**：只做给定条款和市场参数下的数值计算，不查询期权链或历史行情；可与普通香草期权在相同参数下作基准勾稽，但障碍条款不能与平均价或结构化产品条款直接拼接。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `assetClass` | 是 | string | `equity` / `fx` / `futures` | — | 标的资产类别, equity: 股票/指数/ETF/基金，fx: 外汇，futures:期货。 |
| `spotPrice` | 是 | number | — | — | 标的资产现价。 |
| `optionType` | 是 | string | `call` / `put` | — | 期权类型:看涨(call) 或 看跌(put)。 |
| `strikePrice` | 是 | number | — | — | 执行价格。 |
| `barrierLevel` | 是 | number | — | — | 障碍价格。触发期权敲入（生效）或敲出（失效）的价格水平。 |
| `barrierDirection` | 是 | string | `up` / `down` | — | 障碍方向。定义障碍价格相对于当前标的价格的位置。up (向上): 关注价格上涨触碰障碍。通常障碍价格在标的价格上方。down (向下): 关注价格下跌触碰障碍。通常障碍价格在标的价格下方。 |
| `barrierType` | 是 | string | `in` / `out` | — | 障碍类型。定义触碰障碍后，期权合约状态发生的变化。in (敲入): 期权初始状态为'未激活'。只有触碰障碍后，合约才生效变为普通期权。若到期从未触碰，如果有 Rebate 则支付 Rebate，否则价值为 0。out (敲出): 期权初始状态为'激活'。一旦触碰障碍，合约立即作废（失效）。此时若有 Rebate 则支付，否则价值归零。提示下用户是否需要填入rebate返还金。 |
| `expirationDate` | 是 | string | — | — | 到期日期（YYYY-MM-DD格式）。 |
| `valuationDate` | 是 | string | — | — | 估值日期（YYYY-MM-DD）。 |
| `volatility` | 是 | number | — | — | 年化隐含波动率 (小数形式)。格式转换：如果用户输入 '25' 或 '25%'，请填入 0.25；如果输入 0.25，则保持不变。 |
| `riskFreeRate` | 是 | number | — | — | 年化无风险利率(小数形式)。对于 FX 期权，填入本币(计价货币)无风险利率。 |
| `dividendYield` | 是 | number | — | — | 第二利率(小数形式)。1. Equity: 输入年化股息率,FX: 输入外币(基础货币)无风险利率,Futures: 通常填 0 |
| `rebate` | 否 | number | — | 默认 `0` | 返还金。当期权因障碍条件而失效（敲出）或未能激活（未敲入）时，卖方需支付给买方的固定现金补偿。默认为 0。 |
| `dayCount` | 否 | string | `actual` / `business` | 默认 `"actual"` | 日历惯例 (时间T的计算方式),actual: 基于日历日, business: 基于交易日。 |
| `monitoringType` | 否 | string | `discrete` / `continuous` | 默认 `"discrete"` | 观察类型。定义系统检查价格是否触碰障碍的时间模式。discrete (离散): 仅在特定时间点（如每日收盘）检查。continuous (连续): 假设任意时刻触碰都算触发。 |
| `monitoringInterval` | 否 | integer | — | 默认 `1` | 观察间隔天数。仅当monitoringType为 discrete 时有效。定义两次观察点之间的时间跨度。比如 1: 每日观察填入1， 间隔2天填入2。 |
| `pricingMethod` | 否 | string | `analytic` / `mc` | 默认 `"mc"` | 定价模型。 定价模型选择：如果观察类型是离散discrete, 定价模型必须填入'mc'， 如果观察类型是continuous, 定价模型必须填入'analytic'。 |

样例：`{"assetClass":"equity","spotPrice":3,"optionType":"call","strikePrice":3,"barrierLevel":3.3,"barrierDirection":"up","barrierType":"out","expirationDate":"2026-12-23","valuationDate":"2026-09-03","volatility":0.2,"riskFreeRate":0.02,"dividendYield":0.01,"monitoringType":"discrete","monitoringInterval":1,"pricingMethod":"mc"}`

### `options_calc_asian`

- **功能**：计算亚式期权价格，将观察期内的平均价格纳入现金流并返回期权价值和定价敏感度。
- **适用场景**：用于计算带平均价格特征的看涨或看跌期权，比较观察区间和观察频率对结果的影响。
- **返回**：返回 NPV、Delta、Rho、Theta、Gamma、Vega，以及平均观察期、观察频率、实际估值日期和定价模型，数值与单位分开表达。
- **边界**：观察日期、平均价格口径和频率必须明确；本工具不查询行情或历史序列，可与普通香草期权作同参数基准比较，但不能把链上价格或历史收盘价直接当作已完成的平均价。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `assetClass` | 是 | string | `equity` / `fx` / `futures` | — | 标的资产类别, equity: 股票/指数/ETF/基金，fx: 外汇，futures:期货。 |
| `spotPrice` | 是 | number | — | — | 标的资产现价。 |
| `optionType` | 是 | string | `call` / `put` | — | 期权类型。看涨(call) 或 看跌(put)。 |
| `strikePrice` | 是 | number | — | — | 执行价格。 |
| `expirationDate` | 是 | string | — | — | 到期日期（YYYY-MM-DD格式）。 |
| `valuationDate` | 是 | string | — | — | 估值日期（YYYY-MM-DD）。 |
| `averagingStartDate` | 是 | string | — | — | 平均开始日期（YYYY-MM-DD格式）。平均观察期的开始日期。 |
| `averagingEndDate` | 是 | string | — | — | 平均结束日期（YYYY-MM-DD格式）。平均观察期的结束日期。 |
| `averagingPrice` | 是 | number | — | — | 已实现平均价。截至估值日期的已实现平均价，只有当平均开始日期早于估值日期时，该参数才生效，如果没有提供，优先填入spotPrice（当前标的价格）。 |
| `volatility` | 是 | number | — | — | 年化隐含波动率（小数形式）。格式转换：如果用户输入'25'或'25%'，请填入0.25 |
| `riskFreeRate` | 是 | number | — | — | 年化无风险利率(小数形式)。对于 FX 期权，填入本币(计价货币)无风险利率。格式转换：如果输入 '25' 或 '25%'，请填入 0.25 |
| `dividendYield` | 是 | number | — | — | 第二利率(小数形式)。1. Equity: 输入年化股息率,FX: 输入外币(基础货币)无风险利率,Futures: 通常填 0，2.格式转换：如果用户输入 '25' 或 '25%'，请填入 0.25， |
| `dayCount` | 否 | string | `actual` / `business` | 默认 `"actual"` | 计日惯例 (时间T的计算方式),actual: 基于日历日, business: 基于交易日。 |
| `observationFrequency` | 否 | integer | — | 默认 `1` | 观察频率。观察日的时间间隔天数，自然语言映射：每日/Daily填1, 每2天填2等。 |
| `pricingMethod` | 否 | string | `mc` | 默认 `"mc"` | 定价模型。 |

样例：`{"assetClass":"equity","spotPrice":3,"optionType":"call","strikePrice":3,"expirationDate":"2026-12-23","valuationDate":"2026-09-03","averagingStartDate":"2026-09-03","averagingEndDate":"2026-12-23","averagingPrice":3,"volatility":0.2,"riskFreeRate":0.02,"dividendYield":0.01}`

### `options_calc_accumulator`

- **功能**：计算累计期权价格，支持累购与累沽、线性或固定赔付，以及障碍价格和杠杆率等产品条款。
- **适用场景**：用于比较不同产品类型、障碍价格、杠杆率和观察频率下的 NPV 与定价敏感度。
- **返回**：返回 NPV、Delta、Rho、Theta、Gamma、Vega，以及产品类型、赔付类型、实际估值日期和定价模型，数值与单位分开表达。
- **边界**：产品条款和市场参数必须由调用方明确提供，本工具不自动补查行情或推断杠杆与赔付；可与普通期权或其他结构化模型在同一参数口径下作基准比较，但不同产品条款不能直接拼接，结果不构成交易判断。

> ⚠ **已知问题**：服务端不可用（13 次尝试、9 种参数变体全部返回「服务暂时不可用，请稍后重试」）

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `assetClass` | 是 | string | `equity` / `fx` / `futures` | — | 标的资产类别, equity: 股票/指数/ETF/基金，fx: 外汇，futures:期货。 |
| `spotPrice` | 是 | number | — | — | 标的资产现价。 |
| `productType` | 是 | string | `accumulator` / `decumulator` | — | 产品类型。accumulator: 累购期权, decumulator: 累沽期权 |
| `payoffType` | 是 | string | `linear` / `fixed` | — | 赔付类型。linear: 线性赔付（浮动）。收益 = (S - K)。模拟实物交割。fixed: 固定赔付。收益 = 固定金额, 当选择固定赔付时，输入赔付金额 |
| `strikePrice` | 是 | number | — | — | 行权价格。对于累购，当观察日标的价格在小于障碍价格，且大于行权价格时，以行权价格买入1份标的，或者获得固定赔付金额。对于累沽，当观察日标的价格在大于障碍价格，且小于行权价格时，以行权价格卖出1份标的，或者获得固定赔付金额。 |
| `barrierPrice` | 是 | number | — | — | 障碍价格。 对于累购，如果观察日标的价格大于障碍价格时，当日不结算。对于累沽，如果观察日标的价格小于障碍价格，当日不结算 |
| `expirationDate` | 是 | string | — | — | 到期日期（YYYY-MM-DD格式） |
| `valuationDate` | 是 | string | — | — | 估值日期。 |
| `volatility` | 是 | number | — | — | 年化隐含波动率 (小数形式)。1.格式转换：如果用户输入 '25' 或 '25%'，请填入 0.25；如果输入 0.25，则保持不变。 |
| `riskFreeRate` | 是 | number | — | — | 年化无风险利率(小数形式)。对于 FX 期权，填入本币(计价货币)无风险利率。1.格式转换：如果用户输入 '25' 或 '25%'，请填入 0.25，如果输入 0.25 |
| `dividendYield` | 是 | number | — | — | 第二利率(小数形式)。1. Equity: 输入年化股息率,FX: 输入外币(基础货币)无风险利率,Futures: 通常填 0，2.格式转换：如果用户输入 '25' 或 '25%'，请填入 0.25， |
| `leverageRatio` | 否 | number | — | 默认 `1` | 杠杆率。对于累购，当标的价格跌破行权价格时，客户需要购买  leverage_ratio 数量的标的，通常为 1.0 或 2.0， 对于累沽，一旦价格高于行权价，按行权价卖出杠杆 Leverage_ratio数量的标的 |
| `cashAmount` | 否 | number | — | 默认 `100` | 赔付金额。当观察日标的价格处于行权价格和障碍价格之间时，获得的赔付固定金额 |
| `dayCount` | 否 | string | `actual` / `business` | 默认 `"actual"` | 日历惯例。actual: 基于日历日, business: 基于交易日。 |
| `observationFrequency` | 否 | integer | — | 默认 `1` | 观察频率。定义两次观察点之间的时间跨度(天)。比如 1: 每日观察填入1， 间隔2天填入2 |
| `pricingMethod` | 否 | string | `mc` | 默认 `"mc"` | 定价模型 |

样例：`{"assetClass":"equity","spotPrice":3,"productType":"accumulator","payoffType":"linear","strikePrice":3,"barrierPrice":3.3,"expirationDate":"2026-12-23","valuationDate":"2026-09-03","volatility":0.2,"riskFreeRate":0.02,"dividendYield":0.01}`

### `options_calc_single_shark_fin`

- **功能**：计算单向鲨鱼鳍期权价格，使用参与率、障碍价格、敲出收益率和保底收益率描述产品现金流。
- **适用场景**：用于比较向上或向下方向、障碍观察期、观察频率和名义本金不同的产品定价结果。
- **返回**：返回 NPV、Delta、Rho、Theta、Gamma、Vega，以及参与率、障碍方向、收益率、实际估值日期和定价模型，数值与单位分开表达。
- **边界**：产品现金流条款和市场参数必须明确，本工具不查询标的行情或期权链；可与普通期权及其他结构化模型作同口径基准勾稽，但鲨鱼鳍的障碍和收益规则不能按一般障碍期权直接替代。

> ⚠ **已知问题**：服务端不可用（12 次尝试全部失败）

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `assetClass` | 是 | string | `equity` / `fx` / `futures` | — | 标的资产类别。 equity: 股票/指数/ETF/基金，fx: 外汇，futures:期货。 |
| `spotPrice` | 是 | number | — | — | 标的资产现价。 |
| `strikePrice` | 是 | number | — | — | 执行价格。 |
| `barrierPrice` | 是 | number | — | — | 障碍价格。触发期权敲入（生效）或敲出（失效）的价格水平。 |
| `barrierDirection` | 是 | string | `up` / `down` | — | 障碍方向。定义障碍价格相对于当前标的价格的位置。up (向上): 关注价格上涨触碰障碍。通常障碍价格在标的价格上方。down (向下): 关注价格下跌触碰障碍。通常障碍价格在标的价格下方。 |
| `knockoutYield` | 是 | number | — | — | 敲出收益率。 敲出障碍价格时的年化收益率(小数形式) |
| `floorYield` | 是 | number | — | — | 保底收益率。未发生敲出事件时, 对应的年化保底收益率(小数形式) |
| `expirationDate` | 是 | string | — | — | 到期日期（YYYY-MM-DD格式）。 |
| `valuationDate` | 是 | string | — | — | 估值日期（YYYY-MM-DD格式) |
| `barrierStartDate` | 是 | string | — | — | 障碍开始日期(YYYY-MM-DD)。障碍观察期的开始日期，从该日期开始观察标的价格是否触及障碍价格。未提供优先按估值日期作为障碍开始日期 |
| `barrierEndDate` | 是 | string | — | — | 障碍结束日期 (YYYY-MM-DD)。 障碍观察期的结束日期，到该日期结束观察标的价格是否触及障碍价格。未提供优先按照到期日期作为障碍结束日期。 |
| `volatility` | 是 | number | — | — | 年化隐含波动率（小数形式）。格式转换：如果输入'25'或'25%'，请填入0.25 |
| `riskFreeRate` | 是 | number | — | — | 年化无风险利率（小数形式）。对于FX期权，填入本币(计价货币)无风险利率。格式转换：如果输入'25'或'25%'，请填入0.25 |
| `dividendYield` | 是 | number | — | — | 第二利率(小数形式)：Equity输入年化股息率；FX输入外币(基础货币)无风险利率；Futures通常填0。格式转换：如果输入'25'或'25%'，请填入0.25；如果输入0.25，则保持不变。 |
| `notionalPrincipal` | 否 | number | — | 默认 `1000000` | 名义本金。客户交易的名义本金金额，用于计算实际收益金额。 |
| `participationRate` | 否 | number | — | 默认 `1` | 参与率。客户享受标的涨跌幅的比例系数(小数形式) |
| `dayCount` | 否 | string | `actual` / `business` | 默认 `"actual"` | 计日惯例。年化剩余到期日T的日历方式,actual: 基于日历日, business: 基于交易日 |
| `trackingFrequency` | 否 | integer | — | 默认 `1` | 观察频率。观察标的价格是否触及障碍的频率（天数）。 |

样例：`{"assetClass":"equity","spotPrice":3,"strikePrice":3,"barrierPrice":3.3,"barrierDirection":"up","knockoutYield":0.08,"floorYield":0.02,"expirationDate":"2026-12-23","valuationDate":"2026-09-03","barrierStartDate":"2026-09-03","barrierEndDate":"2026-12-23","volatility":0.2,"riskFreeRate":0.02,"dividendYield":0.01}`

### `options_calc_autocall_snowball`

- **功能**：计算自动赎回 Snowball 产品价格，按敲入、敲出、票息、名义本金和观察频率等条款返回数值结果。
- **适用场景**：用于比较不同敲入敲出价格、票息、观察频率和期限下的 NPV 与定价敏感度。
- **返回**：返回 NPV、Delta、Rho、Theta、Gamma、Vega，以及名义本金、票息、敲入敲出价格、实际估值日期和定价模型，数值与单位分开表达。
- **边界**：产品条款、标的现价和市场参数必须明确，本工具不负责查询或补全行情；可与其他结构化产品在同一市场参数下作结果比较，但自动赎回、敲入和票息规则不能与普通期权条款混用，结果不构成交易判断。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `assetClass` | 是 | string | `equity` / `fx` / `futures` | — | 标的资产类别, equity: 股票/指数/ETF/基金，fx: 外汇，futures:期货。 |
| `spotPrice` | 是 | number | — | — | 标的资产现价。 |
| `coupon` | 是 | number | — | — | 年化票息（小数形式）。格式转换：如果输入'25'或'25%'，请填入0.25；如果输入0.25，则保持不变。 |
| `knockInPrice` | 是 | number | — | — | 敲入价格。 |
| `knockOutPrice` | 是 | number | — | — | 敲出价格。 |
| `expirationDate` | 是 | string | — | — | 合约结束的日期 (YYYY-MM-DD)。 |
| `valuationDate` | 是 | string | — | — | 估值日期 (YYYY-MM-DD)。 |
| `volatility` | 是 | number | — | — | 年化隐含波动率（小数形式）。格式转换：如果输入'25'或'25%'，请填入0.25；如果输入0.25，则保持不变。 |
| `riskFreeRate` | 是 | number | — | — | 年化无风险利率 (小数形式)。对于 FX 期权，填入本币(计价货币)无风险利率。 |
| `dividendYield` | 是 | number | — | — | 第二利率(小数形式)：Equity:输入年化股息率；FX:输入外币(基础货币)无风险利率；Futures:通常填0。 |
| `nontional` | 否 | number | — | 默认 `1000000` | 名义本金。单位：计价货币（Quote Currency） |
| `dayCount` | 否 | string | `actual` / `business` | 默认 `"actual"` | 计日惯例（时间T的计算方式）：actual:基于日历日，business:基于交易日 |
| `knockOutObserFreq` | 否 | integer | — | 默认 `30` | 敲出观察频率，单位为'天'。每月观察，请填入30，每周观察，请填入7。 |
| `pricingMethod` | 否 | string | `mc` | 默认 `"mc"` | 定价模型 |

样例：`{"assetClass":"equity","spotPrice":3,"coupon":0.15,"knockInPrice":2.4,"knockOutPrice":3.15,"expirationDate":"2027-09-03","valuationDate":"2026-09-03","volatility":0.2,"riskFreeRate":0.02,"dividendYield":0.01}`

### `options_get_volatility_surface`

- **功能**：按期权标的和参考时间查询波动率曲面，返回不同标准期限和价值状态下的远期价格、行权价及波动率节点。
- **适用场景**：用于查看当前多期限、多价值状态的隐含波动率，核对曲面展示和插值所需节点。
- **返回**：逐节点返回期限标签、期限插值锚点、远期价格、行权价、价值状态和波动率，并标注参考时间及单位口径。
- **边界**：期限插值锚点不等同真实挂牌到期日；本结果不替代存续期限、历史序列或定价结果，波动率作为定价输入前必须先核对日期、价值状态和百分数/小数单位。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 期权标的代码或名称。只支持非期货证券以及期货的主力合约代码或名称，如000300.SH,SHFE铜 |
| `time` | 是 | string | — | — | 查询时间，格式：YYYY-MM-DD HH:mm。参考标的代码所在本地时区 |

样例：`{"windCode":"510050.SH","time":"2026-09-03 14:30"}`

### `options_calc_iv_cone`

- **功能**：计算标的隐含波动率锥，按不同期限统计历史隐含波动率的最小值、分位数、均值、最大值、当前值及当前分位。
- **适用场景**：用于观察多个期限隐波的历史分布，判断当前隐波在同口径历史区间中的位置。
- **返回**：逐期限返回当前值、当前分位、p10/p25/p50/p75/p90、极值和均值，并标注统计区间、实际截止日期及波动率单位。
- **边界**：统计结果应与相同标的、期限、日期区间和单位口径的隐波序列及当前曲面节点交叉核对；不提供单合约明细，也不把历史分布直接当作定价结果。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 期权标的代码或名称。只支持非期货证券以及期货的主力合约代码或名称，如000300.SH,SHFE铜 |
| `startDate` | 是 | string | — | — | 开始日期（YYYY-MM-DD格式）。 |
| `endDate` | 是 | string | — | — | 结束日期（YYYY-MM-DD格式）。 |

样例：`{"windCode":"510050.SH","startDate":"2026-01-01","endDate":"2026-09-03"}`

### `options_calc_hv_cone`

- **功能**：按指定标的和历史区间计算历史波动率锥，返回历史波动率分布及关键分位数统计。
- **适用场景**：用于观察历史波动率区间、当前分位和不同标的在相同区间下的统计差异。
- **返回**：逐记录返回波动率、当前分位、极值、均值及 p10/p25/p50/p75/p90，并标注实际统计区间；源数据没有稳定期限或窗口标签时保持未标注。
- **边界**：历史波动率与隐含波动率属于不同口径，不能相互替代；组合比较时必须保持标的、区间、年化方式和窗口一致，缺少标签或有效样本时不补造结论。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 期权标的代码或名称。只支持非期货证券以及期货的主力合约代码或名称，如000300.SH,SHFE铜 |
| `startDate` | 是 | string | — | — | 开始日期（YYYY-MM-DD）。 |
| `endDate` | 是 | string | — | — | 结束日期（YYYY-MM-DD）。 |

样例：`{"windCode":"510050.SH","startDate":"2026-01-01","endDate":"2026-09-03"}`

### `options_get_iv_term_structure`

- **功能**：按标的、价值状态和查询日期获取隐含波动率期限结构，返回不同期限标签对应的波动率。
- **适用场景**：用于比较近月与远月隐波，查看指定价值状态下的期限形状，并复核某一历史日期的期限节点。
- **返回**：逐期限返回标的、查询日期、期限标签、价值状态和波动率，并标注实际计算时间和波动率单位。
- **边界**：这是单一价值状态和日期的期限切片，不替代多价值状态曲面、历史分布或真实存续期限；与曲面勾稽时必须保持参考时间和价值状态一致，不能把期限标签当作挂牌到期日。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 期权标的代码或名称。只支持非期货证券以及期货的主力合约代码或名称，如000300.SH,SHFE铜 |
| `moneyness` | 是 | number | — | — | 期权价值状态（100.0表示平值），查询与moneyness最接近的价值状态的隐含波动率期限结构 |
| `time` | 是 | string | — | — | 查询时间，格式：YYYY-MM-DD HH:mm。参考标的代码所在本地时区 |

样例：`{"windCode":"510050.SH","moneyness":100,"time":"2026-09-03 14:30"}`

### `options_calc_vanilla`

- **功能**：计算普通香草期权价格，支持欧式或美式看涨、看跌期权，并按指定或匹配模型返回定价结果。
- **适用场景**：用于计算普通期权价格，比较波动率、利率、股息率、行权方式和模型选择对结果的影响。
- **返回**：返回 NPV、Delta、Rho、Theta、Gamma、Vega，以及行权方式、实际估值日期、到期日和定价模型，数值与单位分开表达。
- **边界**：依赖调用方提供已确认的市场参数，不查询现价、波动率或利率；可作为二元、障碍、亚式及结构化产品的共同基准，但不同现金流条款不能直接混合，结果不构成交易判断。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `assetClass` | 是 | string | `equity` / `fx` / `futures` | 默认 `"equity"` | 标的资产类别, equity: 股票/指数/ETF/基金，fx: 外汇，futures:期货。 |
| `spotPrice` | 是 | number | — | — | 标的资产现价 |
| `optionType` | 是 | string | `call` / `put` | 默认 `"call"` | 期权类型：看涨(call) 或 看跌(put)。 |
| `strikePrice` | 是 | number | — | — | 执行价格。 |
| `expirationDate` | 是 | string | — | — | 到期日期 (YYYY-MM-DD)。 |
| `valuationDate` | 是 | string | — | — | 估值日期 (YYYY-MM-DD)。 |
| `volatility` | 是 | number | — | — | 年化隐含波动率 (小数形式)。格式转换：如果用户输入 '25' 或 '25%'，请填入 0.25；如果输入 0.25，则保持不变。 |
| `riskFreeRate` | 是 | number | — | — | 年化无风险利率 (小数形式)。对于 FX 期权，填入本币(计价货币)无风险利率。 |
| `dividendYield` | 是 | number | — | — | 第二利率(小数形式)：Equity:输入年化股息率；FX:输入外币(基础货币)无风险利率；Futures:通常填0。 |
| `exerciseStyle` | 否 | string | `european` / `american` | 默认 `"european"` | 行权方式：european:欧式，american: 美式。 |
| `pricingMethod` | 否 | string | `bs` / `baw` / `binomial` | 默认 `"bs"` | 定价模型：美式优先用baw其次binomial，欧式用bs。 |
| `dayCount` | 否 | string | `actual` / `business` | 默认 `"actual"` | 计日惯例（时间T的计算方式）：actual:基于日历日，business:基于交易日。 |
| `timeSteps` | 否 | integer | — | 默认 `100` | 时间步数。仅当 pricingMethod 为 'binomial' 时有效。 |

样例：`{"assetClass":"equity","spotPrice":3,"optionType":"call","strikePrice":3,"expirationDate":"2026-12-23","valuationDate":"2026-09-03","volatility":0.2,"riskFreeRate":0.02,"dividendYield":0.01}`

### `options_get_sentiment_data`

- **功能**：根据 ETF、股票或期货基础代码与时间区间，查询该品种期权的综合多空情绪数据，覆盖品种级时序、期限级时序、统计特征快照、行权价分布和期限结构对比；支持按期限数量和行权价数量控制返回范围。
- **适用场景**：用于观察指定区间内期权市场情绪的变化，比较不同期限的多空情绪，查看主要行权价附近的情绪分布，并结合统计特征识别情绪偏移。
- **返回**：返回品种级时序、期限级时序、统计特征快照、行权价分布和期限结构对比结果，并标注标的、查询区间以及期限和行权价筛选口径；无有效数据时明确返回空结果或异常状态。
- **边界**：必须提供可识别的期权标的代码或名称以及完整起止日期；期限数量和行权价数量只控制近期期限与平值附近行权价的返回范围，不能视为真实挂牌合约全量；需要逐合约量价、持仓和风险指标时，应转到合约截面或历史序列，需核对波动率形态时应另取相应波动率数据；跨标的比较时必须保持日期、期限筛选、行权价筛选和指标口径一致，情绪指标不等同于隐含波动率或交易信号。

| 参数 | 必填 | 类型 | 枚举 | 默认 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `windCode` | 是 | string | — | — | 期权标的代码或名称，如510050.SH或华夏上证50ETF。 |
| `startDate` | 是 | string | — | — | 开始日期（格式为 YYYY-MM-DD）。时序数据查询的起始日期。 |
| `endDate` | 是 | string | — | — | 结束日期（格式为 YYYY-MM-DD）。时序数据查询的结束日期。 |
| `termCount` | 否 | integer | — | 默认 `2` | 指定提取近期多少个月份（期限），传 0 表示所有月份。默认值为 2。 |
| `strikeCount` | 否 | integer | — | 默认 `5` | 指定围绕平值上下各返回多少个主要行权价。例如传 2 则返回大于平值2个、小于平值2个及平值本身，共5个。传 0 表示所有行权价。默认值为 5。 |

样例：`{"windCode":"510050.SH","startDate":"2026-08-01","endDate":"2026-09-03","termCount":2,"strikeCount":3}`

