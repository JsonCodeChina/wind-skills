# wind-mcp-skill

> **访问万得 Wind 金融数据** · A 股 / 港股 / 基金 / 公告 / 新闻 / 宏观经济

---

## 这是什么

通过 MCP 协议访问万得 Wind 金融数据库，给 AI Agent 提供：

- A 股 / 港股股票行情（最新价 / K 线 / 分钟）+ 财务基本面（财报 / 股本 / 事件 / 技术指标 / 风险）
- ETF / 公募基金行情 + 全维数据（档案 / 财务 / 持仓 / 业绩 / 持有人 / 管理公司）
- 上市公司公告 + 财经新闻 RAG
- 宏观经济 / 行业经济指标（EDB）
- 自然语言通用查询入口（覆盖整个 Wind 数据库）

**不包含**：美股 / 欧股 / 日股、汇率 / 期货盘口、加密货币、非金融数据。

---

## 安装

```bash
# 全局（推荐 — 跨项目 + 跨 AI agent 共享）

# GitHub
npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-mcp-skill -g -y

# Gitee 镜像（国内）
npx skills add https://gitee.com/wind_info/wind-skills.git --skill wind-mcp-skill -g -y
```

> 想限制在当前项目内用，把命令的 `-g` 去掉即可。`-g` 会自动 symlink 到机器上所有已识别的 AI agent（Claude Code / Cursor / OpenClaw / Hermes 等）。

---

## API Key

需要 `WIND_API_KEY`（登录 [aimarket.wind.com.cn 开发者中心](https://aimarket.wind.com.cn/#/user/overview) 获取）。

装好后向 AI 提一个 wind 数据问题，AI 会按 stderr 引导完成 Key 配置——无需手动管路径。

---

## 升级

```bash
npx skills update wind-mcp-skill -g -y
```

调用时 stderr 若提示有新版，按提示走即可。

---

## 目录结构

```
wind-mcp-skill/
├── SKILL.md                     # AI 加载的核心守则（数据范围 / 使用方法 / 工具表 / 注意事项 / 使用技巧 / 出错怎么办）
├── references/
│   └── indicators.md            # 行情字段 indexes 689 项完整清单
├── scripts/
│   ├── cli.mjs                  # MCP 调用主入口
│   └── update-check.mjs         # 升级感知探活
└── README.md
```

详细的工具列表 / 入参 schema / 字段说明见 [SKILL.md](./SKILL.md)。
