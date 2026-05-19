# wind-mcp-skill CLI 参数验证方案留档

状态：暂不接入 `scripts/cli.mjs`，暂不写入 `SKILL.md` 执行约束。

## 目标

参数验证如果后续接入 CLI，应只作为联网前的轻量 guardrail，用来拦截明显的本地构造错误，减少无效后端调用和错误 fallback。它不应复制完整后端 schema，也不应替代 Wind MCP 后端的业务校验。

## 建议保留的验证范围

- `params_json` 顶层必须是 JSON object。
- 未知字段拦截，尤其是 K 线和分钟线字段名混用：
  - K 线：`begin_date` / `end_date`
  - 分钟线：`begin` / `end`
- 必填字段拦截：
  - 快照：`windcode` / `indexes`
  - K 线：`windcode` / `begin_date` / `end_date`
  - NL 工具：`question`
  - 文档工具：`query`
  - EDB：`metricIdsStr`
- 日期字段校验：
  - 格式为 `yyyyMMdd`
  - 建议校验真实日历日期，例如拒绝 `20261399`
  - 建议校验开始日期不晚于结束日期
- 关键枚举校验：
  - K 线 `period`
  - K 线 `aftype`
  - K 线 `issusp`
  - NL `lang`
  - EDB `freq` / `magnitude` / `currency` / `searchType` / `ifUnion`
- `indexes` 专项校验：
  - 只允许 `references/indicators.md` 表格字段中的中文字段名
  - 不要全文正则抓 Markdown 里的所有反引号内容，因为说明文字、参数名、工具名也可能有反引号
  - 如果需要更稳，后续可新增机器可读的 `references/indicators.json`

## 不建议验证的范围

- 不在 CLI 中判断某个指标是否适用于股票、基金、指数等具体品种。
- 不在 CLI 中复制后端完整 schema。
- 不在 CLI 中为每个 NL 工具手写业务规则。
- 不在 CLI 中基于本地规则决定 fallback 到 `analytics_data`。

## 扩展性原则

如果未来接入 CLI 本地验证，建议按工具形态归类，而不是按每个工具硬编码：

- `get_*_price_indicators`：统一快照参数形态 `{ windcode, indexes }`
- `get_*_kline`：统一 K 线参数形态 `{ windcode, begin_date, end_date, count?, period?, aftype?, issusp?, afdate? }`
- `get_*_quote`：统一分钟线参数形态 `{ windcode, begin?, end? }`
- `{ question, lang? }`：默认 NL 参数形态，新增 NL 工具通常不需要改 CLI

只有新增全新的结构化参数形态时，才需要同步修改 CLI 本地验证逻辑。

## 错误码建议

如果未来接入运行时验证，可新增：

```json
{
  "LOCAL_PARAM_VALIDATION_ERROR": {
    "category": "schema",
    "retryable": false,
    "fallback_allowed": false,
    "agent_action": "按 error.hint 和 SKILL.md 工具表修正本地入参；不要发起后端调用或切换工具试错。"
  }
}
```

该错误码只表示 CLI 联网前拒绝了明显错误参数；不应和后端返回的 `PARAM_VALIDATION_ERROR` 混用。

## 实现备注

后续如果实现，应保持代码轻量：

- 使用少量 helper，例如 `checkFields` / `checkDate` / `checkEnum`。
- 不引入一套复杂 schema 框架，除非工具数量和结构化参数形态明显继续增长。
- `indicators.md` 解析只读取 Markdown 表格第一列中的字段 token；更推荐长期维护 `indicators.json`。
