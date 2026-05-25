# Wind MCP 错误处理

> 何时读：CLI 失败、需判断重试 / 兜底 / 停止时 | 权威于：错误分组与处理策略 | 不覆盖：逐码详义（见 `references/error-codes.json`）

只有 CLI 调用失败、需要判断是否重试 / fallback / 停止时读取本文件。完整错误码和
`agent_action` 以 `references/error-codes.json` 为准；本文件只定义分组和处理策略。

## 失败处理阶梯

CLI 退出码非 0 时按下列顺序处理，**不得跳级，尤其不得用兜底掩盖非数据失败**。

0. **读码**：先读 stdout 的 `error.code` 与 `error.agent_action`；默认按 `agent_action` 执行。

1. **先排除“非数据失败”**——它们**不算“没取到数据 / 查询失败”，禁止据此换工具或上兜底**，必须在各自层面修复后重试同一 `server_type + tool_name`：
   - `INVALID_PARAMS_JSON`（shell / JSON 转义）→ 读 `references/shell-escaping.md`，只修引号 / 转义。
   - `KEY_MISSING` / `KEY_INVALID` / `KEY_FORBIDDEN_SERVER` → 按 Key 流程修复（`KEY_MISSING` 先问用户）。
   - `RATE_LIMIT_DAILY` / `RATE_LIMIT_QPS` / `BALANCE_INSUFFICIENT` / `NETWORK_ERROR` / `SERVER_5XX` → 等待 / 充值 / 修网络后原样重试。
   - `UNKNOWN_SERVER_TYPE` / `UNKNOWN_TOOL_NAME` → 按 `references/tool-manifest.json` 重选合法组合，不得直接转 analytics。
   - 其余本地命令 / 配置 / 协议类（`USAGE_ERROR` / `TOOL_MANIFEST_INVALID` / `UNKNOWN_SCOPE` / `OPEN_PORTAL_FAILED` / `CONFIG_WRITE_ERROR` / `RESPONSE_PARSE_ERROR` / `MCP_PROTOCOL_ERROR` / `TOOL_RUNTIME_ERROR` / `UNKNOWN`）→ 按 `references/error-codes.json` 的 `agent_action` 修正；能明确修正则重试一次，否则保留原文停止。

2. **数据类失败做“意图不变重试”**（`PARAM_VALIDATION_ERROR` / `NO_RESULTS`）：在**不改变用户标的与口径**的前提下修正后重试同一路由：
   - `PARAM_VALIDATION_ERROR` → 按 `references/tool-contracts.md` / `references/indicators.md` 核对并修字段名、必填、日期、枚举、`indexes`。
   - `NO_RESULTS` → 调整关键词、时间范围或粒度。
   修正点明确时可再试一两次；**不得借口“问句复杂”跳过本步直接兜底**。

3. **第 2 步仍失败才升级兜底**（仍报错或仍无数据，且根因属数据覆盖 / 字段不可用 / 口径不匹配 / 无结果）：
   a. 属结构化取数、且专项工具覆盖不到 → `analytics_data.get_financial_data`（`question` 忠实用户原意图，详见下方「analytics_data 兜底」）。
   b. analytics 也失败或问题不适合它 → `wind-alice` 最终兜底，**先问用户**（见 `references/fallback-alice.md`）。
   超范围请求（欧股 / 日股 / 汇率 / 期货盘口 / 加密 / 非金融）直接 `OUT_OF_SCOPE`，不兜底。

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
