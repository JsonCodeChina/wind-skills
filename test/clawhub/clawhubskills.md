| 候选 Skill | Skill 内容 | 与现有 Skill 对比分析 |
|---|---|---|
| `crypto-market-data` | 查询加密货币实时价格、市值、成交量、热门币、排行榜、OHLC、历史行情、全球市场指标和上市公司数字货币储备；兼带股票报价与公司资料查询 | 现有 `stock-analysis` 能分析部分加密货币，但偏评分、热点与风险判断；该 skill 更偏底层数据获取。其加密市场数据有一定增量，股票报价部分与 Wind、同花顺和 Tushare 重复 |
| `a-stock-analysis` | 获取A股实时行情和分钟数据，分析早盘、尾盘成交量分布、放量分钟、涨跌停状态，并管理本地持仓和计算盈亏 | 与 `intraday_abnormal_move_alert_skill`、`volume_spike_reasoning_skill`、`gap_open_interpreter_skill` 重叠；区别是它带有新浪财经采集脚本和分钟成交分布计算。持仓部分与仓位、止损、止盈类 skills 重复 |
| `tushare-data` | 将中文自然语言转换成 Tushare 查询任务，处理标的识别、时间默认值、接口选择、分段拉取、限流重试、结果合并、导出和简要分析 | 与现有 `tushare-finance-skill` 使用相同数据源。现有版本偏接口能力和数据获取；该候选更偏自然语言路由、容错及研究工作流，属于同一能力的增强版本 |
| `mx-finance-search` | 使用东方财富妙想搜索财经新闻、公司公告、券商研报、交易所动态、官方政策和行业热点 | `ifind-finance-data` 已支持新闻公告和资讯检索；`watchlist_news_impact_digest_skill`、`major_announcement_impact_skill`、`policy_headline_interpreter_skill` 负责后续分析。该 skill 主要增加东方财富资讯源 |
| `mx-macro-data` | 用自然语言查询全球 GDP、CPI、PPI、货币、利率、财政、贸易、就业和产业运行等宏观数据，输出 CSV 和数据说明 | Wind、`ifind-finance-data`、`tushare-finance-skill` 都能查询宏观指标；`macro_event_market_impact_skill` 负责解读影响。该候选的特点是输入约束、结果完整性检查和缺失数据补查流程 |
| `mx-stocks-screener` | 通过自然语言按行情、估值、财务、技术、业务、行业、概念、消息和情绪条件筛选A股、港股、美股、基金、ETF、可转债及板块 | `ifind-finance-data` 已支持自然语言选股选基；`canslim_growth_scan_skill`、`breakout_candidate_finder_skill`、`value_dividend_candidate_skill` 等负责特定策略筛选。该候选更像东方财富通用筛选数据接口 |
| `mx-finance-data` | 查询指定股票、基金、债券、板块或企业的行情、估值、财务报表、公司资料及量化指标，输出 Excel 和 Markdown | 正式目录已经存在同名 `mx-finance-data`，功能基本相同，属于直接重复 |
| `stock-monitor-skill` | 后台持续监控股价，支持成本涨跌、均线金叉死叉、RSI、成交量异动、跳空缺口、动态止盈和多条件共振预警 | 与 `intraday_abnormal_move_alert_skill`、`support_break_warning_skill`、`price_target_reach_alert_skill`、`stop_loss_discipline_skill`、`take_profit_ladder_skill` 高度重叠；区别是它将规则集中在一个常驻监控程序中 |
| `t-trading` | 使用维加斯通道、EMA、斐波那契回撤和多周期共振进行技术分析，输出评分、趋势、入场位、止损位和止盈目标 | 与 `trade_plan_builder_skill`、`breakout_trade_execution_skill`、`support_break_warning_skill`、`position_sizing_decision_skill` 等交易工作流重复；区别是它固定使用维加斯通道这一特定技术体系 |
| `stock-analysis` | 对股票和加密货币进行多维评分，支持自选股预警、投资组合、股息分析、热门资产扫描、传闻扫描和风险检测 | 正式目录已将研究、选股、预警、仓位、止损和止盈拆成多个聚焦 skill。该候选把大量功能集中在一个 skill 中，覆盖面广，但与现有能力的交叉最多 |
| `stock-market-pro` | 基于 Yahoo Finance 查询行情和基本面，输出 ASCII 趋势及带 RSI、MACD、布林带、VWAP、ATR 的 PNG 图表，并可搜索新闻和期权信息 | 行情和基本面与 Wind、同花顺、Tushare 重复；技术分析与突破、支撑、交易计划类 skills 有交叉。主要差异是能够直接生成高分辨率技术图表 |
| `stock-watcher` | 管理本地A股自选列表，支持添加、删除、清空和查看近期表现，行情来自同花顺网页 | 与 `daily_watchlist_morning_brief_skill`、`after_close_watchlist_recap_skill`、`watchlist_news_impact_digest_skill` 重叠；该候选更偏底层自选股名单管理，现有 skills 更偏自选股分析和报告 |
| `yahoo-finance` | 查询全球股票、ETF、外汇和加密货币的价格、基本面、财报、公司资料、分红、分析师评级、期权和历史行情 | 与 `wind-mcp-skill`、`ifind-finance-data`、`tushare-finance-skill` 的市场数据能力重叠；优势是无需 API Key、覆盖海外证券和期权，但数据质量与权限弱于专业数据源 |
| `akshare-stock` | 使用 AkShare 查询A股实时行情、历史K线、财务数据、板块、资金流向、龙虎榜、新股和融资融券 | 与 Wind、同花顺和 Tushare 数据 skills 的A股能力重叠；特点是免费且无需 Token，但依赖公开网页接口，稳定性和字段一致性相对较弱 |
| `tushare-finance` | 提供 220 多个 Tushare Pro 接口，覆盖股票、指数、基金、期货、债券、财务报表和宏观数据 | 正式目录已经有 `tushare-finance-skill`，数据源、接口范围和触发场景基本相同，属于直接重复 |
| `china-stock-analysis` | 根据A股和港股行情、趋势、成交量、均线、支撑压力、基本面和新闻生成买入、持有或卖出建议 | 与 `stock_first_look_skill`、`equity-investment-thesis`、`valuation_snapshot_skill`、`trade_plan_builder_skill` 等研究决策能力重叠；该候选更像一个通用分析提示词，缺少独立数据工具 |
| `xero` | 连接 Xero 会计系统，管理联系人、发票、付款、科目、银行交易，并生成利润表、资产负债表和试算平衡表 | 现有正式 skills 聚焦证券研究、市场数据和投资决策，没有企业会计系统管理能力，因此功能不重复，但属于企业财务自动化领域，与当前仓库业务边界不同 |
| `woocommerce` | 管理 WooCommerce 商品、变体、分类、订单、客户、优惠券、税率、配送、退款、Webhook 和销售报表 | 现有 skills 没有电商后台管理功能，因此不存在直接重复；但它属于电商运营和商店自动化，与证券投资研究体系没有业务关联 |
| `lnbits-with-qrcode` | 管理 LNbits 比特币闪电钱包，包括余额查询、创建收款 Invoice、生成二维码、解析 Invoice 和执行支付 | 现有 skills 没有数字钱包和链上支付能力，因此不重复；但它处理真实资产转移，属于支付执行能力，而现有仓库主要提供研究、分析和决策支持 |
| `university-applications` | 实际内容是八字、紫微、奇门、六爻、梅花易数、风水、合婚、每日运程、HTML 命理报告和定时推送 | 与现有金融 skills 没有功能重复，但目录名称与实际内容不符，且命理占卜与金融数据、证券研究和投资决策体系没有关联 |