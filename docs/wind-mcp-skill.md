# Wind MCP Skill 使用说明

> **访问万得 Wind 金融数据** · 股票 / 基金 / 指数 / 债券 / 公告 / 新闻 / 宏观经济

---

## 这是什么
 
通过 MCP 协议访问万得 Wind 金融数据库，给 AI Agent 提供：

- 股票筛选 + 行情（最新价 / K 线 / 分钟）+ 财务基本面（档案 / 财报 / 股本 / 事件 / 技术指标 / 风险）
- ETF / 公募基金筛选 + 行情 + 全维数据（档案 / 财务 / 持仓 / 业绩 / 持有人 / 管理公司）
- 指数 / 板块行情 + 档案 / 基本面（成份股加权 PE / PB / PS）/ 技术指标
- 债券基本档案 / 发债主体 / 行情估值（久期 / 凸性 / 利差）/ 主体财务
- 上市公司公告 + 财经新闻 RAG
- 宏观经济 / 行业经济指标（EDB）
- 自然语言通用查询入口（仅在专项能力无法覆盖时兜底，覆盖更广泛的 Wind 数据库）

**不包含**：欧股 / 日股 / 其它非中概非美股、期货盘口、加密货币、非金融数据。

---

## 安装

```bash
# 全局（推荐 — 跨项目 + 跨 AI agent 共享）

# GitHub
npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-mcp-skill -g -y

# Gitee 镜像（国内）
npx skills add https://gitee.com/wind_info/wind-skills.git --skill wind-mcp-skill -g -y
```

> 想限制在当前项目内用，把命令的 `-g` 去掉即可。`-g` 会按 skills 工具支持的客户端进行全局安装 / 链接（如 Claude Code / Cursor / OpenClaw / Hermes 等）。

---

## API Key

需要 `WIND_API_KEY`（登录 [Wind金融AI市场](https://aifinmarket.wind.com.cn/#/user/overview) 获取）。

装好后向 AI 提一个 wind 数据问题，AI 会按 stdout JSON envelope 里的 `error.agent_action` / `error.hint` 引导完成 Key 配置——无需手动管路径。也可以在本 skill 目录下运行：

```bash
node scripts/cli.mjs open-portal
```

如果返回 `KEY_MISSING`，按错误信息配置 API Key。

---

## 使用注意

- `analytics_data` 只是兜底入口；公告 / 新闻、宏观、行情、财务基本面等明确意图应优先走对应 `server_type`。
- 各领域契约是 `server_type + tool_name` 和参数的权威说明；错误组合会返回 `ROUTE_ERROR`。
- Windows PowerShell 5.x 中 JSON 转义容易导致 `INVALID_PARAMS_JSON`。如果遇到该错误，请优先看 [SKILL.md](../skills/wind-mcp-skill/SKILL.md) 里的参数传递说明。
- K 线和分钟行情统一传 `begin_date` / `end_date`，日期值必须是 ISO 8601 `yyyy-MM-dd`。
- 行情类 `indexes` 必须从对应领域契约的「`indexes` 行情指标」复制字段名。

---

## 升级

```bash
# 装到全局(默认推荐)
npx skills update wind-mcp-skill -g -y

# 装到当前项目(不带 -g)
npx skills update wind-mcp-skill -y
```

call 命令调用时会触发后台自动更新检查。每天首次使用时异步执行一次
`npx skills update wind-mcp-skill -y`；如果当前 skill 位于全局
`~/.agents/skills` 下，则自动追加 `-g`。执行结果写入当前 skill 根目录的
`update-state.json`；当天后续调用不会再次执行，且不会阻塞正常取数。

---

## 目录结构

```
wind-mcp-skill/
├── SKILL.md                     # 核心路由、门禁与直接导航
├── references/
│   ├── stock.md                 # 股票工具契约
│   ├── fund.md                  # 基金工具契约
│   ├── index.md                 # 指数工具契约
│   ├── bond.md                  # 债券工具契约
│   ├── financial-docs.md        # 公告与新闻工具契约
│   ├── economic.md              # 宏观工具契约
│   └── analytics.md             # 通用结构化取数契约
├── scripts/
│   ├── cli.mjs                  # MCP 调用主入口
│   ├── runtime/                 # CLI 使用的清单、校验、归一化和错误码配置
│   └── update-check.mjs         # 每日一次后台自动更新
```

详细的路由规则见 [SKILL.md](../skills/wind-mcp-skill/SKILL.md)，工具参数见相应领域契约。
