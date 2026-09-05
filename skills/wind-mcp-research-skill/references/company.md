# `company` 工具目录 —— 企业工商与风控

> **这是目录，不是完整契约。** 表里的样例可以照抄直接跑；要改参数、要看【边界】、要看枚举取值，
> 先跑 `node scripts/cli.mjs describe company <tool>`（离线、不花积分、单个工具约 1 千字）。
> 本文件由 `scripts/registry.json` 生成（vserver_company_data，54 个工具 / 127 个参数），不要手改。

**覆盖**：境内企业（含非上市主体）的工商登记、股权与人员、经营资质、知识产权、招投标、供应链，以及司法诉讼、失信被执行、行政与环保处罚、税务异常、破产清算、股权冻结、舆情等风险记录。

## 调用要点

- **`companyKey` 不是证券代码**，是企业名称或统一社会信用代码（如「恒大地产集团有限公司」）。拿到用户给的股票代码或简称时，**先 `company_search_entity` 换成标准企业名**，再调用其余 53 个工具。
- 本 server 覆盖**非上市主体**，这是它与 stock server 的分界：上市公司的财务、估值、行情走 stock；企业的工商、司法、失信、处罚记录走这里。
- **日期字段分两派**：`company_get_court_announcements`、`company_get_court_sessions`、`company_get_filing_info`、`company_get_judgments`、`company_get_news_sentiment` 用 `timeFrom`/`timeTo`；其余带日期的工具一律 `startDate`/`endDate`。传错的一方会被**静默忽略**，静默返回默认区间（近 5 年）的全量数据而不报错——本 CLI 已在本地拦截未知字段。
- 本 server 的 schema 在历史上反复变动（日期字段名改过 4 轮）。命中「参数被忽略」或「工具不存在」时先跑 `node scripts/cli.mjs refresh company` 对齐，再重试。
- 54 个工具中 45 个只需 `companyKey`，选工具时按「要查什么记录」直接对照目录，不要用 `company_search_entity` 之外的工具做实体检索。

## 工具目录

| 工具 | 用途 | 别选错（【边界】首句） | 入参（加粗=必填） | 可直接跑的样例 |
| --- | --- | --- | --- | --- |
| `company_search_entity` | 根据企业名称、简称、曾用名、品牌或证券信息匹配企业实体。 | 若用户只提供简称、品牌、曾用名或其他可能匹配多个主体的关键词，先完成主体匹配 | **searchKey** | `{"searchKey":"恒大地产"}` |
| `company_list_beneficial_owner` | 查询企业的企业受益所有人公开记录。 | 最终受益人关注受益主体、受益比例及受益类型 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_actual_controller` | 查询企业的企业实控人公开记录。 | 实际控制人关注控制权及控制方式 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_key_personnel` | 查询企业的主要人员信息公开记录。 | 只核对法定代表人等登记字段时使用企业登记信息 | **companyKey**, history | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_customer_info` | 查询企业的企业客户信息公开记录。 | 销售关系与采购关系需区分 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_tech_roster` | 查询企业的科技型企业名录查询公开记录。 | 科技人员或技术资质名录与知识产权权利记录需区分 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_controlled_entity` | 查询企业的企业控股企业公开记录。 | 只看被查询企业控制的下属企业 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_shareholder` | 查询企业的企业股东信息公开记录。 | 当前股东明细不等于实际控制人、最终受益人或逐层股权链 | **companyKey**, history | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_trade_credit` | 查询企业的进出口信用评价公开记录。 | 只核查海关进出口信用 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_tax_qual` | 查询企业的纳税人资质公开记录。 | 只核查纳税人资质或资格认定 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_ubo_related` | 查询企业的最终受益人关联企业公开记录。 | 围绕最终受益人及其关联关系、受益比例进行核查 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_traverse_equity` | 查询企业的企业股权多层穿透公开记录。 | 用于还原逐层持股和控制路径 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_equity_change` | 查询企业的股权变更公开记录。 | 只关注股东、出资或持股比例的历史变化 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_contact` | 查询企业的企业联系方式公开记录。 | 只需电话、地址等联系方式时使用本范围 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_trademark` | 查询企业的商标信息公开记录。 | 只核查商标权利及其状态 | **companyKey**, trademarkStatus | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_standard` | 查询企业的企业标准信息公开记录。 | 只核查标准发布、参与或认定记录 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_change_record` | 查询企业的企业变更记录公开记录。 | 用于查询历史工商事项的整体变动 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_bidding` | 查询企业的企业招投标记录查询公开记录。 | 用于项目、招标、采购和中标公告的完整明细 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_annual_report` | 查询企业的企业年报查询公开记录。 | 只核查年报披露的客户或供应商信息 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_registration_info` | 查询企业的企业工商信息公开记录。 | 用于当前工商登记状态和主体基本字段 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_tax_credit_rating` | 查询企业的纳税信用等级公开记录。 | 只核查年度纳税信用等级 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_patent` | 查询企业的专利信息公开记录。 | 只核查专利权利及其状态 | **companyKey**, patentType, lawStatus, history | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_investment` | 查询企业的企业对外投资信息公开记录。 | 用于查询企业全部对外投资关系 | **companyKey**, history | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_list_supplier` | 查询企业的企业供应商公开记录。 | 采购关系与销售关系需区分 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_abnormal_operation` | 查询企业的经营异常名录查询公开记录。 | 只核查市场监管认定的经营异常名录 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_bankruptcy_reorg` | 查询企业的破产重整信息查询公开记录。 | 只核查破产重整程序 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_court_announcements` | 查询企业的法院公告查询公开记录。 | 不指定案由或当事人角色时可直接查询 | **companyKey**, timeFrom, timeTo, causeOfAction, role | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_court_sessions` | 查询企业的企业开庭公告查询公开记录。 | 不指定案由或当事人角色时可直接查询 | **companyKey**, timeFrom, timeTo, causeOfAction, role | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_default_info` | 查询企业公开披露的非标资产风险记录。 | 只覆盖债券违约、商票逾期和非标资产风险 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_disciplinary_list` | 查询企业的企业惩戒名单查询公开记录。 | 只核查惩戒或监管名单 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_discredit` | 查询企业的失信被执行人查询公开记录。 | 只核查失信被执行人状态 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_enterprise_score` | 查询企业的企业综合评分公开记录。 | 只提供企业风险综合评分或等级 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_environment_penalty` | 查询企业的环保处罚查询公开记录。 | 只核查生态环境领域行政处罚 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_equity_pledged` | 查询企业的股权出质查询公开记录。 | 只核查股权出质登记 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_executed_persons` | 查询企业的被执行案件查询公开记录。 | 只核查一般被执行人及执行案件记录 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_filing_info` | 查询企业的企业诉讼信息查询公开记录。 | 不指定案由或当事人角色时可直接查询 | **companyKey**, timeFrom, timeTo, causeOfAction, role | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_final_case` | 查询企业的终本案件查询公开记录。 | 只核查终结本次执行程序记录 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_financial_leasing` | 查询企业的融资租赁登记查询公开记录。 | 只核查融资租赁登记事项 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_high_consumers` | 查询企业被法院限制高消费的公开记录。 | 只核查限制高消费记录 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_illegal_dishonesty` | 查询企业的严重违法失信查询公开记录。 | 只核查严重违法失信相关记录 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_illegal_tax` | 查询企业的税收违法记录查询公开记录。 | 只核查税收违法案件或处理记录 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_judgments` | 查询企业的法律判决文书查询公开记录。 | 不指定案由或当事人角色时可直接查询 | **companyKey**, timeFrom, timeTo, causeOfAction, role | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_judicial_sales` | 查询企业的司法拍卖资产查询公开记录。 | 只核查司法拍卖或司法处置资产 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_land_acquisition` | 查询企业的国有土地受让公开记录。 | 只核查企业土地取得或土地交易记录 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_legal_notice` | 查询企业的法律送达公告查询公开记录。 | 只核查送达公告等法律文书公告 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_liquidation` | 查询企业的经营风险｜破产清算公开记录。 | 只核查破产清算或清算程序 | **companyKey** | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_news_sentiment` | 查询企业公开新闻报道和舆情信息。 | 不指定舆情标签时可直接查询 | **companyKey**, tagCode, emotionId, newsPenetrateEnable, timeFrom, timeTo | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_owing_tax` | 查询企业的企业欠税查询公开记录。 | 只核查欠税公告或欠缴税款信息 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_penalty_info` | 查询企业的行政处罚查询公开记录。 | 只核查一般行政处罚 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_share_lockup` | 查询企业司法协助中的股权冻结公开记录。 | 只核查股权司法冻结或查封等限制处分状态 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_simple_cancellation` | 查询企业的经营风险｜简易注销公开记录。 | 只核查简易注销程序 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_tax_abnormal` | 查询企业的税务非正常户查询公开记录。 | 只核查税务非正常户状态 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_valuation_inquiry` | 查询企业的资产询价查询公开记录。 | 只核查司法资产询价或评估前置记录 | **companyKey**, startDate, endDate | `{"companyKey":"恒大地产集团有限公司"}` |
| `company_get_biz_enum` | 查询风控业务筛选所需的业务分类。 | 若需要完整案由、当事人角色或舆情标签，按“先取分类名、再取分类选项、最后带入相应筛选查询”的顺序使用 | **listType**, categoryName | `{"listType":1}` |

## 本 server 最容易选错的

「失信被执行」`company_get_discredit`、「终本案件」`company_get_final_case`、「限制高消费」`company_get_high_consumers`、「被执行案件」`company_get_executed_persons` 是四种不同的司法执行结果，用户不用原词提问时（如「法院查不到财产的案子」＝终本）必须先 `describe` 看【边界】。

拿不准就 `node scripts/cli.mjs describe company <tool>` 看完整的【边界】，它比上表的一句话摘要说得清楚。
