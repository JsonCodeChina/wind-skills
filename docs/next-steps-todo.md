# Wind AIFinMarket 金融 Skill 下一步 TODO

## 背景

当前已经完成第一版金融入口设计：

- `skill.md` 作为公开入口，推荐安装 `wind-find-finance-skill`
- `wind-find-finance-skill` 作为入口 skill，负责按用户金融问题路由到合适 skill
- `docs/finance-skill-entry-flow.md` 已记录入口流程

下一步重点不是继续堆更多金融 skill，而是先把远程能力事实层做稳定。

## TODO 1：定义 `manifest.json` v1 合约

目标：让 `aifinmarket.wind.com.cn` 提供一个机器可读的金融能力地图。

建议路径：

```text
https://aifinmarket.wind.com.cn/skills/manifest.json
```

建议最小结构：

```json
{
  "version": "2026-04-26",
  "updated_at": "2026-04-26T00:00:00+08:00",
  "skills": [],
  "categories": [],
  "unsupported": [],
  "docs": {}
}
```

每个 skill 至少包含：

```json
{
  "name": "wind-quote-skill",
  "status": "open",
  "vendor": "wind",
  "markets": ["A股", "港股"],
  "capabilities": ["latest_quote", "kline", "minute_bar", "sector_members"],
  "install": "npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-quote-skill -g -y",
  "docs_url": "https://aifinmarket.wind.com.cn/skills/wiki/skills/wind-quote-skill.md"
}
```

状态建议固定为：

```text
open
partial
not_available
deprecated
```

## TODO 2：发布官网静态能力中心

目标：把权威能力和边界从 skill 包中迁移到官网。

最小文件集合：

```text
/skill.md
/skills/manifest.json
/skills/wiki/index.md
/skills/wiki/skills/wind-quote-skill.md
/skills/wiki/skills/wind-financial-data-skill.md
/skills/wiki/skills/_coming_soon.md
```

原则：

- `skill.md` 只做公开入口，不承载完整能力事实
- `manifest.json` 是机器可读事实源
- `wiki/*.md` 是客户 Agent 需要进一步理解边界时读取的说明书

## TODO 3：改造 `wind-find-finance-skill` 为 remote-first

目标：入口 skill 变薄，不再长期内置完整 wiki。

建议结构：

```text
wind-find-finance-skill/
├── SKILL.md
├── scripts/
│   └── cli.mjs
└── fallback-manifest.json
```

运行流程：

```text
route "<用户问题>"
  -> 拉 https://aifinmarket.wind.com.cn/skills/manifest.json
  -> 命中远程 manifest 则使用远程版本
  -> 拉取失败但有缓存，则使用缓存
  -> 拉取失败且无缓存，则使用 fallback-manifest.json
  -> 返回 route_status / recommended_skills / docs_url / next_steps
```

入口 skill 包内只保留极小兜底：

- `wind-quote-skill`
- `wind-financial-data-skill`
- 主要未开放方向

完整 wiki 不再放入 skill 包。

## TODO 4：建立路由回归测试

目标：避免金融泛词误判，例如“收益率”同时可能指债券、指数、基金。

建议文件：

```text
tests/routing-cases.json
```

首批至少覆盖 50 条真实问题：

```text
A 股最新价 -> wind-quote-skill
K 线 -> wind-quote-skill
分钟行情 -> wind-quote-skill
板块 / 指数成分 -> wind-quote-skill
财务 / ROE / 营收 -> wind-financial-data-skill
估值 / PE / PB -> wind-financial-data-skill
宏观 / GDP / CPI / M2 -> wind-financial-data-skill
指数收益率 / 指数估值 -> wind-financial-data-skill
美股 / 基金 / 债券 / 期货 / 外汇 / 加密货币 -> not_available
研报 / 深度报告 -> not_available
```

每次修改 manifest 或路由逻辑前后都跑测试。

## TODO 5：收敛 `skill.md`

等 `manifest.json` 路径稳定后，`skill.md` 应保持很短：

```text
这是 Wind AIFinMarket 金融能力入口。
请安装 wind-find-finance-skill。
入口 skill 会读取 /skills/manifest.json 判断能力边界。
```

不要把完整能力表放进 `skill.md`，避免形成第二个需要维护的事实源。

## 推荐执行顺序

```text
1. 定义 manifest.json v1 schema
2. 在 aifinmarket.wind.com.cn 发布静态 manifest + wiki
3. 改造 wind-find-finance-skill remote-first
4. 建 routing-cases.json 回归测试
5. 收敛 skill.md 内容
```

## 成功标准

- 新增或修改金融能力时，只需要更新官网 manifest / wiki，不需要用户重装入口 skill。
- 客户 Agent 能稳定拿到 supported / partial / not_available 的结构化结果。
- 对未开放方向，Agent 能明确告知用户当前暂未开放，不会编造能力。
- 路由回归测试能覆盖主要金融问法和高风险误判词。
