# wind-find-finance-skill

> **Wind AIMarket 金融能力入口（meta-skill）** · 读 skill 清单，帮 AI 列举平台能力并推荐安装

---

## 这是什么

不是数据 skill，是**入口 skill**：

- 用户问"有什么金融能力" / 提了金融问题但 AI 不确定用哪个 → 触发本 skill
- AI 读 `references/skills-catalog.md` → 列举平台所有可用 skill（数据发现 + 金融分析两类）
- 给出对应安装命令，让用户自助挑装
- 可选 fetch 远端 `aimarket.wind.com.cn/skill.md` 比版本，提示升级

---

## 安装

```bash
# GitHub
npx skills add JsonCodeChina/wind-skills --skill wind-find-finance-skill -g -y

# Gitee 镜像（国内）
npx skills add https://gitee.com/jsonCodeChina/wind-skills.git --skill wind-find-finance-skill -g -y
```

**不需要 API Key** —— 本 skill 不调任何 MCP server，纯读文档。

---

## 目录结构

```
wind-find-finance-skill/
├── SKILL.md                         # AI 加载的核心守则（5 步触发流程）
├── references/
│   └── skills-catalog.md            # 平台 skill 清单本地副本（同源 aimarket.wind.com.cn/skill.md）
└── README.md
```

**没有 scripts/，没有 cli.mjs**——LLM 用 Read + WebFetch 工具直接处理。

---

## 工作原理

本 skill 是 **meta-skill**，跟数据 skill 的区别：

| 维度 | 数据 skill（如 wind-mcp-skill） | 本 skill |
|---|---|---|
| 调底层 MCP server | ✅ | ❌ |
| 需要 WIND_API_KEY | ✅ | ❌ |
| 返回业务数据 | ✅ | ❌ |
| 返回 skill 推荐 + 安装命令 | ❌ | ✅ |
| 谁来调用 | AI 直接调（取数据答用户） | AI 在不确定用哪个 skill 时先调 |

AI 加载 SKILL.md 后按守则操作：

1. Read `references/skills-catalog.md` → 拿本地清单
2. 按用户问题筛 1-3 个相关 skill 列出（含安装命令）
3. （可选）WebFetch 远端 skill.md → diff (name, 平台版本) 集合 → 顺嘴提升级

---

## 升级

```bash
npx skills update -g -y
```

`references/skills-catalog.md` 随 skill 包一起更新。

---

## 设计要点

- **零代码**：不依赖 Node.js，纯 markdown + AI 工具能力
- **跨 agent 通用**：只要 agent 让 LLM 能 Read 文件 + WebFetch URL 即可
- **不写用户本地任何文件**，不污染用户全局空间
- **平台版本号** 由我们维护，跟 skill 自身 frontmatter version 解耦；改了 monorepo 哪个 skill 就把 skill.md 那一行 +1

---

## 许可

© Wind AIMarket 2026
