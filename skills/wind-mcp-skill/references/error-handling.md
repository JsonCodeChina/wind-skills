# Wind MCP 错误处理

> 何时读：CLI 失败、需判断重试 / 兜底 / 停止时 | 权威于：错误分组与处理策略 | 不覆盖：逐码详义（见 `references/error-codes.json`）

只有 CLI 调用失败、需要判断是否重试 / fallback / 停止时读取本文件。完整错误码和
`agent_action` 以 `references/error-codes.json` 为准；本文件只定义分组和处理策略。

## 失败状态机

CLI 退出码非 0 时按下列顺序处理，**不得跳级，尤其不得用兜底掩盖非数据失败**。

0. **读码定域**：先读 stdout 的 `error.code` 与 `error.agent_action`。`agent_action` 是当前错误码的直接修复指令；本表是同一套状态机的完整说明。若二者看似冲突，停止重试并说明文档不一致，不得自行选择解释。

| error.code | 错误域 | 允许的下一步 | 禁止 |
| --- | --- | --- | --- |
| `INVALID_PARAMS_JSON` | 命令传递 | 读 `references/shell-escaping.md`；用同一执行路径运行 argv 探针，验证第三参数能被 `JSON.parse` 解析；探针通过前不得调用 Wind CLI；探针通过后，最终 CLI 调用第三参数必须逐字符复用探针通过的 params_json；只修 JSON 字符串、shell 引号、执行器转义；重试同一 `server_type + tool_name` 和同一业务参数语义 | 不得改工具、server、字段、日期、`indexes`、`question` 或数据意图 |
| `PARAM_VALIDATION_ERROR` | 业务参数 | 只读当前 `tool_name` 在 `references/tool-contracts.md` 的对应段落；仅当参数包含 `indexes` 时读取 `references/indicators.md` 的相关类别；只修字段名、必填项、日期、枚举和用户明确请求的 `indexes`；`indexes` 每个值必须逐字存在于 `indicators.md`；契约证明当前工具无法表达字段 / 口径时，可切换同业务域专项工具 | 不得改命令引号 / JSON 转义；不得添加用户未请求的指标；不得传入未收录英文缩写 / 拼音 / API 字段名 / 用户口语词 / 自行翻译词；不得直接上 analytics；不得发明字段或指标 |
| `UNKNOWN_SERVER_TYPE` / `UNKNOWN_TOOL_NAME` | 路由 | 读 `references/tool-manifest.json` 和路由规则；重选合法组合后重试 | 不得改业务口径绕过；不得直接上 analytics |
| `KEY_MISSING` / `KEY_INVALID` / `KEY_FORBIDDEN_SERVER` | 认证 / 权限 | 按 Key 流程处理；需要用户输入或授权时先问用户；修复后原样重试 | 不得换工具绕过权限 / Key |
| `RATE_LIMIT_DAILY` / `RATE_LIMIT_QPS` / `BALANCE_INSUFFICIENT` | 额度 / 限流 | 等待、换有效 Key、充值或按提示处理；修复后原样重试 | 不得换工具绕过额度 / 限流 |
| `NETWORK_ERROR` / `BACKEND_UNAVAILABLE` | 网络 / 后端 | `NETWORK_ERROR` 修网络或申请联网权限后原样重试；`BACKEND_UNAVAILABLE` / 服务暂不可用先按当前工具契约检查 params key 和 value，确认无入参错误后再稍后原样重试；若明确是请求过大或超时，只缩小范围或减少字段 | 不得改 shell 引号 / JSON 转义；不得改数据意图或路由；不得换工具绕过 |
| `NO_RESULTS` | 数据结果 | 保持同一 `server_type`、`tool_name` 和用户意图；只调整关键词、时间范围或粒度中与原问题直接相关的一项；最多重试一次；仍失败才按允许路径兜底 | 不得编造值；不得用常识补全 |
| `RESPONSE_PARSE_ERROR` / `MCP_PROTOCOL_ERROR` / `TOOL_RUNTIME_ERROR` / `UNKNOWN` | 协议 / 运行时 | 查看 `agent_action` 和后端原文；`TOOL_RUNTIME_ERROR` 若出现服务暂不可用、工具执行失败或类似后端泛化提示，先按当前工具契约检查 params key 和 value；只有详情明确指向请求过大、字段口径或数据覆盖时才只修该项并重试一次；其它能明确定位则修一次，否则停止并保留原文 | 不得盲目重试或切换工具；不得修改 shell 或扩展指标 |

## 重试前审计

每次重试前必须核对：

- 上一次 `error.code`。
- 本次改动是否属于上表允许的错误域。
- 是否保持同一 `server_type`、`tool_name` 和业务参数语义。
- 除非上一次是 `INVALID_PARAMS_JSON`，否则不得改命令引号 / JSON 转义。
- 除非上一次是 `PARAM_VALIDATION_ERROR`、`NO_RESULTS`，或 `agent_action` 明确要求缩小范围 / 减少字段，否则不得改业务参数。
- params key 必须来自 `tool-contracts.md`；`indexes` 必须来自 `indicators.md`。

1. **先排除“非数据失败”**——它们**不算“没取到数据 / 查询失败”，禁止据此换工具或上兜底**，必须在各自层面修复后重试同一 `server_type + tool_name`：
   - `INVALID_PARAMS_JSON`（命令传递 / JSON 转义）→ 读 `references/shell-escaping.md`，先用 argv 探针验证第三参数可被 `JSON.parse` 解析；探针通过前不得调用 Wind CLI；只修 JSON 字符串、引号或执行器转义。
   - `KEY_MISSING` / `KEY_INVALID` / `KEY_FORBIDDEN_SERVER` → 按 Key 流程修复（`KEY_MISSING` 先问用户）。
   - `RATE_LIMIT_DAILY` / `RATE_LIMIT_QPS` / `BALANCE_INSUFFICIENT` / `NETWORK_ERROR` → 等待 / 充值 / 修网络后原样重试。
   - `BACKEND_UNAVAILABLE` / 服务暂不可用 → 先按当前工具契约检查 params key 和 value；确认入参无误后再稍后原样重试。若明确是请求过大或超时，只可缩小时间范围或减少字段。
   - `UNKNOWN_SERVER_TYPE` / `UNKNOWN_TOOL_NAME` → 按 `references/tool-manifest.json` 重选合法组合，不得直接转 analytics。
   - 其余本地命令 / 配置 / 协议类（`USAGE_ERROR` / `TOOL_MANIFEST_INVALID` / `UNKNOWN_SCOPE` / `OPEN_PORTAL_FAILED` / `CONFIG_WRITE_ERROR` / `RESPONSE_PARSE_ERROR` / `MCP_PROTOCOL_ERROR` / `TOOL_RUNTIME_ERROR` / `UNKNOWN`）→ 按 `references/error-codes.json` 的 `agent_action` 修正；能明确修正则重试一次，否则保留原文停止。

2. **数据类失败做“意图不变重试”**（`PARAM_VALIDATION_ERROR` / `NO_RESULTS`）：在**不改变用户标的与口径**的前提下修正后重试同一路由：
   - `PARAM_VALIDATION_ERROR` → 只读当前工具在 `references/tool-contracts.md` 的对应段落；仅当参数包含 `indexes` 时读取 `references/indicators.md` 相关类别；只修字段名、必填、日期、枚举和用户明确请求的 `indexes`；不得修改命令传递方式。只有契约核对证明当前工具无法表达该字段 / 口径，才可在同一业务域内切换到更合适的专项工具。
   - `NO_RESULTS` → 只调整关键词、时间范围或粒度中与原问题直接相关的一项。
   修正点明确时最多重试一次；**不得借口“问句复杂”跳过本步直接兜底**。

3. **第 2 步仍失败才升级兜底**（仍报错或仍无数据，且根因属数据覆盖 / 字段不可用 / 口径不匹配 / 无结果）：
   a. 属结构化取数、且专项工具覆盖不到 → `analytics_data.get_financial_data`（`question` 忠实用户原意图，详见下方「analytics_data 兜底」）。
   b. analytics 也失败或问题不适合它 → `wind-alice` 最终兜底，**先问用户**（见 `references/fallback-alice.md`）。
   超范围请求（欧股 / 日股 / 汇率 / 期货盘口 / 加密 / 非金融）直接 `OUT_OF_SCOPE`，不兜底。

## analytics_data 兜底

只有专项路由无法覆盖结构化取数任务，或专项路由多次修正后仍因字段 / 口径 / 无结果失败时，
才可使用 `analytics_data.get_financial_data`。

不得因以下错误使用 analytics 兜底：

- Key、权限、额度、余额问题。
- 网络、后端不可用、QPS 限流。
- JSON / 命令传递错误。
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
