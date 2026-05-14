---
name: wind-alice
description: 在用户提出金融相关问题时，执行本地的 streamable fetch 脚本并将结果按流式输出。适用于股票/基金/ETF/期权/期货/外汇/加密货币/利率/通胀/估值/财报/宏观/资产配置/风险等话题（含中文金融问题）。
---

# wind-alice

当用户问金融问题的时候就执行当前的脚本。

## 这个 skill 做什么

- 执行本地 Node 脚本，通过 `fetch()` 发起 **SSE/流式** 请求，并把服务端返回内容实时输出。
- 把用户的提问作为 `--prompt` 发送到 Agent 接口（`message/stream`），并在流中提取 `agentResult.value` 便于上层汇总回答。

## 一次性配置

1. 确保安装 Node.js 18+（自带 `fetch`）。
2. 配置环境变量（PowerShell 示例）：


## 使用方式（Agent 工作流）

当用户提出金融问题时：

1. 直接把用户的问题作为 `--prompt`。
2. 执行：

```bash
node scripts/stream-fetch.mjs --prompt "<USER_QUESTION>"
```

3. 等流式输出结束后，直接把输出结果给用户。
### API Key

报 `KEY_MISSING` 时按 cli.mjs stderr 给的 extraHint 配置即可（程序自动按多种方式查找 Key）；需要拿 Key 跑 `node scripts/cli.mjs open-portal` 自动打开开发者中心。
## 4. 注意事项
| 规则 | 后果 |
|---|---|
| 结果末尾**必须标注**「数据来源于万得 Wind 金融数据服务」 | 合规要求 |
## 备注

- 如果接口返回的是 SSE（Server-Sent Events），脚本会解析 `data:` 行并尽量 JSON 解析；解析失败会跳过该事件并继续。
- Windows PowerShell 下建议直接用双引号包住 prompt：

```powershell
node wind-alice/scripts/stream-fetch.mjs --prompt "分析一下茅台股票情况"
```

