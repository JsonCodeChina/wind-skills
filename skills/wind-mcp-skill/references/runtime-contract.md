# Wind MCP CLI 运行时契约

<!-- ENCODING: UTF-8. If this file looks garbled, re-read it with UTF-8 before calling Wind CLI. -->

只有准备执行 `scripts/cli.mjs`、处理 Key、解析 stdout/stderr 或修复 CLI 调用问题时读取本文件。

## 工作目录

Wind CLI 调用必须在本 skill 目录下执行。优先把命令工作目录设为 `<skill_dir>`，
再使用相对脚本路径：

```bash
node scripts/cli.mjs call <server_type> <tool_name> '<params_json>'
```

这是逻辑形态，不是所有 shell 的可直接复制模板。真实命令按当前 shell
引用规则生成；若当前 shell、执行器转义规则或该 shell 下的 JSON 引号写法不明确，
读取 `references/shell-escaping.md`。命中 `INVALID_PARAMS_JSON` 时，也读取该文件，
只修 JSON / shell 转义后重试同一
`server_type + tool_name`。

如果执行工具不能单独设置工作目录，先切到 `<skill_dir>` 后再运行命令。不要在任意
cwd 下只靠绝对脚本路径调用。

## 子命令

| 子命令 | 用途 |
| --- | --- |
| `call <server_type> <tool_name> '<params_json>'` | 调用 Wind MCP 工具 |
| `open-portal` | 打开万得开发者中心获取 API Key |
| `setup-key <KEY> --scope <global|skill>` | 配置 API Key |
| `diagnose` | 诊断 session / sentinel / update 状态 |

`open-portal` 和 `setup-key` 都有副作用。用户选择前不要执行。

## stdout / stderr

- 成功：exit code 为 `0`，stdout 输出结果，不包 `{ ok: true }` envelope。
- `call` 成功时 stdout 是 MCP result；若存在 `content[0].text`，优先解析其中的文本或 JSON 后回答。
- `open-portal` / `setup-key` 成功时 stdout 是结构化对象。
- 失败：exit code 非 `0`，stdout 输出 `{ ok: false, error: { code, agent_action } }`。
- stderr 只承载内部日志、更新提示或临时诊断，不改变成功 / 失败判定。

处理失败时先读 stdout 的 `error.agent_action`，再按 `error.code` 和
`references/error-handling.md` 分支。

## CLI 校验边界

| 层级 | CLI 已校验 | Agent 仍需校验 |
| --- | --- | --- |
| server/tool | `tool-manifest.json` 中是否存在该组合 | 路由是否符合用户意图 |
| JSON | 第三参数能否 `JSON.parse` | shell 引号、字段语义、自然语言字段值 |
| 业务参数 | 主要由后端校验 | 必填项、日期、枚举、`indexes`、字段名 |
| 错误归因 | 归一成稳定 `error.code` 和 `agent_action` | 是否允许重试、analytics 兜底或 wind-alice |

不要把 CLI 当成完整 schema validator。调用前仍需读取 `references/tool-contracts.md`；
行情快照还必须读取 `references/indicators.md`。

## Key 机制

CLI 查找 `WIND_API_KEY` 的顺序：

1. 当前进程环境变量 `WIND_API_KEY`。
2. 当前 skill 目录的 `config.json`。
3. 用户目录 `~/.wind-aifinmarket/config`。

`setup-key --scope skill` 写入当前 skill 目录 `config.json`。  
`setup-key --scope global` 写入 `~/.wind-aifinmarket/config`。  
`setup-key` 必须带 `--scope global` 或 `--scope skill`。

用户发来 Key 后，不要在回答中回显完整 Key。只可使用 CLI 返回的 masked key。

## API Key 交互

`KEY_MISSING` 时必须先让用户选择：

| 选项 | Agent 动作 |
| --- | --- |
| 由 agent 打开开发者中心 | 执行 `node scripts/cli.mjs open-portal`，提示用户登录并取回 Key |
| 用户自行获取 Key | 不执行 `open-portal`，等待用户自行发回 Key |

拿到 Key 后，再询问或沿用用户已声明的 scope，然后执行：

```bash
node scripts/cli.mjs setup-key <KEY> --scope <global|skill>
```

完成后重试触发 `KEY_MISSING` 的原调用。

## Codex 调用权限

在 Codex 中调用 Wind 后端命令时，需要联网和子进程权限。调用工具时使用
`sandbox_permissions: "require_escalated"`；这是工具调用参数，不是 shell 参数。

建议申请的 `prefix_rule`：

```json
["node", "<skill_dir>/scripts/cli.mjs", "call"]
```
