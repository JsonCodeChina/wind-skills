# wind-mcp-skill envelope 极简化 + 通知机制重设计方案

> **状态**：已实施 + 测试通过
> **影响范围**：`skills/wind-mcp-skill/{scripts/cli.mjs, references/error-codes.json, SKILL.md, tests/}`
> **破坏性变更**：是（envelope 形态、错误字段全变）

## 1. 背景

本轮重设计同时解决两件事：

1. **更新通知机制**：原 `notices` 数组同时承载 `update_available`（"有新版"）和 `update_check_failed` / `update_check_unknown`（"检查失败"）。后者在 TTL 周期内每次调用都重复出现，造成噪音；早先版本的 `meta.update_check_failed` 闸门方案则把字段固化在每次输出里，反向干扰 LLM。
2. **CLI envelope 结构**：原 envelope 在成功路径包了一层 `{ok, command, data, notices, meta:{cli_version, schema_version}}`，业务数据深埋在 `data.result.content[0].text`；错误结构含 `{code, message, hint, agent_action, retryable, fallback_allowed, category, context, ...}` 8 个字段，过于繁琐。

目标：成功路径**最大化精简**（让 agent 直接拿到数据），失败路径**保留生产级关键信号**（让 agent 能自纠 + 让运维能监控）。

## 2. 设计原则

| 原则 | 含义 |
|---|---|
| **exit code 区分成功/失败** | Unix 标准做法；成功路径不需 envelope 包裹。 |
| **成功路径零包装** | 直接透传 MCP 工具返回的业务数据，省 token、降复杂度。 |
| **失败路径保留机器信号** | `error.code` 是商业化 skill 的硬需求（监控/集成/分类）。 |
| **失败路径合并 NL 信号** | `message` + `hint` + `agent_action` 三字段冗余，合并成单一 `agent_action`（诊断 + 处方一体）。 |
| **不依赖进程/环境信号** | 通用方案；不能假设 Claude Code、Codex、Cursor 之一。 |
| **失败通知用 LLM 上下文做去重** | "同对话只提一次"由 LLM 的对话记忆承担，脚本不维护跨调用状态。 |

## 3. 关键决策（取舍记录）

下表是迭代讨论中明确否决的方案及其原因，作为后续 review/演进的护栏。

| 候选方案 | 为何不采用 |
|---|---|
| TTL 拉长 + 失败 cache 不打 notice | TTL 续期写回失败 → 父进程仍会"重新拿到"未读过的失败 → 又打一次，会话静音失败。 |
| `process.ppid` 作为会话标识 | 不通用，不同 agent（Claude Code / Codex / Cursor）父进程树形态不同。 |
| `/proc/<ppid>/stat` 启动时刻 | Linux-only，跨平台不可移植。 |
| `failureNotified` 闸门写 cache | 跨会话仍静音（失败持续不变 → 新会话不会再提示），不符合"每会话一次"诉求。 |
| `meta.update_check_failed` 持续字段 | 每次调用都带这个字段会污染 LLM 上下文，反向破坏 agent 注意力。 |
| 纯 SKILL.md 约束 LLM 去重 | LLM 在长上下文中不能 100% 遵守，需要脚本辅助。 |
| 失败 `error` 退化为单一字符串 | 失去 `code` → 失去监控/集成/分类能力，**非生产级**。 |
| 保留 `retryable` / `fallback_allowed` 显式标志位 | 与 `agent_action` 中的 NL 指令冗余；可由 SKILL.md 错误码分支表替代。 |
| `error.context.available_tools` 嵌入 | 让 agent 自己去读 `references/tool-manifest.json` 更干净。 |

## 4. 最终 envelope 形态

### 4.1 成功路径（exit code 0）

stdout 输出**纯数据**，无任何包裹：

| 命令 | 输出 |
|---|---|
| `cli.mjs`（无参 help） | USAGE 纯文本 |
| `cli.mjs call ...` | **完整透传 MCP `result` 对象**，不做任何 parse / 抽取。业务数据通常在 `result.content[0].text`（可能是 JSON 字符串），Agent 自行解析。 |
| `cli.mjs open-portal` | 结构化 JSON 对象 `{url, scope, flow_note, fallback_message}` |
| `cli.mjs setup-key ...` | 结构化 JSON 对象 `{scope, path}` |

### 4.2 失败路径（exit code 非 0）

stdout 输出极简 envelope：

```json
{
  "ok": false,
  "error": {
    "code": "KEY_MISSING",
    "agent_action": "[WIND_API_KEY 未配置] WIND_API_KEY 未配置。立即执行 `node scripts/cli.mjs open-portal` 打开万得开发者中心；获取 Key 后执行 `node scripts/cli.mjs setup-key <KEY> --scope <global|skill>`（先用 AskUserQuestion 询问 scope）再重试原调用。不要只把 URL 发给用户,也不要改用 analytics_data 绕过。"
  },
  "notices": []
}
```

**字段说明**：

- `ok`：恒为 `false`（成功路径不出 envelope）
- `error.code`：稳定错误分类标识符（监控/集成/错误码分支用）
- `error.agent_action`：诊断（`[后端原始 message]`）+ 标准处方（NL 指令），一段文本搞定 agent 自纠
- `notices`：保留字段但**永远是 `[]`**（forward compat）；所有更新检查相关信号（`update_available` / `transient_error` / `unknown`）都走 stderr 一次性通道，见第 9.1 节

## 5. 错误码分支策略（SKILL.md 第 7 节）

| code | 策略 |
|---|---|
| `KEY_MISSING` / `KEY_INVALID` / `KEY_FORBIDDEN_SERVER` | 修 Key 根因；**禁止**换工具/换 server 绕过 |
| `RATE_LIMIT_DAILY` / `BALANCE_INSUFFICIENT` | 等额度刷新或换 Key；**禁止**换工具绕过 |
| `RATE_LIMIT_QPS` / `NETWORK_ERROR` / `SERVER_5XX` | 等 3-5 秒后原样重试同一请求 |
| `INVALID_PARAMS_JSON` | 只能修 JSON / shell 转义，**禁止**换工具 |
| `UNKNOWN_TOOL_NAME` / `UNKNOWN_SERVER_TYPE` | 读 `references/tool-manifest.json` 重选，**禁止**直接 fallback 到 `analytics_data` |
| `PARAM_VALIDATION_ERROR` | 按工具表 + indicators.md 修字段；多次修正不通过可改用 `analytics_data` |
| `NO_RESULTS` | 调关键词重试；专项无果可改用 `analytics_data` |
| `RESPONSE_PARSE_ERROR` / `MCP_PROTOCOL_ERROR` / `TOOL_RUNTIME_ERROR` / `UNKNOWN` | 保留原文，能定位则修正后重试一次，否则告知用户停止 |

完整码表见 `references/error-codes.json`。

## 6. 代码改动清单

### 6.1 `scripts/cli.mjs`

**删除**：

- `writeEnvelope`（旧 7 字段 envelope）
- `buildErrorObject`（构造 8 字段 error）
- `errorCategory` / `fallbackAllowed` / `appendFallbackHint`
- `RETRYABLE_CODES` / `NO_FALLBACK_CODES` / `ERROR_CATEGORIES` / `getErrorHint`
- `collectUpdateFailureMeta`（上一轮短暂引入的失败 meta flag，已废弃）

**新增**：

- `writeRawCallSuccess(result)`：`call` 完整透传 MCP `result` 对象（不做任何 parse / 抽取，agent 自己解 `result.content[0].text`）
- `writePlainSuccess(data)`：`open-portal` / `setup-key` 直接 JSON 输出
- `writeErrorEnvelope(code, detail)`：极简失败 envelope
- `buildAgentAction(code, detail)`：把后端原始 `[detail]` + 标准处方拼成一段 NL；`USAGE_ERROR` 例外不截断 detail（嵌入完整 USAGE 让 agent 重构命令）

**简化**：

- `die(code, detail, exitCode)` 签名（旧版 `(code, msg, ctx, exitCode)`）
- 主入口 `help` 路径输出纯文本（不再 JSON envelope）
- 主入口 `.then(data)` 按 `cmd === 'call'` 分路（透传 vs 结构化输出）

**保留**：

- `IS_MAIN` guard（让 cli.mjs 可被 import 单测）
- `collectUpdateNotices` export（单测用）
- `inferErrorCode` / `ERROR_PATTERNS`（后端 message → code 映射）

### 6.2 `references/error-codes.json`

- schema_version 1 → 2
- 每条 code 从 `{category, retryable, fallback_allowed, agent_action}` 简化为单一字符串描述
- 新增顶层 `envelope_contract` 块说明成功 / 失败两路径形态

### 6.3 `SKILL.md`

- **2.3 节"CLI 输出契约"**：完整重写，强调 exit code 区分 + 成功纯数据 + 失败极简 envelope
- **7 节"CLI 错误处理硬约束"**：从原"按 `error.code/retryable/fallback_allowed` 多字段判断"改为"按 `error.code` 选分支策略 + 按 `error.agent_action` 执行"
- **8 节"保持最新"**：删除 8.2 节关于 `meta.update_check_failed` 的所有内容（特性已回退）

## 7. 测试覆盖

### 7.1 新增 / 重写

- `tests/cli.test.mjs`：完整重写
  - `run` 助手适配新契约（成功 = raw / 失败 = envelope）
  - 失败 envelope 顶层字段严格断言（只能 `ok` / `error` / `notices`）
  - `error` 字段严格断言（只能 `code` / `agent_action`）
  - 各错误码触发路径覆盖（USAGE_ERROR / INVALID_PARAMS_JSON / UNKNOWN_SERVER_TYPE / UNKNOWN_TOOL_NAME / UNKNOWN_SCOPE / KEY_MISSING）
  - `agent_action` 含原始 detail（`[diagnostic]` 前缀）
  - 失败 envelope 携带 `update_available` notices（跨 cache 状态）

- `tests/notice-redesign.test.mjs`：保留并精简
  - `transient_error` / `unknown` 不进 notices
  - `collectUpdateNotices` 跨 snooze / 损坏 cache / 缺失 cache 容错
  - 验证 `collectUpdateFailureMeta` 不再 export

### 7.2 测试结果

- `cli.test.mjs`：17/17 通过
- `notice-redesign.test.mjs`：8/8 通过
- `update-check.test.mjs`：30/30 通过（未受影响）
- 全套串行（`--test-concurrency=1`）：48/48 通过
- 并发跑偶发 1 race（测试文件共享 `~/.cache/wind-aifinmarket/update-state.json`，测试基础设施层问题，与代码无关）

## 8. 端到端 smoke 测试

| 场景 | 预期 |
|---|---|
| `cli.mjs`（无参） | stdout = USAGE 纯文本（不是 JSON），exit 0 |
| `cli.mjs foobar` | envelope `code=USAGE_ERROR`，agent_action 嵌入完整 USAGE，exit 1 |
| `cli.mjs setup-key faketestkey` | `code=USAGE_ERROR`，agent_action 嵌入 setup-key USAGE，exit 1 |
| `cli.mjs call stock_data get_stock_basicinfo 'not-json'` | `code=INVALID_PARAMS_JSON`，exit 1 |
| `WIND_API_KEY="" cli.mjs call ...` | `code=KEY_MISSING`，agent_action 含 open-portal + setup-key 指令，exit 1 |

均通过。

## 9. 已知权衡

### 9.1 两类 stderr 通知 + 独立 sentinel（v3 最终态）

所有更新检查相关信号都走 stderr 一次性通道（stdout 永远不带），用独立 sentinel 实现"每会话只出一次"：

**两类 stderr 通知**：

```
# 失败检测
[wind-skills] 更新检测失败 (reason=network), 不影响本次调用。

# 检测到新版可用
[wind-skills] 检测到新版可用:
  wind-mcp-skill: 439c482 → 586226e
  升级命令: npx skills update wind-mcp-skill -g -y
```

**两个独立 sentinel 文件**：

- `~/.cache/wind-aifinmarket/failure-shown-<ppid>`
- `~/.cache/wind-aifinmarket/update-shown-<ppid>`

互相独立——同会话失败通知触发后不影响更新通知首次触发，反之亦然。

**会话边界识别**：用 `process.ppid` 作为会话标识。绝大多数 agent（Claude Code / Codex / Cursor / Cline / Aider / OpenHands / MCP server 集成 / 用户直接终端）的父进程在整个会话内稳定，新对话 → 新 shell → 新 ppid。

**sentinel 时效**：

- 不存在 / mtime > 24h → stderr 打通知 + 创建（或 touch）sentinel
- 存在 + mtime ≤ 24h → 静默
- CLI `call` 启动时顺手扫目录，删 mtime > 7d 的两类 sentinel（防累积 + 防 PID 回收误判）

**已升级的自动过滤**：`update-shown-` sentinel 配合现有 `filterAlreadyUpgraded()` 逻辑——如果用户实际跑了 `npx skills update`，lock hash 变化 → cache 里的 outdated 条目被过滤掉 → maybeNotifyUpdateOnce 不会触发 → 新版通知自动消失。无需手动清 sentinel。

**对弱模型的友好性**：去重逻辑完全在脚本里，LLM 不需要"记住自己提过没"。Haiku 4.5 / GPT-4.1-mini / 较小模型也能正确处理——看到 stderr 就转告一次，看不到就不管。

**Agent 兼容矩阵**：

| Agent 模式 | ppid 行为 | 提示频率 |
|---|---|---|
| Claude Code / Codex / Cursor / Cline / Aider / OpenHands / MCP / 终端用户 | 父进程稳定 | 每会话**仅首次** ✓ |
| 新开终端 / 新对话 | shell 重启 → 新 ppid | 重新允许首次 ✓ |
| 极少数 "每次 fork 新 shell" 的 agent（罕见） | ppid 每次不同 | 每次都提示（退化但不崩） |

**边界情况**：

- PID 回收冲突：sentinel mtime > 24h 视为过期；CLI 启动时清 > 7d 的文件，PID 在 24h 内被回收并恰好分配给新 wind 调用者的概率极低。
- 同会话超 24h：sentinel 过期，会再打一次。这种用户单次会话极少。
- 多用户同机：每个用户有独立 `~/.cache/wind-aifinmarket/`，互不干扰。

### 9.2 ~~`update_available` 仅在失败路径出现~~（已解决）

~~成功路径不包装 envelope → notices 无处可放~~

v3 起：`update_available` 改走 stderr 一次性通道，**与 stdout 成功/失败路径无关**。无论调用成功还是失败，只要本会话首次检测到可升级版本，stderr 都会出一次通知。彻底解决早期版本的"成功路径看不到升级提示"问题。

### 9.3 多次同种错误的 agent_action 重复

同一会话内若多次触发同一 code，每次都会输出相同 `agent_action`。LLM 应能识别重复并基于上下文判断是否再次执行指令——这是 LLM 上下文记忆的常规能力，不需要脚本侧去重。

## 10. 升级影响（破坏性变更）

**消费方需要适配**的契约变化：

1. ❌ **不能**再用 `json.ok === true` 判断 call 成功——成功路径不再有 JSON envelope。改用 **exit code**。
2. ❌ **不能**再从 `json.data.result` 取业务数据——成功 stdout 直接是完整的 MCP `result` 对象（无 `data` / `server_type` / `tool` 外壳）。业务数据仍在 `result.content[0].text`，Agent 自行 `JSON.parse`。
3. ❌ **不能**再用 `json.error.message` / `json.error.hint` / `json.error.retryable` / `json.error.fallback_allowed` / `json.error.category` / `json.error.context`——这些字段全部移除。改用 `json.error.code`（分支）+ `json.error.agent_action`（NL 指令）。
4. ❌ **不能**再读 `json.meta.cli_version` / `json.meta.schema_version` / `json.meta.update_check_failed`——meta 字段整体删除。
5. ✅ `json.notices`（仅 `update_available`）保留；`update_check_failed` / `update_check_unknown` 类型不再出现。

迁移步骤：

1. 调用方先检查 exit code，0 = 成功（stdout 是纯数据），非 0 = 失败（stdout 是 envelope）。
2. 失败时按 `error.code` 选分支策略（见第 5 节），按 `error.agent_action` 执行具体动作。
3. 不再依赖 `retryable` / `fallback_allowed` 这类显式标志位——这些规则已编码进 SKILL.md 第 7 节的码表，由 agent 按 code 查表决策。
