# wind-mcp-skill CLI 输出整理方案

## 背景

本文基于 `skills/wind-mcp-skill/cli_architecture_analysis.md` 与当前 `scripts/cli.mjs` 实现，聚焦解决 CLI 输出冗杂、格式不统一、Agent 难以可靠解析的问题。

当前 `cli.mjs` 约 692 行，仍然承担 6 类职责：MCP 传输、错误码体系、认证配置、命令路由、更新检测通知、服务器注册表。其中输出问题主要来自三处：

- 成功路径输出 JSON，但不同命令的字段层级不一致。
- 错误路径通过 `stderr` 输出人类可读多行文本，不是 JSON。
- 更新通知、使用帮助、致命错误都混在 `stderr`，语义不可区分。

现状示例：

```text
MCP 错误 [UNKNOWN_TOOL_NAME]
server_type: stock_data
后端消息:    工具名不属于 stock_data: bad_tool
处理建议:    请不要继续试错调用...
```

这类文本适合人读，但不适合 Agent 作为稳定协议消费。

## 改造目标

1. 所有命令只暴露一种机器可读主输出：`stdout` JSON envelope。
2. 错误、使用帮助、更新通知都结构化，不再依赖正则从文本里提取。
3. `stderr` 仅作为 `--verbose` 调试日志通道，默认不承载业务语义。
4. 保留非零 exit code 表示命令失败，兼容 shell/CI 判断。
5. 分阶段改造，优先先统一输出协议，再拆分文件职责。

## 输出协议

### 顶层 envelope

所有命令输出统一为：

```jsonc
{
  "ok": true,
  "command": "call",
  "data": {},
  "notices": [],
  "meta": {
    "cli_version": "1.5.0"
  }
}
```

失败时：

```jsonc
{
  "ok": false,
  "command": "call",
  "error": {
    "code": "UNKNOWN_TOOL_NAME",
    "message": "工具名不属于 stock_data: bad_tool",
    "hint": "先按 SKILL.md 意图路由重新判断 server_type + tool_name。",
    "category": "client",
    "retryable": false,
    "fallback_allowed": false,
    "agent_action": "读取 error.context.available_tools，并按意图路由规则为当前 server_type 重新选择合法工具。",
    "context": {
      "server_type": "stock_data",
      "available_tools": ["get_stock_quote"]
    }
  },
  "notices": [],
  "meta": {
    "cli_version": "1.5.0"
  }
}
```

### 字段约定

| 字段 | 必填 | 说明 |
|---|---:|---|
| `ok` | 是 | 命令是否成功。成功为 `true`，失败为 `false`。 |
| `command` | 是 | `call` / `setup-key` / `open-portal` / `help`。 |
| `data` | 成功时是 | 命令成功结果。MCP 原始 `result` 放在该字段下，不再摊平到顶层。 |
| `error` | 失败时是 | 结构化错误对象。 |
| `notices` | 是 | 非阻塞通知数组，如 skill 有新版、更新检查失败。没有通知时为空数组。 |
| `meta` | 是 | CLI 版本、schema 版本、耗时等元信息。 |

`error` 字段约定：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `code` | 是 | 稳定错误码，如 `KEY_MISSING`、`INVALID_PARAMS_JSON`。 |
| `message` | 是 | 后端或 CLI 原始错误摘要。 |
| `hint` | 是 | 面向 Agent 的处理建议。 |
| `category` | 是 | `client` / `auth` / `quota` / `network` / `backend` / `schema` / `unknown`。 |
| `retryable` | 是 | 是否可原样重试。 |
| `fallback_allowed` | 是 | 是否允许进入 `analytics_data` fallback。 |
| `agent_action` | 是 | Agent 下一步动作，优先级高于 `hint`。 |
| `context` | 否 | server、tool、候选工具、masked key 等上下文。 |

错误码权威说明见 `skills/wind-mcp-skill/references/error-codes.json`。CLI 内置一份兼容规则，运行时不依赖该 JSON 文件。

### 成功输出形态

`call` 成功：

```jsonc
{
  "ok": true,
  "command": "call",
  "data": {
    "server_type": "stock_data",
    "tool": "get_stock_quote",
    "result": {
      "content": []
    }
  },
  "notices": [],
  "meta": {
    "cli_version": "1.5.0",
    "schema_version": 1
  }
}
```

`setup-key` 成功：

```jsonc
{
  "ok": true,
  "command": "setup-key",
  "data": {
    "scope": "global",
    "path": "C:\\Users\\...\\.wind-aifinmarket\\config",
    "key_masked": "abcd***wxyz",
    "next": "现在可以重试原 Wind 调用"
  },
  "notices": [],
  "meta": {
    "cli_version": "1.5.0",
    "schema_version": 1
  }
}
```

`open-portal` 无法启动浏览器时应视为失败 envelope，而不是 `stdout` 里混一个 `ok:false` 的自定义结构：

```jsonc
{
  "ok": false,
  "command": "open-portal",
  "error": {
    "code": "OPEN_PORTAL_FAILED",
    "message": "本地无法启动浏览器",
    "hint": "把 data.url 或 fallback_url 告知用户，让用户手动打开。",
    "category": "client",
    "retryable": false,
    "fallback_allowed": false
  },
  "data": {
    "url": "https://aifinmarket.wind.com.cn/#/user/overview"
  },
  "notices": [],
  "meta": {
    "cli_version": "1.5.0",
    "schema_version": 1
  }
}
```

## 通知输出

更新检测不再直接写 `stderr`，统一进入 `notices`。

```jsonc
{
  "type": "update_available",
  "severity": "info",
  "message": "检测到 2 个 skill 有新版",
  "items": [
    {
      "name": "wind-mcp-skill",
      "current": "abc123",
      "latest": "def456",
      "upgrade_command": "npx skills update wind-mcp-skill -g -y",
      "source": "github"
    }
  ]
}
```

更新检查失败也作为 notice：

```jsonc
{
  "type": "update_check_failed",
  "severity": "warn",
  "reason": "network",
  "message": "检查更新失败，可能是网络问题"
}
```

这样 Agent 可按 `notices[].type` 决定是否转告用户，不再扫描 `stderr` 中的中文文本。

## 错误分类与 fallback 决策

当前 `appendFallbackHint()` 把 fallback 规则拼进自然语言 hint。改造后应把规则结构化：

| 错误码 | category | retryable | fallback_allowed | 处理方向 |
|---|---|---:|---:|---|
| `INVALID_PARAMS_JSON` | `client` | false | false | 修 shell 转义或 JSON。 |
| `UNKNOWN_SERVER_TYPE` | `client` | false | false | 重选 server_type。 |
| `UNKNOWN_TOOL_NAME` | `client` | false | false | 重选 tool_name，不直接走 `analytics_data`。 |
| `KEY_MISSING` | `auth` | false | false | 引导配置 Key。 |
| `KEY_INVALID` | `auth` | false | false | 重新生成或替换 Key。 |
| `RATE_LIMIT_DAILY` | `quota` | false | false | 等额度刷新或换 Key。 |
| `RATE_LIMIT_QPS` | `quota` | true | false | 延迟重试。 |
| `NETWORK_ERROR` | `network` | true | false | 检查网络或用 Codex escalation。 |
| `SERVER_5XX` | `backend` | true | false | 稍后重试。 |
| `NO_RESULTS` | `backend` | false | true | 可调整问题或按规则 fallback。 |
| `MCP_PROTOCOL_ERROR` | `backend` | false | 条件判断 | 先看具体 message，再决定。 |
| `RESPONSE_PARSE_ERROR` | `backend` | false | false | 后端协议异常，联系支持。 |

Agent 不应再从 `hint` 推断 fallback，直接读 `fallback_allowed`。

## 实施计划

### P0：先统一错误 JSON 化

范围：保持单文件结构不变，只改输出函数。

- 新增 `writeEnvelope(envelope, exitCode)`。
- 新增 `buildErrorEnvelope(code, message, ctx, command)`。
- `die()` 改为向 `stdout` 写 `{ ok:false, command, error, notices, meta }`，保留 `process.exit(exitCode)`。
- `exitWithUsage()` 改为 `{ ok:false, command:"help", error:{ code:"USAGE_ERROR", ... }, data:{ usage } }`。
- 主入口未知命令也走 `USAGE_ERROR` envelope。

验收：

- `cli.mjs call stock_data bad_tool "{}"` 输出合法 JSON。
- `cli.mjs call stock_data get_stock_quote bad-json` 输出合法 JSON。
- 失败 exit code 仍为 1。
- 默认 `stderr` 为空。

### P1：统一成功 envelope

范围：调整 `cmdCall`、`cmdSetupKey`、`cmdOpenPortal` 的 `console.log()`。

- `cmdCall` 将当前 `{ ok:true, server_type, tool, ...result }` 改为 `{ ok:true, command:"call", data:{ server_type, tool, result } }`。
- `cmdSetupKey` 将 action/scope/path 等移入 `data`。
- `cmdOpenPortal` 成功走 success envelope，失败走 `OPEN_PORTAL_FAILED` error envelope。

验收：

- 三个命令顶层字段一致。
- 成功时顶层不再混业务字段。
- `open-portal` 失败不再是自定义 `ok:false` 结果。

### P2：更新通知结构化

范围：保留当前 update-state 逻辑，先改打印方式。

- `maybePrintUpdateNotice()` 改为 `collectUpdateNotices()`，返回 notice array。
- `cmd === "call"` 时，把 notices 合并进最终 envelope。
- `transient_error`、`unknown` 都进入 `notices`，不写 `stderr`。

验收：

- 有新版时，`stdout.notices` 包含 `update_available`。
- 无新版时，`notices: []`。
- 同一会话是否转告用户的策略由 Agent 根据 notice 处理，不由 CLI 文本输出隐式驱动。

### P3：模块拆分

范围：解决 `cli.mjs` 职责膨胀。

建议结构：

```text
scripts/
  cli.mjs
  commands/
    call.mjs
    setup-key.mjs
    open-portal.mjs
  lib/
    output.mjs
    errors.mjs
    auth.mjs
    transport.mjs
    servers.mjs
    update-notify.mjs
  update-check.mjs
```

拆分顺序：

1. `output.mjs`：envelope、JSON 写出、meta、notice merge。
2. `errors.mjs`：错误码、分类、hint、retryable/fallback_allowed。
3. `servers.mjs`：`SERVERS` 注册表。
4. `auth.mjs`：`getApiKey()`、`parseDotenv()`、`setup-key` 写入辅助。
5. `transport.mjs`：`mcpRequest()`、`parseSSE()`、HTTP 错误映射。
6. `update-notify.mjs`：只读取 update-state 并返回 notices；状态修正后续再下沉给 `update-check.mjs`。

验收：

- `cli.mjs` 缩减为命令分发入口，目标不超过 100 行。
- transport、auth、errors 可单独单元测试。
- 输出协议测试覆盖成功、失败、notice 三类路径。

## 向后兼容策略

建议提供一个短过渡期：

- 默认输出新版 envelope。
- 可选 `--legacy-text-error` 临时恢复旧 stderr 文本，最多保留一个小版本。
- `SKILL.md` 同步改为只读取 JSON envelope，不再要求解析 `stderr` 的 `处理建议:`。
- README 标注输出协议版本：`schema_version: 1`。

## 测试建议

不需要访问 Wind 后端的本地测试：

```bash
node scripts/cli.mjs
node scripts/cli.mjs nope
node scripts/cli.mjs call bad_server get_stock_quote "{}"
node scripts/cli.mjs call stock_data bad_tool "{}"
node scripts/cli.mjs call stock_data get_stock_quote bad-json
node scripts/cli.mjs setup-key
```

需要 Wind 后端的集成测试：

```bash
node scripts/cli.mjs call stock_data get_stock_quote "{\"windcode\":\"600519.SH\"}"
```

每个测试都应校验：

- `stdout` 是合法 JSON。
- 顶层字段符合 envelope。
- 失败路径 exit code 非 0。
- 默认 `stderr` 为空。

## 对 SKILL.md 的同步要求

CLI 改造完成后，`SKILL.md` 需要同步删减以下内容：

- “按 stderr 的 `处理建议:` 执行”的旧说明。
- 更新通知从 `stderr` 中读取的旧说明。
- 大量 shell 错误解析话术。

替换为：

- 调用 CLI 后只读 `stdout` JSON。
- `ok:false` 时按 `error.code`、`error.retryable`、`error.fallback_allowed`、`error.agent_action` 处理，`error.hint` 只作解释。
- `notices` 非空时按 `type` 决定是否转告用户。
