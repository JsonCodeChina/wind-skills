# wind-mcp-skill CLI 返回格式分析

## 结论

当前 `skills/wind-mcp-skill/scripts/cli.mjs` 的主输出已经统一为 stdout JSON envelope，整体格式符合 Agent 解析预期。

## 已落地的脚本修改

- 所有主输出统一走 stdout JSON envelope，不再把错误、帮助或更新通知作为 stderr 文本输出。
- `call` 成功只返回一份原始 MCP `data.result`，不再同时返回 `data.parsed`，避免重复占用上下文。
- `help`、未知命令、缺参、未知 server、未知 tool、非法 JSON、Key 缺失、配置写入失败、后端参数校验失败等路径都返回结构化错误。
- 错误返回新增 `error.agent_action`，用于告诉 Agent 下一步应该做什么。
- 新增 `references/error-codes.json` 作为错误码字典；CLI 内置一份兼容规则，运行时不依赖该 JSON 文件。
- 更新检测结果改为 `notices` 数组；更新失败不会影响主调用 `ok:true`。
- `USAGE` 恢复了覆盖主要数据域的典型示例，帮助 Agent 选择正确的 `server_type + tool_name`。

顶层固定字段：

```jsonc
{
  "ok": true,
  "command": "call",
  "data": {},
  "error": {},
  "notices": [],
  "meta": {
    "cli_version": "1.6.0",
    "schema_version": 1
  }
}
```

规则：

- `ok:true`：读取 `data`。
- `ok:false`：读取 `error.code`、`error.retryable`、`error.fallback_allowed`、`error.agent_action`；`error.hint` 是补充解释。
- `notices`：非阻塞提示，不能当作主错误。
- `meta.schema_version`：当前为 `1`，用于后续兼容判断。
- 失败场景保留非零 exit code。

## 字段优先级

Agent 处理 CLI 返回时应按以下优先级：

1. `ok`：判断主命令成功或失败。
2. `error.code`：失败时的稳定分支依据。
3. `error.retryable` / `error.fallback_allowed`：决定是否原样重试、是否允许 fallback。
4. `error.agent_action`：Agent 的主要下一步动作指令，优先执行。
5. `error.hint`：错误原因和补充说明，可用于生成用户可读解释。
6. `error.context`：候选工具、server、tool、masked key 等辅助上下文。
7. `notices`：附加提醒，不改变主命令成功/失败判断。

`agent_action` 和 `hint` 都面向 Agent，但职责不同：`agent_action` 是决策字段，`hint` 是解释字段。若两者看起来有重叠，优先按 `agent_action` 执行。

## Agent 解析路径

### 成功调用

真实调用已验证：

```bash
node scripts/cli.mjs call stock_data get_stock_price_indicators '{"windcode":"600519.SH","indexes":"中文简称,最新成交价,涨跌幅"}'
```

返回结构：

```jsonc
{
  "ok": true,
  "command": "call",
  "data": {
    "server_type": "stock_data",
    "tool": "get_stock_price_indicators",
    "result": {
      "content": [
        {
          "type": "text",
          "text": "{...}"
        }
      ],
      "isError": false
    }
  },
  "notices": [],
  "meta": {}
}
```

Agent 应优先读取：

```text
data.result.content[0].text
```

若 `data.result.content[0].text` 是 JSON 字符串，Agent 再自行解析业务 JSON；若不是 JSON，则按原始文本处理。CLI 不再重复输出解析副本。

### 成功帮助

命令：

```bash
node scripts/cli.mjs
```

返回：

```jsonc
{
  "ok": true,
  "command": "help",
  "data": {
    "usage": "..."
  },
  "notices": [],
  "meta": {}
}
```

Agent 可把 `data.usage` 作为命令帮助。当前 usage 已恢复 8 条典型示例，覆盖 A 股、行情快照、基金 K 线、美股/港股、指数、新闻、宏观和通用兜底。

## 错误返回

所有错误返回均符合：

```jsonc
{
  "ok": false,
  "command": "call",
  "data": {},
  "error": {
    "code": "INVALID_PARAMS_JSON",
    "message": "...",
    "hint": "...",
    "category": "client",
    "retryable": false,
    "fallback_allowed": false,
    "context": {}
  },
  "notices": [],
  "meta": {}
}
```

字段语义：

| 字段 | Agent 动作 |
|---|---|
| `error.code` | 稳定错误码，优先用于分支判断。 |
| `error.hint` | 错误原因和补充说明，次级参考。 |
| `error.category` | 粗分类：`client` / `auth` / `quota` / `network` / `backend` / `unknown`。 |
| `error.retryable` | 是否适合原样重试。 |
| `error.fallback_allowed` | 是否允许进入 `analytics_data` fallback。 |
| `error.agent_action` | Agent 下一步动作，优先级高于 `hint`。 |
| `error.context` | 候选工具、server、tool、masked key 等上下文。 |

### 已实际验证的错误

| 场景 | exit code | `error.code` | 格式判断 | Agent 下一步 |
|---|---:|---|---|---|
| 未知命令 | 1 | `USAGE_ERROR` | 正确，含 `data.usage` | 按 usage 选择命令。 |
| `call` 缺参 | 1 | `USAGE_ERROR` | 正确，含典型示例 | 补齐 `server_type/tool/params_json`。 |
| 未知 `server_type` | 1 | `UNKNOWN_SERVER_TYPE` | 正确 | 从 hint 的可用 server 里重选。 |
| 未知 `tool_name` | 1 | `UNKNOWN_TOOL_NAME` | 正确，含 `context.available_tools` | 按候选工具重选，不要直接 fallback。 |
| 非法 JSON | 1 | `INVALID_PARAMS_JSON` | 正确 | 修 shell 转义或 JSON。 |
| `setup-key` 缺参 | 1 | `USAGE_ERROR` | 正确 | 先问用户 scope，再重试。 |
| 未知 scope | 1 | `UNKNOWN_SCOPE` | 正确 | 改成 `global` 或 `skill`。 |

### 代码路径覆盖但未实际执行的返回

这些路径会写配置、打开浏览器或依赖特定后端错误，因此本轮未直接执行，但代码输出路径与已验证错误共用同一个 envelope：

| 场景 | `ok` | `command` | 主要字段 |
|---|---:|---|---|
| `setup-key` 成功 | true | `setup-key` | `data.scope`、`data.path`、`data.key_masked`、`data.next` |
| `open-portal` 成功 | true | `open-portal` | `data.url`、`data.platform`、`data.fallback_message` |
| `open-portal` 失败 | false | `open-portal` | `error.code=OPEN_PORTAL_FAILED`，同时含 `data.url` |
| Key 缺失 | false | `call` | `error.code=KEY_MISSING`，`category=auth` |
| Key 无效/权限不足 | false | `call` | `KEY_INVALID` / `KEY_FORBIDDEN_SERVER` |
| 限流/余额不足 | false | `call` | `RATE_LIMIT_*` / `BALANCE_INSUFFICIENT` |
| 网络/后端 5xx | false | `call` | `NETWORK_ERROR` / `SERVER_5XX`，`retryable=true` |
| 响应解析异常 | false | `call` | `RESPONSE_PARSE_ERROR` |

## Notices

真实成功调用中出现过：

```jsonc
{
  "type": "update_check_failed",
  "severity": "warn",
  "reason": "network",
  "message": "检查更新失败，可能是网络问题"
}
```

判断：

- 格式正确。
- 不影响主调用成功。
- Agent 应把它作为附加提醒，不应改变 `ok:true` 的主流程。

可能的 notice 类型：

| type | 触发 | Agent 动作 |
|---|---|---|
| `update_available` | 有 skill 新版 | 会话首次转告用户升级命令。 |
| `update_check_failed` | 更新检查网络失败 | 可简要提示，不影响数据调用。 |
| `update_check_unknown` | 无法确认更新状态 | 可简要提示，不影响数据调用。 |

## 是否能指引 Agent 操作

可以，当前具备三层指引：

1. 用法指引：`data.usage` 中恢复了覆盖主要路由的示例。
2. 错误指引：`error.code + error.retryable + error.fallback_allowed + error.agent_action + context` 能决定修参数、换工具、重试或停止；`hint` 用于补充解释。
3. 成功数据指引：`data.result` 保留 MCP 原始返回；业务 JSON 通常在 `data.result.content[0].text` 中。

## 当前仍需注意

- 如果 `data.result.content[0].text` 是 JSON 字符串，Agent 需要二次解析；如果是纯文本，直接按文本处理。
- `fallback_allowed` 表示“CLI 层允许 fallback”，不代表可以跳过 `SKILL.md` 的路由和参数校验。
- `notices` 不是错误；只有 `ok:false` 才表示主命令失败。
- 真实调用应避免在 shell 历史和日志中暴露 API Key，建议用临时环境变量或已有安全配置。

## 2026-05-18 追加测试

### 本地协议测试

| case | exit | JSON | `ok` | 关键字段 | 判断 |
|---|---:|---:|---:|---|---|
| help | 0 | 是 | true | `command=help`，含 `data.usage` | 正常 |
| unknown-cmd | 1 | 是 | false | `USAGE_ERROR`，含 `data.usage` | 正常 |
| call-missing | 1 | 是 | false | `USAGE_ERROR`，含典型示例 | 正常 |
| unknown-server | 1 | 是 | false | `UNKNOWN_SERVER_TYPE` | 正常 |
| unknown-tool | 1 | 是 | false | `UNKNOWN_TOOL_NAME`，含 `context.available_tools` | 正常 |
| invalid-json | 1 | 是 | false | `INVALID_PARAMS_JSON` | 正常 |
| key-missing | 1 | 是 | false | `KEY_MISSING`，`category=auth` | 用隔离 HOME 验证正常 |
| setup-key-missing | 1 | 是 | false | `USAGE_ERROR` | 正常 |
| setup-key-bad-scope | 1 | 是 | false | `UNKNOWN_SCOPE` | 正常 |
| setup-key-global-success | 0 | 是 | true | `data.scope=global`，写入临时 HOME | 正常 |

所有本地协议测试 `stderr` 长度均为 0。

### 真实 Wind 调用测试

使用临时环境变量传入 `WIND_API_KEY`，未写入 skill 配置。

| case | server/tool | exit | `ok` | `result` | 结果摘要 | 判断 |
|---|---|---:|---:|---:|---|---|
| stock_snapshot | `stock_data.get_stock_price_indicators` | 0 | true | 是 | 1 行，列含 `NAME/MATCH/CHANGERANGE/windcode` | 正常 |
| global_snapshot | `global_stock_data.get_global_stock_price_indicators` | 0 | true | 是 | 1 行，列含 `NAME/MATCH/CHANGERANGE/windcode` | 正常 |
| fund_kline | `fund_data.get_fund_kline` | 0 | true | 是 | 8 行，列含 `TIME/OPEN/MATCH/HIGH/LOW/TURNOVER` | 正常 |
| index_kline | `index_data.get_index_kline` | 0 | true | 是 | 8 行，列含 `TIME/OPEN/MATCH/HIGH/LOW/TURNOVER` | 正常 |
| financial_news | `financial_docs.get_financial_news` | 0 | true | 是 | 返回已解析对象，非表格 rows 结构 | 正常 |
| economic_data | `economic_data.get_economic_data` | 0 | true | 是 | 返回体较大，stdout 约 192 KB | 正常但需注意体积 |
| analytics | `analytics_data.get_financial_data` | 0 | true | 是 | 返回已解析对象，非表格 rows 结构 | 正常 |

所有真实成功调用均有 `notices[0].type=update_check_failed`，原因是更新检查网络失败；这不影响主数据调用。

### 边界测试

非法行情字段：

```bash
node scripts/cli.mjs call stock_data get_stock_price_indicators '{"windcode":"600519.SH","indexes":"不存在字段"}'
```

当前返回：

```jsonc
{
  "ok": false,
  "error": {
    "code": "PARAM_VALIDATION_ERROR",
    "category": "schema",
    "retryable": false,
    "fallback_allowed": true
  }
}
```

判断：格式正确，Agent 可按 `hint` 先回到 `references/indicators.md` 核对字段；若修正后仍属于结构化取数问题，再考虑 `analytics_data` fallback。

### 能力边界

- `economic_data` 返回可能很大，当前 CLI 只输出一份原始 `data.result`；仍可能带来较高 token 成本，后续可考虑增加 `--summary`。
- 后端返回非表格对象时，`rowCount/columns` 不适用；Agent 应先判断 `data.result.content[0].text` 的实际结构。
- `open-portal` 未在本轮真实执行，因为会启动本机浏览器，属于有副作用路径。
- `setup-key --scope skill` 未执行，因为会在 skill 目录写 `config.json`；已用临时 HOME 验证 `--scope global` 成功路径。
