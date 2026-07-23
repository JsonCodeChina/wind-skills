# `analytics_data` 工具契约

仅当专项服务无法覆盖结构化取数时使用；不得替代行情、K 线、Quote 或价格指标。自然语言统一使用 `question`。

- 首次调用保持用户原意，不增加筛选条件。
- 首次失败、空数据或明显不匹配后，才可在同一取数意图内改写或拆分一次。

<!-- BEGIN MCP TOOLS/LIST GENERATED CONTRACT -->
## 工具契约

### `get_financial_data`

对金融指标进行聚合、计算及跨品种的数据处理。处理任务包括：从单个公司数据汇总行业或板块级别的合计值（如某行业的总市场份额）、计算多实体间的加权平均或排名、从多个数据点推导复合指标、以及其他需要算术运算或AI辅助处理的数据变换。返回结构化的计算结果。

| 参数 | 必填 | 类型 | 枚举 | 默认值 | 官方说明 |
| --- | --- | --- | --- | --- | --- |
| `question` | 是 | string | — | "查询中国A股市场过去一年的平均成交量" | This parameter is used to input a query that specifies the desired market, company, or macroeconomic data. Ensure the query is clear, specific, and concise so that the model can accurately interpret it. Examples might include asking for historical data, average values, or trends over a specific time period. LLM should infer and fill in missing information (like timeframe or metric type) based on user context if poorly specified. |
| `lang` | 否 | string | zh-CN / en-US | "zh-CN" | 返回语言：zh-CN=简体中文，en-US=英文。 |
<!-- END MCP TOOLS/LIST GENERATED CONTRACT -->
