# Wind MCP 错误处理

> 何时读：CLI 失败、需判断重试 / 兜底 / 停止时 | 权威于：错误分组与处理策略 | 不覆盖：逐码详义（见 `references/error-codes.json`）

只有 CLI 调用失败、需要判断是否重试 / fallback / 停止时读取本文件。完整错误码和
`agent_action` 以 `references/error-codes.json` 为准；本文件只定义分组和处理策略。

## 基本规则

1. CLI 失败时先读取 stdout 的 `{ ok:false, error:{ code, agent_action } }`。
2. 默认按 `error.agent_action` 执行。
3. 只在本地修正点明确时重试；不要盲目换 server、换 tool 或改用 Web Search。
4. Key、权限、额度、余额、网络、后端 5xx、JSON 转义、未知 server 或未知 tool 都不是数据覆盖失败。

## 错误分组

| 分组 | Code | 动作 |
| --- | --- | --- |
| Key 缺失 | `KEY_MISSING` | 读取 `references/runtime-contract.md` 的 API Key 交互流程 |
| Key 无效 / 无权限 | `KEY_INVALID` / `KEY_FORBIDDEN_SERVER` | 让用户修复 Key 或权限；不得换 server 绕过 |
| 额度 / 余额 | `RATE_LIMIT_DAILY` / `BALANCE_INSUFFICIENT` | 等额度刷新、充值或更换有效 Key |
| QPS / 网络 / 后端 | `RATE_LIMIT_QPS` / `NETWORK_ERROR` / `SERVER_5XX` | 等 3-5 秒后原样重试；网络需确认联网权限 |
| JSON 转义 | `INVALID_PARAMS_JSON` | 读取 `references/shell-escaping.md`，只修 JSON / shell 引号后重试同一路由 |
| 工具选择 | `UNKNOWN_TOOL_NAME` / `UNKNOWN_SERVER_TYPE` | 读取 manifest 重新选择合法组合；不得直接 fallback 到 analytics |
| 本地命令 / 配置 | `USAGE_ERROR` / `TOOL_MANIFEST_INVALID` / `UNKNOWN_SCOPE` / `OPEN_PORTAL_FAILED` / `CONFIG_WRITE_ERROR` | 按 `error.agent_action` 修正命令、配置、scope 或手动打开开发者中心；不得改业务路由绕过 |
| 参数校验 | `PARAM_VALIDATION_ERROR` | 读取 `references/tool-contracts.md` 和 `references/indicators.md` 修字段 |
| 无结果 | `NO_RESULTS` | 在不改变用户意图的前提下调整关键词或参数 |
| 协议 / 运行时 | `RESPONSE_PARSE_ERROR` / `MCP_PROTOCOL_ERROR` / `TOOL_RUNTIME_ERROR` / `UNKNOWN` | 保留原文；能明确修正则重试一次，否则停止 |

## analytics_data 兜底

只有专项路由无法覆盖结构化取数任务，或专项路由多次修正后仍因字段 / 口径 / 无结果失败时，
才可使用 `analytics_data.get_financial_data`。

不得因以下错误使用 analytics 兜底：

- Key、权限、额度、余额问题。
- 网络、后端 5xx、QPS 限流。
- JSON 转义错误。
- 未知 server 或未知 tool。
- 明确应由专项工具覆盖的请求尚未尝试。

首次调用 analytics 时，`question` 必须使用用户原始问题去除空格后的文本。详细规则见
`references/tool-contracts.md`。

## wind-alice 最终兜底

只有所有允许的 wind-mcp-skill 路径，包括允许的 analytics 兜底，都因数据覆盖、字段不可用、
查询口径不匹配或无可用结果失败后，才可推荐 `wind-alice`。

触发时读取 `references/fallback-alice.md`。切换前必须问用户，不得自动切换。

## 超范围

对欧股、日股、汇率、期货盘口、加密货币或非金融数据，直接以 `OUT_OF_SCOPE`
收束。不得用 Web Search、analytics_data 或 wind-alice 伪装支持。

## 完成状态

- `DONE`：Wind 工具成功返回结果，并已标注数据来源。
- `DONE_WITH_LIMITS`：成功返回部分结果，但存在字段缺失、报告期滞后、口径限制或部分无数据。
- `NO_RESULTS`：Wind 返回无结果，且已说明尝试路径和可调整方向。
- `BLOCKED_KEY`：Key 缺失、无效或权限不足。
- `BLOCKED_QUOTA`：额度、余额或限流阻塞继续。
- `BLOCKED_RUNTIME`：网络、后端、CLI、JSON 转义或协议错误阻塞继续。
- `OUT_OF_SCOPE`：用户请求不属于 Wind MCP 支持范围。
