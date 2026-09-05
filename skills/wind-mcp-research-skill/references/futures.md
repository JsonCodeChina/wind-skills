# `futures` 工具目录 —— 期货

> **这是目录，不是完整契约。** 表里的样例可以照抄直接跑；要改参数、要看【边界】、要看枚举取值，
> 先跑 `node scripts/cli.mjs describe futures <tool>`（离线、不花积分、单个工具约 1 千字）。
> 本文件由 `scripts/registry.json` 生成（vserver_futures_data，9 个工具 / 26 个参数），不要手改。

**覆盖**：期货品种的合约规格与交割规则、仓单与交割、基差、资金流向、交易所席位持仓排名、研报观点统计、商品供需基本面。

## 调用要点

- `windCode` 接受**品种代码**（`CU.SHF`）、**月合约代码**（`RB2610.SHF`）或**中文名**（螺纹钢），具体哪种由工具说明决定。
- `futures_get_supply_demand` 的 `type` 是**必填 integer**：1=供需平衡表，2=供应/产量/进口，3=需求/消费/出口，4=库存/仓单/港口库存。问「库存」传 4，问「产量」传 2。
- `futures_get_position_ranking` 的 `type` 是 integer（九类排名），`futures_get_warehouse_receipt` 的 `type` 是 **string**——同名字段类型不同，按各自契约填。
- `futures_get_contract_spec` 偶发「未识别到有效的金融标的」，**这条文案会让人误以为代码写错**；同参数重试通常即恢复，重试两次仍失败再改代码。
- 供需指标的地区口径以返回的指标元数据为准（实测沪铜主要是全球口径），不要默认当成中国市场。
- **「库存」有两个候选，别选错**：问某品种的整体库存水平/走势用 `futures_get_supply_demand` 的 `type=4`；只有明确要**仓单或交割的汇总/仓库级明细**时才用 `futures_get_warehouse_receipt`（汇总）或 `futures_get_warehouse_receipt_details`（分仓库）。
- `futures_get_basis.sector` 与 `futures_get_warehouse_receipt.type` 的 enum 只声明了英文系统值，但说明里的「映射关系」列出的中文键（有色金属 / 全市场 / 仓单 / 交割 …）后端同样接受，CLI 已一并放行，两种写法等价。
- `futures_get_supply_demand` **一次返回里的单位可能混排**（实测沪铜库存同时出现「吨」的交易所库存和「万吨」的地区库存，量级差 1 万倍）。逐行读各自的 `unit`，**不要跨行相加或直接比大小**。
- `futures_get_basis` 的**板块查询只有截面、没有序列**：传 `sector` + 日期区间会被静默降级成末日单日数据；要历史序列必须改用 `windCodes` 逐品种查。

## 工具目录

| 工具 | 用途 | 别选错（【边界】首句） | 入参（加粗=必填） | 可直接跑的样例 |
| --- | --- | --- | --- | --- |
| `futures_get_warehouse_receipt_details` | 按单个期货品种查询仓单的仓库级明细，返回分仓储区域的期末、新增和注销仓单记录。 | 仅登记仓单明细，不承诺交割明细、多品种、全市场或具体合约 | **windCode**, date | `{"windCode":"CU.SHF","date":"2026-09-03"}` |
| `futures_get_warehouse_receipt` | 按业务类型、期货品种代码及日期查询期货品种的交割或仓单汇总，支持单品种、多品种和全市场。 | 交割数据按月、仓单数据按日 | **type**, windCodes, date | `{"type":"receipt","windCodes":["CU.SHF","AL.SHF"],"date":"2026-09-03"}` |
| `futures_get_related_securities` | 按期货品种查询期货资产类别下已配置的产业链关联标的，并可按上游、中游或下游筛选。 | 仅覆盖期货资产类别下已配置的产业链关联记录，不延伸到其他资产类别、行业研究、现货价格或公司经营事实核验 | **windCode**, type | `{"windCode":"CU.SHF","type":["upstream"]}` |
| `futures_get_contract_spec` | 查询单个期货品种或标准合约的全球公开交易规格与交割规则。 | 不提供实时行情、持仓排名或基差 | **windCode**, fields | `{"windCode":"CU.SHF"}` |
| `futures_get_basis` | 按期货品种、板块或全市场查询基差快照及历史统计。 | 当前不承诺带日期的历史时序查询 | windCodes, sector, startDate, endDate ⚠二选一，见 `describe` | `{"windCodes":["CU.SHF"],"startDate":"2026-08-01","endDate":"2026-09-03"}` |
| `futures_get_fund_flow` | 按单品种或全市场查询指定交易日的期货资金变动统计，资金变动按持仓额变化估算。 | 资金流向不等同真实资金划转或保证金流动 | **date**, windCode | `{"date":"2026-09-03","windCode":"CU.SHF"}` |
| `futures_get_position_ranking` | 按品种和交易日查询交易所公开席位的九类排名，涵盖持仓、增减仓和成交量排名。 | 仅反映交易所公开席位排名，不等同客户持仓归因或交易策略 | **type**, **windCode**, date, limit | `{"type":1,"windCode":"CU.SHF","date":"2026-09-03","limit":5}` |
| `futures_get_research_opinion_stat` | 按单个期货品种和日期汇总公开研报的方向分类、统计结果、核心摘要及近 30 个交易日变化。 | 仅支持品种级查询，不替代研报原文核验、行情查询或供需数据 | **windCode**, date | `{"windCode":"CU.SHF","date":"2026-09-03"}` |
| `futures_get_supply_demand` | 按期货品种和基本面类型查询商品供需指标的最新值与历史时间序列，可按日期窗口和历史开关控制范围。 | 指标范围由已配置的 EDB 数据覆盖 | **windCode**, startDate, endDate, **type**, includeHistory | `{"windCode":"CU.SHF","type":4,"startDate":"2026-01-01","endDate":"2026-09-03"}` |

## 已知故障

| 工具 | 问题 |
| --- | --- |
| `futures_get_warehouse_receipt` | 只管仓单与交割的汇总口径。用户问「某品种库存多少」时应走 `futures_get_supply_demand` 的 `type=4`（库存/仓单/港口库存），不要用本工具。 |
| `futures_get_basis` | `sector`（板块）与 `startDate`/`endDate` **不能一起用**：同时传时后端会静默降级成 `endDate` 当日的单日截面，只在返回体的 `queryDataNote` 里留一句「日期区间仅支持单品种查询」，不报错。要板块的历史序列只能逐品种用 `windCodes` 循环调。实测已验证。 |
| `futures_get_supply_demand` | `includeHistory` **默认 true**：不显式关掉会返回整段历史序列（实测沪铜库存 1.6 万字），只要最新值时传 `includeHistory:false`（降到 2 千字）。另外一次返回里单位可能混排（「吨」与「万吨」并存，量级差 1 万倍），逐行读各自的 `unit`，不要跨行相加。 |

## 本 server 最容易选错的

`futures_get_supply_demand` 的 `type=4`（品种整体库存水平）vs `futures_get_warehouse_receipt`（仓单与交割汇总）vs `futures_get_warehouse_receipt_details`（分仓库明细）——问「库存多少」用第一个。

拿不准就 `node scripts/cli.mjs describe futures <tool>` 看完整的【边界】，它比上表的一句话摘要说得清楚。
