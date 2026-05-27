# wind-mcp-skill Shell 转义

> 何时读：首次 CLI 调用前命令格式未锁定，或命中 `INVALID_PARAMS_JSON` | 权威于：当前执行路径的 params JSON 写法 | 不覆盖：字段语义

<!-- ENCODING: UTF-8. If this file looks garbled, re-read it with UTF-8 before repairing shell commands. -->

本文件只处理命令传递问题。只有 `INVALID_PARAMS_JSON` 允许修改 params JSON 写法、
shell 引号或外层执行器转义；其它错误码回到 `error.agent_action`。

## 命令格式门禁

首次调用 `scripts/cli.mjs call` 前，必须锁定当前执行路径的 params JSON 写法。

1. 先确认实际命令最终交给哪种 shell 或执行器。
2. 按下表选择一种 params JSON 写法。
3. 用同一执行路径运行 argv 探针。
4. 探针通过后锁定该写法；后续重试不得修改 shell 引号或 JSON 转义，除非再次命中 `INVALID_PARAMS_JSON`。

## 最小写法表

| 当前执行路径 | params JSON 写法 |
| --- | --- |
| Bash / zsh / sh / Git Bash / WSL | `'{"windcode":"600519.SH"}'` |
| Windows PowerShell / PowerShell 调用外部命令 | `'{\"windcode\":\"600519.SH\"}'` |
| cmd.exe | `"{\"windcode\":\"600519.SH\"}"` |
| agent 工具 / JSON-RPC / 任务运行器 / 命令代理包一层后再交给 shell | 不猜；必须以 argv 探针结果为准 |

PowerShell 调用 `node` 这类外部命令时，不要使用 `'{"windcode":"600519.SH"}'`；
它可能让 Node 收到 `{windcode:600519.SH}`，导致 JSON 解析失败。应让最终 shell
参数呈现为 `'{\"windcode\":\"600519.SH\"}'`。若外层执行器会吞掉反斜杠，
就只调整外层转义，直到 argv 探针输出可解析 JSON。

不要凭展示出来的命令判断转义是否正确。最终标准只有一个：同一执行路径下，
第三参数必须能被 Node 作为 `process.argv[1]` 读取并被 `JSON.parse` 解析。

## argv 探针

用计划传给 CLI 的同一个 `<params_json>` 写法运行；`<params_json>` 是占位符，
实际引号和转义必须来自上方表格并通过探针：

```bash
node -e "JSON.parse(process.argv[1]); console.log(process.argv[1])" <params_json>
```

探针成功后，最终 CLI 调用的第三参数必须逐字符复用探针通过的 `<params_json>`。
不得重新手写、重新格式化或删除转义。只有满足该条件，才允许把同一 `<params_json>` 写法用于：

```bash
node scripts/cli.mjs call <server_type> <tool_name> <params_json>
```

命中 `INVALID_PARAMS_JSON` 时，探针通过前不得调用 Wind CLI；只修命令传递层，
重试同一 `server_type + tool_name` 和同一业务参数语义。

## NL 文本字段

`question`、`query`、`metricIdsStr` 的值在调用时不得包含空格。用户原句有空格时，
先去除空格，再用标点或直接连接保持语义。
