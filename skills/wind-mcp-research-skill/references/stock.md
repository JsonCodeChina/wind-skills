# `stock` 工具目录 —— 股票投研

> **这是目录，不是完整契约。** 表里的样例可以照抄直接跑；要改参数、要看【边界】、要看枚举取值，
> 先跑 `node scripts/cli.mjs describe stock <tool>`（离线、不花积分、单个工具约 1 千字）。
> 本文件由 `scripts/registry.json` 生成（vserver_stock_research，15 个工具 / 18 个参数），不要手改。

**覆盖**：单只股票的公司画像、历史财务、机构预期、估值、公司动态、资金流、技术面、实时行情；以及全市场与板块盘中概览、市场叙事、行业语料、自然语言选股。

## 调用要点

- `windCode` 接受**股票名称或 Wind 代码**（贵州茅台 / 600519.SH / AAPL.O / 0700.HK），不必自己补交易所后缀；名称有歧义时后端会报「未识别到有效的金融标的」，此时问用户要准确全称或代码，不要自己猜后缀。
- `stock_get_market_realtime_analysis`、`stock_get_asset_market_performance`、`stock_get_market_narratives` **不需要标的**，用于全市场概览。
- 叙事是两段式：`stock_get_market_narratives` 拿 `childId`，再传给 `stock_get_narrative_details`。
- 同一只股票的不同侧面各有专项工具，**不要用一个工具问全部**：历史财务→`finance_analysis`，机构预期→`earnings_estimate`，当前估值→`valuation`，公司动态/公告/新闻→`updates`，资金/融券→`money_flow_analysis`，技术指标→`technical_analysis`。
- `stock_screener` 只用于**未指定具体标的**的筛选；已经知道标的时一律走对应的专项工具。
- ⚠ **标的识别是非确定性的**：同一个非法代码（实测 `999999.XX`），大多数时候返回「未识别到有效的金融标的」，但也出现过**返回一只无关证券的真实数据**（中证800 `000906.SH`）且不报任何错。所以拿到数据后**必须核对返回体里的证券代码/公司名称是不是你问的那一个**，对不上就当作未识别处理，回头问用户要准确全称或 Wind 代码。

## 工具目录

| 工具 | 用途 | 别选错（【边界】首句） | 入参（加粗=必填） | 可直接跑的样例 |
| --- | --- | --- | --- | --- |
| `stock_get_market_realtime_analysis` | 查询当前交易日主要市场与跨资产的实时表现，覆盖A 股、港股、美股、全球股票、全球指数、商品和汇率，形成全市场盘中概览。 | 只提供全市场与跨资产的当前交易日实时表现概览，不按单一资产代码定位 | marketType | `{"marketType":"1"}` |
| `stock_get_sector_realtime_analysis` | 按一个板块、行业、主题或指数名称/万得代码查询盘中实时表现，覆盖基础行情、涨跌分布、点位序列、区间指标、重要成分股及板块分析。 | 用户已明确板块、行业、主题或指数时可直接查询 | **windCode** | `{"windCode":"半导体"}` |
| `stock_get_market_narratives` | 查询当前市场叙事列表，为后续展开单一叙事提供候选主题和子叙事标识。 | 需要查看某条叙事的时间线、来源标题或完整逻辑时，必须先从本列表选定子叙事标识，再进入叙事详情查询 | limit | `{"limit":3}` |
| `stock_get_narrative_details` | 在已获得市场叙事候选的基础上，按选定的子叙事标识（优先）或用户明确的叙事关键词，查询单一叙事的详细脉络。 | 需要展开叙事时，先获取市场叙事列表并从候选中选定子叙事标识，再查询详情 | childId, keyword ⚠二选一，见 `describe` | `{"keyword":"AI"}` |
| `stock_get_asset_market_performance` | 返回全球股票、债券、商品、汇率、房地产及现金/流动性等大类资产的阶段表现摘要与正文，帮助比较不同资产的区间变化及其宏观驱动。 | 用于大类资产的阶段性比较，不按具体证券或期货代码提供盘中报价 | （无） | `{}` |
| `stock_get_industry_research` | 按行业、赛道或主题关键词检索投研语料。 | 只问行业或赛道研究时直接使用本能力 | **keyword** | `{"keyword":"半导体"}` |
| `stock_get_company_profile` | 按股票名称或Wind股票代码查询上市公司综合画像，形成公司研究基础底稿。 | 实时行情、完整财务、机构预期、估值、动态、资金面、技术指标等按用户需求调用对应工具 | **windCode** | `{"windCode":"600519.SH"}` |
| `stock_get_company_finance_analysis` | 按股票名称或Wind股票代码查询公司历史财务研究与摘要，覆盖利润表、资产负债表、现金流量表、盈利质量、成本费用、杠杆、资产负债和财务分析语料等模块。 | 只返回历史实际财务及其分析，不代替机构预期、当前估值、实时行情或公司动态 | **windCode**, currency, reportType, reportPeriod | `{"windCode":"600519.SH","reportPeriod":"FY2025"}` |
| `stock_get_company_earnings_estimate` | 按股票名称或Wind股票代码查询机构一致预期、评级及收入、利润预测、EPS预测、ROE预测、ROA预测、PE预测等预测指标。 | 仅反映机构预测与评级，不替代历史实际财务或独立估值分析 | **windCode** | `{"windCode":"600519.SH"}` |
| `stock_get_company_valuation` | 按股票名称或Wind股票代码查询当前估值、估值趋势和可比公司相对估值字段，覆盖 PE、PB、PS、PCF、企业倍数及股息率等口径。 | 只反映估值指标及可比口径，不代替历史实际财务、机构预期或实时价格 | **windCode** | `{"windCode":"600519.SH"}` |
| `stock_get_company_updates` | 按股票名称或 Wind 股票代码汇总公司近期事件、公告、新闻、研究观点与投资者交流资料，快速了解公司最新动态。 | 仅用于获取公司近期动态与相关资料，不替代实时行情、财务、估值或机构一致预期 | **windCode** | `{"windCode":"600519.SH"}` |
| `stock_get_money_flow_analysis` | 按股票名称或Wind股票代码查询成交活跃度、资金流、融资融券、持仓及交易行为等结构化字段。 | 只提供资金面、融资融券、交易和持仓数据，不代替实时价格或技术指标 | **windCode** | `{"windCode":"600519.SH"}` |
| `stock_get_technical_analysis` | 按股票名称或Wind股票代码查询由行情数据计算的技术指标与关键价位，覆盖趋势、动能、波动通道、均线和回撤等模块。 | 只提供由行情数据形成的技术指标及关键价位，不代替财务、估值或资金面分析 | **windCode** | `{"windCode":"600519.SH"}` |
| `stock_get_realtime_analysis` | 按股票名称或Wind股票代码查询当前实时行情与盘中表现，覆盖股票、期货等可识别的单一资产。 | 全市场、板块/指数和跨资产阶段表现应分别进入对应范围的能力 | **windCode** | `{"windCode":"600519.SH"}` |
| `stock_screener` | 根据自然语言问句，从 A 股及海外股票市场识别股票实体、预定义指标及筛选条件，支持按行情、财务、估值、资金、技术等指标，以及行业板块、主题概念、主营业务等分类条件组合反查股票，返回标准化股票数据或符合条件的股票代码列表。 | 已明确具体股票及查询目标时，直接调用对应属性查询工具 | **question** | `{"question":"筛选沪深市场市值超500亿且连续5日上涨的股票"}` |

## 本 server 最容易选错的

`stock_get_company_finance_analysis`（历史实际财务）vs `stock_get_company_earnings_estimate`（机构预期）vs `stock_get_company_valuation`（当前估值）——三者互不覆盖，问「业绩怎么样」要先分清问的是哪一个。

拿不准就 `node scripts/cli.mjs describe stock <tool>` 看完整的【边界】，它比上表的一句话摘要说得清楚。
