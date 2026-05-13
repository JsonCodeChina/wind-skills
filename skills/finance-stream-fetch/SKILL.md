---
name: finance-stream-fetch
description: 在用户提出金融相关问题时，执行本地的 streamable fetch 脚本并将结果按流式输出。适用于股票/基金/ETF/期权/期货/外汇/加密货币/利率/通胀/估值/财报/宏观/资产配置/风险等话题（含中文金融问题）。
---

# finance-stream-fetch

当用户问金融问题的时候就执行当前的脚本。

## 这个 skill 做什么

- 执行本地 Node 脚本，通过 `fetch()` 发起 **SSE/流式** 请求，并把服务端返回内容实时输出。
- 把用户的提问作为 `--prompt` 发送到 Agent 接口（`message/stream`），并在流中提取 `agentResult.value` 便于上层汇总回答。

## 一次性配置

1. 确保安装 Node.js 18+（自带 `fetch`）。
2. 配置环境变量（PowerShell 示例）：

```powershell
$env:FINANCE_STREAM_API_URL="https://YOUR_ENDPOINT_HERE"
$env:FINANCE_STREAM_API_KEY="YOUR_KEY_IF_NEEDED"
```

### API Key 查找规则（参考 wind-mcp-skill 的做法）

脚本会按以下优先级寻找 Key（只要命中一个就用）：

- 命令行参数：`--api-key <KEY>`
- 环境变量：`FINANCE_STREAM_API_KEY`
- 当前 skill 配置：`.cursor/skills/finance-stream-fetch/config.json`（JSON：`{"finance_stream_api_key":"..."}`）
- 全局配置：`%USERPROFILE%\.finance-stream-fetch\config`（dotenv：`FINANCE_STREAM_API_KEY=...`）

如果接口不需要鉴权，可以不配置 Key（脚本会省略 `Authorization` 请求头）。

## 使用方式（Agent 工作流）

当用户提出金融问题时：

1. 直接把用户的问题作为 `--prompt`。
2. 执行：

```bash
node .cursor/skills/finance-stream-fetch/scripts/stream-fetch.mjs --prompt "<USER_QUESTION>"
```

3. 等流式输出结束后，再基于输出内容组织回答给用户。

## 备注

- 如果接口返回的是 SSE（Server-Sent Events），脚本会解析 `data:` 行并尽量 JSON 解析；解析失败会跳过该事件并继续。
- 如果设置了 `FINANCE_STREAM_API_KEY`（或传了 `--api-key`），会以 `Authorization: Bearer <key>` 方式发送。
- Windows PowerShell 下建议直接用双引号包住 prompt：

```powershell
node .cursor/skills/finance-stream-fetch/scripts/stream-fetch.mjs --prompt "分析一下茅台股票情况"
```

