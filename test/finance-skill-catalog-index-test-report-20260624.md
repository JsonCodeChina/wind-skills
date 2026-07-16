# wind-find-finance-skill 40 个新 skill 索引测试报告

> 生成日期: 2026-06-24  
> 测试对象: `skills/wind-find-finance-skill/references/skills-catalog.md`  
> 关联提交: `b491708 Add finance workflow skills to catalog`  
> 测试结论: 通过

## 1. 测试范围

本次测试验证 40 个新增金融工作流 skill 是否已被 `wind-find-finance-skill` 的本地 catalog 正确收录，并能被关键词路由检索到。

覆盖内容:

- 40 个新增 `skills/*_skill/SKILL.md` 文件是否全部在 catalog 中存在索引行
- `skills-catalog.md` 工作流表是否包含对应 skill 名称
- 典型用户查询关键词是否能命中预期 skill
- category 索引是否覆盖新增分类

未覆盖内容:

- 未实际执行每个新 skill 的完整业务流程
- 未验证 `npx skills add` 安装链路
- 未修改或测试 `skills/wind-mcp-skill/scripts/cli.mjs`

## 2. 测试环境

| 项目 | 值 |
| --- | --- |
| 仓库 | `G:\jhuan.jerry\GIT\wind-skills` |
| 分支 | `master` |
| 远端 | `origin/master` |
| Node | `v22.22.1` |
| Shell | PowerShell + `rtk` |
| 当前未提交改动 | `skills/wind-mcp-skill/scripts/cli.mjs` |

## 3. 完整性检查

检查上次提交新增的 40 个 `*_skill` 文件是否都能在 `skills-catalog.md` 中找到。

结果:

```json
{
  "newSkillFilesInLastCommit": 40,
  "indexed": 40,
  "missing": []
}
```

结论: 40 个新增 skill 全部已进入 catalog，没有缺失。

## 4. Catalog 行数检查

统计 catalog 中包含 `_skill` 的索引行。

结果:

```text
catalog _skill rows: 68
```

说明: 该数字包含历史已有的 `_skill` 条目和本次新增的 40 个条目。

## 5. 关键词命中测试

用典型用户查询词模拟 `wind-find-finance-skill` 读取 catalog 后的路由判断。判定标准为: 预期 skill 出现在 top 3 命中结果中，或位列第一。

| 查询词 | 预期 skill | Top 命中 | 结果 |
| --- | --- | --- | --- |
| 盘前 自选股 简报 | `daily_watchlist_morning_brief_skill` | `daily_watchlist_morning_brief_skill(3)` | 通过 |
| 盘后 自选股 复盘 | `after_close_watchlist_recap_skill` | `after_close_watchlist_recap_skill(3)` | 通过 |
| 财报前 预期 看点 | `earnings_preview_skill` | `earnings_preview_skill(3)` | 通过 |
| 财报后 漂移 PEAD | `pead_opportunity_skill` | `pead_opportunity_skill(2)` | 通过 |
| 突破 交易 执行 | `breakout_trade_execution_skill` | `breakout_trade_execution_skill(3)`, `failed_breakout_exit_skill(3)` | 通过 |
| 低吸 回调 承接 | `dip_buy_decision_skill` | `dip_buy_decision_skill(2)`, `pullback_opportunity_finder_skill(2)` | 通过 |
| 北向资金 外资 流向 | `northbound_capital_flow_skill` | `northbound_capital_flow_skill(3)` | 通过 |
| 政策 新闻 行业 影响 | `policy_headline_interpreter_skill` | `policy_headline_interpreter_skill(4)` | 通过 |
| 回购 计划 利好 | `buyback_program_reviewer_skill` | `buyback_program_reviewer_skill(3)` | 通过 |
| 分红 削减 恢复 | `dividend_change_explainer_skill` | `dividend_change_explainer_skill(3)` | 通过 |
| 盘中 急拉 放量 异动 | `intraday_abnormal_move_alert_skill` | `intraday_abnormal_move_alert_skill(4)` | 通过 |
| 热门股 快速 业务 催化 | `hot_stock_quick_read_skill` | `hot_stock_quick_read_skill(3)` | 通过 |
| 股东信 战略 资本配置 | `shareholder_letter_digest_skill` | `shareholder_letter_digest_skill(3)` | 通过 |
| 支撑位 跌破 预警 | `support_break_warning_skill` | `support_break_warning_skill(2)` | 通过 |
| 目标价 触达 止盈 | `price_target_reach_alert_skill` | `price_target_reach_alert_skill(2)` | 通过 |

结论: 15 组典型关键词全部命中预期 skill。

## 6. Category 索引检查

检查新增分类的代表 skill 和数量是否能覆盖新增能力。

重点新增/扩展分类:

- `个股研究`
- `事件/公告/财报文档`
- `市场主线`
- `选股`
- `复盘/自选股`
- `交易执行`
- `盘中异动/交易判断`

观察项:

- `估值` 索引显示为 4；按精确分类拆分为 3，但表中存在 `earnings-analysis | 估值-季报`，人工口径计入估值类时为 4。
- 该观察项与本次新增 40 个 skill 无关，不影响本次索引验收。

## 7. 工作区状态

测试完成后未修改业务代码。当前工作区仍保留一处既有未提交改动:

```text
M skills/wind-mcp-skill/scripts/cli.mjs
```

## 8. 结论

`wind-find-finance-skill` 的本地 catalog 已能搜索到本次新增的 40 个金融工作流 skill。完整性检查、关键词路由模拟和 category 覆盖检查均满足本次验收目标。
