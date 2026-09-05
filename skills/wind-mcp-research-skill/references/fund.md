# `fund` 工具目录 —— 基金投研

> **这是目录，不是完整契约。** 表里的样例可以照抄直接跑；要改参数、要看【边界】、要看枚举取值，
> 先跑 `node scripts/cli.mjs describe fund <tool>`（离线、不花积分、单个工具约 1 千字）。
> 本文件由 `scripts/registry.json` 生成（vserver_fund_research，21 个工具 / 68 个参数），不要手改。

**覆盖**：公募基金与 ETF 的档案、净值、规模、业绩、申赎状态、财务；资产/行业/券种配置与股票、债券、基金持仓明细；Brinson 归因、多因子收益归因、风格暴露、选股择时能力；相似基金、ETF 申赎清单、自然语言选基。

## 调用要点

- **两类入参风格，别混用**：批量档案类（`fund_get_basic_info` / `nav` / `size` / `performance` / `financials` / `purchase_redemption_status` / `listed_historical_price`）用 `windCodes`（**数组**）；单基金分析类（持仓、配置、归因、风格、相似基金、PCF）用 `windCode`（**字符串**）。
- 持仓与配置类工具的 `reportDate` 是**必填**，格式 `YYYY-MM-DD`，通常填季末（如 `2026-06-30`）；填非报告期日期时后端返回「截至该日可获得的最新一期」，不会报错。
- `fund_screener` 的自然语言字段是 **`query`**，不是 `question`——这是七个 server 里唯一的例外。
- 归因类必须给基准：`fund_get_brinson_attribution` 用 `benchCode`，`fund_get_return_attribution` 用 `benchmarkWindCode`，两者字段名不同。
- `fund_get_selection_timing_analysis` 只覆盖部分主动管理基金；被动指数、货币、未覆盖样本会返回「Wind 数据源当前不可用，请稍后重试」——**这是覆盖缺失的误导文案，重试无用**，应改为向用户说明该基金无评价数据。

## 工具目录

| 工具 | 用途 | 别选错（【边界】首句） | 入参（加粗=必填） | 可直接跑的样例 |
| --- | --- | --- | --- | --- |
| `fund_get_similar_funds` | 根据基金代码查询基金的相似基金信息，寻找同类可比基金候选。 | 相似度结果用于筛选同类候选，不等同于业绩、评级或风险结论 | **windCode**, startDate, endDate, onlyValid | `{"windCode":"510300.OF"}` |
| `fund_get_brinson_attribution` | 根据基金代码、比较基准和分析区间查询指定基准的 Brinson 归因分析。 | 比较基准、区间和持仓口径必须保持一致 | **windCode**, **benchCode**, reportDate, heldFundType, queryMode, industryStandard | `{"windCode":"510300.OF","benchCode":"000300.SH","reportDate":"2026-06-30"}` |
| `fund_get_style_analysis` | 根据基金代码和分析区间查询基金风格暴露分析数据，可指定风格或使用默认组合。 | 风格暴露是模型分析结果，不等同于实际持仓明细或净值收益归因 | **windCode**, startDate, endDate, cycle, indexs | `{"windCode":"510300.OF","startDate":"2025-09-01","endDate":"2026-09-01"}` |
| `fund_get_return_attribution` | 根据基金代码、基准及分析区间查询基金多因子模型分析结果，分析基金收益变化的主要因子来源。 | 模型因子只覆盖所选模型纳入的因子，不等同于行业持仓归因 | **windCode**, **benchmarkWindCode**, **startDate**, **endDate**, modelType, cycle, marketIndex, riskRate, marketStyle, includeComponents | `{"windCode":"510300.OF","benchmarkWindCode":"000300.SH","startDate":"2025-09-01","endDate":"2026-09-01"}` |
| `fund_get_selection_timing_analysis` | 根据基金代码和分析区间查询基金主动管理能力分析结果，评估选股能力、择时能力和综合主动管理能力。 | 该结果依赖成立年限、分析区间和同类样本 | **windCode**, year, date | `{"windCode":"000001.OF","year":"3"}` |
| `fund_get_asset_allocation` | 查询基金在指定日期可获取的最新资产配置数据。 | 这是报告期资产结构，不替代行业或单只证券持仓 | **windCode**, **reportDate** | `{"windCode":"510300.OF","reportDate":"2026-06-30"}` |
| `fund_get_industry_allocation` | 根据基金代码和报告期查询基金行业配置结构及行业分析数据。 | 两种占比的分母不能混用 | **windCode**, **reportDate**, classificationType | `{"windCode":"510300.OF","reportDate":"2026-06-30"}` |
| `fund_get_bond_type_allocation` | 根据基金代码和指定日期查询截至该日可获得的最新债券券种结构。 | 券种比例的分母是债券投资市值，不与基金净值或全部资产比例混用 | **windCode**, **reportDate** | `{"windCode":"510300.OF","reportDate":"2026-06-30"}` |
| `fund_get_equity_holdings` | 根据基金代码和报告期查询基金全部股票持仓明细。 | 这是已披露报告期的持仓明细，不代表报告期之间的实时仓位 | **windCode**, **reportDate**, industryType | `{"windCode":"510300.OF","reportDate":"2026-06-30"}` |
| `fund_get_top_equity_holdings` | 根据基金代码和报告期查询基金披露的重仓股票持仓明细。 | 重仓结果是已披露持仓中的重点子集，不等同于全部股票持仓或实际控制关系 | **windCode**, **reportDate**, industryType | `{"windCode":"510300.OF","reportDate":"2026-06-30"}` |
| `fund_get_bond_holdings` | 根据基金代码和报告期查询基金披露的重仓债券持仓信息。 | 重仓债券只代表披露的重点券种，不等同于全部债券资产或券种结构 | **windCode**, **reportDate** | `{"windCode":"000001.OF","reportDate":"2026-06-30"}` |
| `fund_get_top_fund_holdings` | 根据基金代码和报告期查询组合中重仓持有的其他公募基金明细，适用于 FOF、MOM 及其他持有公募基金的基金产品。 | 只覆盖组合持有的其他公募基金，不替代股票或债券持仓 | **windCode**, **reportDate** | `{"windCode":"005220.OF","reportDate":"2026-06-30"}` |
| `fund_get_etf_pcf` | 查询某只 ETF 在指定日期的申购赎回成分证券及现金替代参数。 | 这是 ETF 申赎清单，不替代单日行情或技术指标 | **windCode**, **asOfDate** | `{"windCode":"510300.SH","asOfDate":"2026-09-03"}` |
| `fund_get_basic_info` | 获取单只或多只基金的基础档案，包含产品识别、分类、成立日期、管理人、基金经理和业绩比较基准等字段。 | 基础档案适合作为后续净值、规模、持仓和业绩查询的实体入口，不包含这些专题数据 | **windCodes**, includeFields | `{"windCodes":["510300.OF","000001.OF"]}` |
| `fund_get_nav` | 获取单只或多只基金截至指定查询日期可取得的时点单位净值。 | 仅返回时点值，不提供历史或区间净值序列、分红拆分折算、区间收益、排名评级、风险指标、规模份额、场内行情或申赎状态 | **windCodes**, asOfDate, includeFields | `{"windCodes":["510300.OF","000001.OF"],"asOfDate":"2026-09-03"}` |
| `fund_get_purchase_redemption_status` | 获取单只或多只基金最新的交易和申赎状态。 | 只反映最新可取得状态，不提供历史状态、申赎费率、申赎清单、场内行情或基金基础档案 | **windCodes**, includeFields | `{"windCodes":["510300.OF","000001.OF"]}` |
| `fund_get_performance` | 根据基金代码和分析区间查询基金业绩表现及风险评价数据。 | 各收益和风险指标必须按同一截止日、频率、年化方式和基准解释 | **windCodes**, includeFields, asOfDate, benchmarkWindCode | `{"windCodes":["510300.OF","000001.OF"],"asOfDate":"2026-09-03"}` |
| `fund_get_listed_historical_price` | 根据基金代码和指定交易日查询基金交易行情及市场交易数据。 | 这是指定交易日的单日行情，不替代技术分析或申赎清单 | **windCodes**, includeFields, tradeDate | `{"windCodes":["510300.SH"],"tradeDate":"2026-09-03"}` |
| `fund_get_size` | 根据基金代码和指定日期或报告期查询基金规模信息。 | 最新时点规模与报告期规模不能混用 | **windCodes**, includeFields, asOfDate | `{"windCodes":["510300.OF","000001.OF"],"asOfDate":"2026-09-03"}` |
| `fund_get_financials` | 根据基金代码和报告期查询基金财务报表相关的产品级数据。 | 财务报表数据按报告期解释，不等同于最新规模快照 | **windCodes**, includeFields, reportPeriod | `{"windCodes":["510300.OF","000001.OF"],"reportPeriod":"2026-06-30"}` |
| `fund_screener` | 根据自然语言问句，从公募基金及 ETF 等基金市场识别基金实体、预定义指标及筛选条件，支持按基金规模、净值表现、收益风险等指标，以及基金类型、基金管理人、基金经理、跟踪指数、投资主题、行业方向等分类条件组合反查基金，返回标准化基金数据或符合条件的基金代码列表。 | 已明确具体基金及查询目标时，直接调用对应净值、规模、持仓、业绩风险等属性查询工具 | **query** | `{"query":"规模大于100亿的货币型基金"}` |

## 已知故障

| 工具 | 问题 |
| --- | --- |
| `fund_get_selection_timing_analysis` | 仅部分基金有评价数据；被动指数/货币/未覆盖样本返回「Wind 数据源当前不可用，请稍后重试」（误导文案，重试无用）。已验证可用样本：000001.OF、005827.OF |
| `fund_get_size` | 工具说明提到「reportDate 控制报告期类字段」，但 schema 的 properties 里没有 reportDate。实测传与不传返回完全一致——该字段被静默忽略，报告期类字段始终返回最新一期。 |

## 本 server 最容易选错的

`fund_get_equity_holdings`（全部股票持仓，几百只）vs `fund_get_top_equity_holdings`（披露的重仓股，十只左右）——问「持仓」多半要后者，问「全部持仓明细」才用前者。

拿不准就 `node scripts/cli.mjs describe fund <tool>` 看完整的【边界】，它比上表的一句话摘要说得清楚。
