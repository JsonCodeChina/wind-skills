# wind-mcp-skill Shell 转义

> 何时读：非 bash（PowerShell / cmd）首次调用前，或命中 `INVALID_PARAMS_JSON` | 权威于：各 shell 的 JSON 引号与转义 | 不覆盖：字段语义

<!-- ENCODING: UTF-8. If this file looks garbled, re-read it with UTF-8 before repairing shell commands. -->

`INVALID_PARAMS_JSON` 常由 shell 引号和转义写错导致。只有需要手写 CLI 调用、
当前 shell 不明确，或已经命中 `INVALID_PARAMS_JSON` 时读取本文件。

## 先确认 shell

```bash
node -e "const s=process.env.SHELL||'',c=process.env.COMSPEC||'';console.log(/bash/i.test(s)?'bash':/powershell/i.test(process.env.PSModulePath?s:c)?'powershell':/cmd/i.test(c)?'cmd':'bash')"
```

## JSON 传参写法

| Shell | JSON 外层 | 内部双引号 | 示例 |
| --- | --- | --- | --- |
| Bash / Git Bash / WSL | 单引号 | 不转义 | `'{"windcode":"600519.SH"}'` |
| PowerShell 5.x / 7 | 单引号 | `\"` 转义 | `'{\"windcode\":\"600519.SH\"}'` |
| cmd.exe | 双引号 | `\"` 转义 | `"{\"windcode\":\"600519.SH\"}"` |

完整示例：

```powershell
node scripts/cli.mjs call stock_data get_stock_kline '{\"windcode\":\"600519.SH\",\"begin_date\":\"20260511\",\"end_date\":\"20260521\"}'
```

```bash
node scripts/cli.mjs call stock_data get_stock_kline '{"windcode":"600519.SH","begin_date":"20260511","end_date":"20260521"}'
```

```cmd
node scripts\cli.mjs call stock_data get_stock_kline "{\"windcode\":\"600519.SH\",\"begin_date\":\"20260511\",\"end_date\":\"20260521\"}"
```

注意：CLI 失败 envelope 是 JSON，stdout 中显示的反斜杠会再次被 JSON 转义。
例如 stdout 里看到 `\\\"` 时，实际命令文本通常是 `\"`，不要额外增加反斜杠。

不要混用不同 shell 的引号写法。命中 `INVALID_PARAMS_JSON` 时，只修 JSON
和 shell 转义，重试同一 `server_type + tool_name`，不要换工具掩盖错误。

## NL 文本字段

`question`、`query`、`metricIdsStr` 的值在调用时不得包含空格。用户原句有空格时，
先去除空格，再用标点或直接连接保持语义。
