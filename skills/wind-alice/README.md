# finance-stream-fetch

> **流式获取金融内容信息** · 股票 / 基金 / ETF / 期权 / 期货 / 外汇 / 加密货币 / 宏观 / 估值 / 财报 / 资产配置 / 风险（含中文金融问题）

---

## 这是什么

通过本地 Node.js 脚本对一个支持 **SSE/流式返回** 的 Agent 接口发起请求，给 AI Agent 提供：

- 金融问题的 **流式内容拉取**（边接收边输出）
- 从流事件中提取 `agentResult.value`，便于上层汇总成最终回答

---

## 安装

```bash
# 全局（推荐 — 跨项目 + 跨 AI agent 共享）

# GitHub
npx skills add Wind-Information-Co-Ltd/wind-skills --skill finance-stream-fetch -g -y

# Gitee 镜像（国内）
npx skills add https://gitee.com/wind_info/wind-skills.git --skill finance-stream-fetch -g -y
```

> 想限制在当前项目内用，把命令的 `-g` 去掉即可。`-g` 会自动 symlink 到机器上所有已识别的 AI agent（Claude Code / Cursor / OpenClaw / Hermes 等）。

---


## API Key

需要 `WIND_API_KEY`（登录 [aimarket.wind.com.cn 开发者中心](https://aimarket.wind.com.cn/#/user/overview) 获取）。

装好后向 AI 提一个 wind 数据问题，AI 会按 stderr 引导完成 Key 配置——无需手动管路径。

---


## 升级

如果你是通过 `npx skills` 安装：

```bash
npx skills update finance-stream-fetch -g -y
```

---

## 目录结构

```
finance-stream-fetch/
├── SKILL.md                      # AI 加载的核心守则（何时触发/怎么调用/配置项）
├── scripts/
│   ├── request.js                # 实际请求 + SSE 解析 + 输出 agentResult.value
│   └── stream-fetch.mjs          # 稳定入口（转发参数到 request.js）
└── README.md
```

