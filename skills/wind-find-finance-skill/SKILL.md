---
name: wind-find-finance-skill
description: AIMarket 金融能力发现器。当用户问金融数据 / 分析 / 工具相关问题,且 AI 不确定用哪个具体 skill 时,触发本 skill 列举平台可用能力并给出安装命令。
---


# 触发时机

用户问以下任一情况时触发:

1. "有什么金融能力 / 推荐什么金融工具 / 平台能做什么"
2. 提了具体金融问题(行情 / 基金 / 财务 / 估值 / 选股 / 回测 / 复盘 / 公告 / 宏观等)但 AI 不确定用哪个 skill
3. 问 AIMarket / Wind 平台元问题

# 不触发场景

1. 用户已明确指定某个具体 skill("用 wind-mcp-skill 查茅台" / "用 dcf-model 分析这家公司")→ 直接走那个 skill,不绕本入口

2. 用户问的是**取数 / 查询类**问题(行情 / 财务 / 基金 / 公告 / 新闻 / 宏观),且本机**已装** wind-mcp-skill → 直接调用 wind-mcp-skill,不绕本入口

3. 用户问的是**分析类**问题(估值 / 复盘 / 选股 / 回测 / 个股研究 / 主线识别),且对应分析 skill **已装** → 直接走那个 skill,不绕本入口

> **简言之:本 skill 只在"用户需要的能力还没装好"时触发**

---

# 推荐策略(按用户提问类型路由)

| 用户提问类型 | 推什么 | 推几个 |
|---|---|---|
| **取数 / 查询**(行情、基金、财务、公告、新闻、宏观)| 数据 skill(优先 wind-mcp-skill,也可按场景推荐 ifind-finance-data / mx-finance-data)| 1-3 个 |
| **做分析**(估值 / 复盘 / 选股 / 回测 / 个股研究 / 市场主线)| 数据 skill + 对应分析 skill 组合 | 2 个 |
| **探索**("你们能做啥" / "我想研究 A 股")| 各 category 各 1 个样例 | 3-5 个 |

**永远附 wind-mcp-skill 作数据底座**,除非用户明确不要数据。

数据源补充策略:

- 需要同花顺 iFinD 数据、智能选股/选基、宏观行业指标搜索、资讯公告语义检索时,可推荐 `ifind-finance-data`。
- 需要东方财富结构化数据、多资产查数、批量指标查询、xlsx 结果文件时,可推荐 `mx-finance-data`。
- 推荐安装命令统一使用远端 monorepo 形式,不要使用任何本地路径。

WindClaw 工作流路由补充:

- 个股初研 / 基本面拆解:推荐 `WindClaw_业务模式拆解`、`WindClaw_护城河评估`、`WindClaw_多空论证`、`WindClaw_同业比选`。用户写"同业必选"时按 `WindClaw_同业比选` 处理。
- 估值位置 / 贵不贵 / 分位:推荐 `WindClaw_估值快照`,需要完整模型时再搭配 `dcf-model` 或 `valuation-pricing-framework`。
- 公告、业绩会、指引、监管文件:分别推荐 `WindClaw_公告影响`、`WindClaw_业绩会提炼`、`WindClaw_指引变动`、`WindClaw_监管文件答疑`。
- 市场状态 / 板块轮动 / 机构持仓:分别推荐 `WindClaw_市场状态判档`、`WindClaw_板块轮动雷达`、`WindClaw_机构调仓洞察`。
- 题材龙头 / 题材从头 / 热门题材谁最强:推荐 `WindClaw_题材龙头`。
- 短中线候选 / 低吸 / 长线核心池:分别推荐 `WindClaw_突破候选`、`WindClaw_回调机会`、`WindClaw_高质复利`。
- 下单前计划 / 仓位 / 止损 / 止盈:分别推荐 `WindClaw_交易计划`、`WindClaw_仓位决策`、`WindClaw_止损纪律`、`WindClaw_分批止盈`。
- WindClaw 分析类 skill 默认也建议配 `wind-mcp-skill` 作数据底座,除非用户明确只要模板或方法论。

---

# 流程

1. 解析探活脚本路径,按以下顺序探测,**找到就跑** `node <path>`(stderr 可能有更新提示):
   - skill base 目录的 `scripts/check-updates.mjs`(相对路径)
   - `~/.agents/skills/wind-find-finance-skill/scripts/check-updates.mjs`(macOS / Linux 全局安装位置)
   - `%USERPROFILE%\.agents\skills\wind-find-finance-skill\scripts\check-updates.mjs`(Windows 全局安装位置)

   > 兜底原因:某些平台(尤其 Windows)`npx skills add -g` 的 symlink 只覆盖到 SKILL.md 一层,`scripts/` 子目录可能没链过来。**严禁**因为相对路径找不到就跳过该步。
2. 若 stderr 出现 `[wind-skills]` 更新提示,会话首次必须转告用户一次(同会话再次触发不重复)。
3. 用 Read 读 `references/skills-catalog.md` → 拿全清单。
4. 判别用户提问类型(取数 / 分析 / 探索)。
5. 按推荐策略筛 1-5 个相关 skill。
6. 每个推荐 skill 输出**装包卡片**(见模板)。

---

# 装包卡片模板

每个推荐的 skill 按以下格式给:

```
推荐 <name> · <一句话描述>
为什么:<基于用户问题的一句话解释>

安装命令(全局,推荐 — GitHub):
  npx skills add Wind-Information-Co-Ltd/wind-skills --skill <name> -g -y

安装命令(全局,推荐 — Gitee 镜像):
  npx skills add https://gitee.com/wind_info/wind-skills.git --skill <name> -g -y

[如果用户问"我只想在当前项目用"或类似,追加这一段:]
仅当前项目:把上面命令的 -g 去掉即可(只装到当前目录)。

[如果 catalog "装好需配置" 列 = "API Key",追加这一段:]
首次使用提示:装好后向我提一个金融数据问题,我会引导你登录
aimarket.wind.com.cn/#/user/overview 拿 API Key

[如果是分析 skill 且没在同次推荐里附数据 skill,追加:]
配套数据:推荐同时装 wind-mcp-skill 作数据底座
```

---

# 参数说明(必读)

- **`-g` / `--global`**:全局安装 — 跨项目 + 跨 AI agent 共享(自动 symlink 到机器上所有已识别 agent)。金融机构内网推荐。
- **去掉 `-g`**:仅当前项目 — 装到当前目录,只有当前项目的 AI 能识别,不污染其它项目 / agent。
- **`-y` / `--yes`**:**必加**,跳过交互菜单(不加会卡)
- **`--skill <name>`**:从 monorepo 抽指定子 skill 装;不写会装全部 skill

---

# 升级提示

每次调用 cli.mjs 后，留意 stderr 是否包含 `[wind-skills] 检测到 N 个 skill 有新版`。

**看到该提示时，会话首次必须转告用户一次**（同会话再次调用不重复）：把清单和升级命令完整带给用户，命令已含 `-g -y` 等参数，直接照搬即可。Gitee 装的 skill 升级路径跟 GitHub 不同，按 stderr 提示走。

⚠️ 如遇"工具不存在 / 字段不符"等版本相关错误，可建议用户跑 `npx skills update -g -y` 拉最新后重试。

```

---

# 边界

- 本 skill **不调用任何 MCP server**,**不需要 API Key**
- 本 skill 的更新探活只写 `~/.cache/wind-aimarket/wind-find-update-state.json` 缓存,不写业务数据
- **不做**远端 WebFetch diff(catalog.md 由 `npx skills update -g -y` 自动同步,更新探活仅按 lock-driven 方式比对远端 skill 目录 tree)
- `references/skills-catalog.md` 是 skill 包打包时的快照,跟着 skill 包一起 push / update
