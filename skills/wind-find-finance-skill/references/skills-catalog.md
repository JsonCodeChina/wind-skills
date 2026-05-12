---
name: aimarket-skills-catalog
description: AIMarket 平台 skill 清单本地副本。由 npx skills update -g -y 随 wind-find-finance-skill 一起更新。
---

# AIMarket Skill 目录

> 平台所有可装 skill 的清单。
> 由 `npx skills update -g -y` 随 wind-find-finance-skill 一起更新。

---

## 数据类(取数 / 查询)

> 取数 / 查询:行情、基金、股票财务、公告、新闻、宏观指标。

| 名称 | category | 装好需配置 | 一句话 |
|---|---|---|---|
| wind-mcp-skill | 数据-行情/基金/股票/宏观/文档 | API Key | 访问万得 Wind 金融数据:A 股 / 港股股票(行情与财务) + ETF / 公募基金(行情与全维数据) + 公司公告 + 财经新闻 + 宏观经济指标 |
| ifind-finance-data | 数据-行情/基金/宏观/新闻公告/智能选股 | API Key | 访问同花顺 iFinD 金融数据:股票、基金、宏观经济、行业经济、新闻公告,并支持智能选股、选基与指标搜索 |
| mx-finance-data | 数据-结构化查询/行情/财务/估值/多资产 | 依赖 + API Key | 访问东方财富数据库:覆盖 A 股 / 港股 / 美股、基金、债券等多资产结构化数据,输出 xlsx 与结果说明文件 |

---

## 工作流类(决策 / 分析)

> 决策 / 工作流:估值、复盘、选股、回测、个股研究、市场主线。

| 名称 | category | 装好需配置 | 一句话 |
|---|---|---|---|
| dcf-model | 估值 | 无 | DCF 估值建模(WACC + 敏感性分析) |
| earnings-analysis | 估值-季报 | 无 | 季报点评(beat/miss + 估值更新) |
| valuation-pricing-framework | 估值 | 无 | 估值与定价框架(重估空间判断) |
| equity-investment-thesis | 个股研究 | 无 | 个股投资逻辑深度研究(券商研究员风格) |
| a-share-primary-theme-identification | 市场主线 | 无 | A 股市场主线识别(题材周期 / 资金行为) |
| market-environment-analysis | 市场主线 | 无 | 全球市场环境分析(risk-on / risk-off) |
| theme-detector | 市场主线 | 无 | 跨板块主题检测(FINVIZ + 生命周期) |
| post-market-debrief | 复盘 | 无 | 盘后复盘(市场全景 / 主线轮动) |
| position-sizer | 仓位 | 无 | 仓位管理(风险 / Kelly / ATR) |
| backtest-expert | 回测 | 无 | 量化策略系统化回测(压力测试) |

---

## category 索引(用户问"探索"时用)

| category | 含 skill 数 | 代表 skill |
|---|---|---|
| 数据-行情/基金/股票/宏观/文档 | 3 | wind-mcp-skill |
| 估值 | 3 | dcf-model |
| 个股研究 | 1 | equity-investment-thesis |
| 市场主线 | 3 | a-share-primary-theme-identification |
| 复盘 | 1 | post-market-debrief |
| 仓位 | 1 | position-sizer |
| 回测 | 1 | backtest-expert |

---

## 安装公式

把命令里的 `<name>` 换成上表"名称"列的值:

```bash
# 全局安装(推荐 — 跨项目 + 跨 AI agent 共享)
# 国外(GitHub)
npx skills add Wind-Information-Co-Ltd/wind-skills --skill <name> -g -y
# 国内(Gitee 镜像)
npx skills add https://gitee.com/wind_info/wind-skills.git --skill <name> -g -y
```

> 想限制在当前项目内用,把上面命令的 `-g` 去掉即可。

参数说明:
- `-g`:全局安装 — 跨项目 + 自动 symlink 到机器上所有已识别 AI agent(Claude Code / Cursor / OpenClaw / Hermes 等)。金融机构内网推荐。
- 去掉 `-g`:仅当前项目 — 装到当前目录,不影响其它项目 / agent。
- `-y`:**必加**,跳过交互菜单(不加会卡)

---

## 升级所有已装 skill

```bash
npx skills update -g -y
```

含义:`update` 重拉所有已装 skill 最新版,`-g` 只升级全局,`-y` 跳过 scope 提示。
