---
name: wind-mcp-skill
description: >-
  访问万得 Wind 金融数据。覆盖 A 股 / 港股股票行情（最新价 / K 线 / 分钟）与财务基本面（财报 / 股本 / 事件 / 技术指标 / 风险）、ETF / 公募基金行情与全维数据（档案 / 财务 / 持仓 / 业绩 / 持有人 / 管理公司）、上市公司公告与财经新闻、宏观经济与行业指标。需要 WIND_API_KEY（登录 aimarket.wind.com.cn/#/user/overview 开发者中心获取）。**不包含**：美股 / 欧股 / 日股、汇率 / 期货盘口、加密货币、非金融数据。
author: Wind AIMarket
homepage: https://aimarket.wind.com.cn
auto_invoke: true
security:
  child_process: true
  eval: false
  filesystem_read: true
  filesystem_write: true
  network: true
examples:
  - "贵州茅台今天最新价"
  - "腾讯控股 00700.HK 最新价和成交量"
  - "宁德时代近 30 日 K 线"
  - "贵州茅台今日分钟级走势"
  - "科创50ETF 588200.SH 最新折溢价率"
  - "易方达蓝筹精选 005827.OF 的最新规模和经理"
  - "宁德时代 2024 年 ROE 和净利润增速"
  - "贵州茅台 vs 五粮液 2024 年营收对比"
  - "贵州茅台 2024 年年度报告内容"
  - "美联储 2026 年利率政策最新新闻"
  - "中国近 10 年新能源汽车产销量"
  - "贵州茅台前十大股东"
---

# Wind 万得金融数据

通过 MCP 协议访问万得 Wind 金融数据：股票 / 基金 / 公司公告 / 财经新闻 / 宏观指标。

---

## 1. 数据范围

5 个 server_type 各自能干什么：

| server_type | 能力 |
|---|---|
| `fund_data` | 基金 ETF / LOF 行情 + 全维数据（档案 / 财务 / 持仓 / 业绩 / 持有人 / 管理公司）|
| `financial_docs` | 上市公司公告 + 财经新闻 RAG |
| `stock_data` | A 股 / 港股股票行情 + 基本面（档案 / 财务 / 股本 / 事件 / 技术指标 / 风险）|
| `economic_data` | EDB 宏观 / 行业经济指标（含 `freq` / `magnitude` / `currency` / `searchType` 等精细化字段控制）|
| `analytics_data` | 自然语言通用入口，覆盖整个 Wind 数据库（跨域综合 / 指数 / 衍生品 / 债券 / 商品等）|

**❌ 不触发**：美股 / 欧股 / 非中概股；汇率 / 期货盘口 / 加密货币；非金融数据。

**📅 数据时效**：行情快照 + 分钟级 = 当日准实时；K 线 = 收盘历史；财务 / 档案 = 最近一期定期报告。`WIND_API_KEY` 有日调用额度。

---

## 2. 使用方法

### 调用命令

```bash
node scripts/cli.mjs call <server_type> <tool_name> '<params_json>'
```

### API Key

报 `KEY_MISSING` 时按 cli.mjs stderr 给的 extraHint 配置即可（程序自动按多种方式查找 Key）；需要拿 Key 跑 `node scripts/cli.mjs open-portal` 自动打开开发者中心。

### 入参签名两类

| 类型 | 入参 | 适用工具 |
|---|---|---|
| **行情类** | `{windcode, ...}` 结构化字段 | `*_price_indicators` / `*_kline` / `*_quote` |
| **NL 类** | `{question: string, lang?: "CNS"\|"ENS"}` 自然语言（默认 `CNS`=中文） | 其余工具（含 `financial_docs` / `economic_data` / `analytics_data`，部分入参字段名有差异，详见工具表）|

### windcode 填法（仅行情类用）

**AI 怎么取 windcode**：直接把用户原话里的标的名（中文名 / 简称 / 代码）塞进 `windcode` 字段——后端自动解析（`贵州茅台` → `600519.SH`、`小米集团` → `01810.HK`、`易方达蓝筹精选` → `005827.OF`）。**无需 AI 自己查代码或本地推断**。

**反问用户的两种情况**：
1. 后端报"未找到 / 歧义 / 多结果"——把候选列出来让用户选
2. 用户给的是短名 / 别名（如 `茅台` 可能是贵州茅台 / 茅台股份 / 重庆啤酒-茅台啤酒...），主动反问"你问的是哪只？"

**Wind 代码格式**（用户直接给代码时识别用）：

| 类型 | Wind 代码 | 中文名 |
|---|---|---|
| A 股 | `600519.SH` / `000858.SZ` / `8XXXXX.BJ` | `贵州茅台` |
| 港股 | `00700.HK` | `腾讯控股` |
| 场外基金 | `005827.OF` | `易方达蓝筹精选` |
| ETF / LOF | `588200.SH` / `159915.SZ` | `科创50ETF` |

---

## 3. 工具表

### 行情类（`fund_data` + `stock_data` 共用 3 个工具）

#### `get_{fund|stock}_price_indicators` — 行情快照

| 字段 | 必填 | 说明 |
|---|---|---|
| `windcode` | ✅ | 见 windcode 填法 |
| `indexes` | ✅ | 字段逗号分隔。**常用快捷**（覆盖 80% 高频问题）：<br>· 通用：`NAME,MATCH,PRECLOSE,OPEN,HIGH,LOW,VOLUME,TURNOVER,CHANGE,CHANGERANGE`<br>· 股票额外：`CHANGEHANDRATE,LIANGBI,WEIBI,HIGHLIMIT,LOWLIMIT,CAPITALMARKETVALUE,LISTEDMARKETVALUE,WEEK52HIGH,WEEK52LOW,PE_TTM,PB,DIVIDENDYIELDRATIO`<br>· 基金额外：`IOPV,PREMIUMDISCOUNTRATE,FUNDSIZE`<br>其它字段（估值细分 / 财务 / 资金流 / 期权希腊字母等）见使用技巧 |

#### `get_{fund|stock}_kline` — K 线

| 字段 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `windcode` | ✅ | | |
| `begin_date` | ⚠️ | 昨天 | `yyyyMMdd` |
| `end_date` | | 今天 | `yyyyMMdd` |
| `period` | | `"10"` | `1`=1分 / `3`=5分 / `4`=10分 / `5`=15分 / `6`=30分 / `7`=60分 / `8`=120分 / `9`=240分 / `10`=日K / `11`=周K / `12`=月K / `13`=年K / `14`=季K / `15`=半年K |
| `aftype` | | `"0"` | `0`=前复权 / `1`=后复权 |
| `issusp` | | `"1"` | `0`=不含停牌 / `1`=含 |

#### `get_{fund|stock}_quote` — 分钟级

| 字段 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `windcode` | ✅ | | |
| `begin` | | `LAST` | `yyyyMMdd` 或 `LAST` |
| `end` | | `LAST` | `yyyyMMdd` 或 `LAST` |

**示例：**

```bash
node scripts/cli.mjs call stock_data get_stock_price_indicators '{"windcode":"600519.SH","indexes":"NAME,MATCH,CHANGERANGE,VOLUME"}'
node scripts/cli.mjs call fund_data get_fund_price_indicators '{"windcode":"588200.SH","indexes":"NAME,MATCH,IOPV,PREMIUMDISCOUNTRATE"}'
node scripts/cli.mjs call stock_data get_stock_kline '{"windcode":"600519.SH","begin_date":"20260401","end_date":"20260430"}'
node scripts/cli.mjs call stock_data get_stock_quote '{"windcode":"600519.SH"}'
```

### NL 类（按 server_type 分）

入参签名：`{question: string, lang?: "CNS" | "ENS"}`，默认 `CNS`=中文。

#### `fund_data` NL（6 个）

| 工具 | 说明 | question 示例 |
|---|---|---|
| `get_fund_info` | 档案（代码 / 简称 / 风格 / 业绩基准 / 费率 / 经理）| `"易方达蓝筹精选 005827.OF 基金档案"` |
| `get_fund_financials` | 财务（利润 / 净值 / 收入 / 费用 / 分红）| `"005827.OF 2024 年净利润和分红"` |
| `get_fund_holdings` | 持仓 + 资产配置（重仓股 / 申万 / Wind / 中信行业）| `"005827.OF 最新一期重仓股"` |
| `get_fund_performance` | 业绩 + 排名 + ETF / 二级交易 | `"005827.OF 近 1 年业绩排名"` |
| `get_fund_shareholders` | 持有人结构（个人 / 机构 / 申购赎回 / 规模变动）| `"005827.OF 持有人结构"` |
| `get_fund_company_info` | 基金管理公司档案 + 经理团队 | `"易方达基金管理公司档案"` |

#### `stock_data` NL（6 个）

| 工具 | 说明 | question 示例 |
|---|---|---|
| `get_stock_basicinfo` | 公司档案（信息 / 主营 / 行业 / IPO 上市板）| `"600519.SH 公司基本档案"` |
| `get_stock_fundamentals` | 财务（盈利 / 资产负债 / 利润 / 现金流 / 增长率）| `"贵州茅台 2024 年 ROE 和净利润增速"` |
| `get_stock_equity_holders` | 股本 + 股东（总股本 / 流通 / 前十大 / 实控人 / 限售）| `"贵州茅台前十大股东"` |
| `get_stock_events` | 事件 + 资本运作（IPO / 增发 / 配股 / 并购 / ST）| `"宁德时代 2024 年增发和并购事件"` |
| `get_stock_technicals` | 技术指标时间序列（MACD / KDJ / RSI / BOLL / 融资融券 / 龙虎榜）| `"贵州茅台近 60 日 MACD 走势"` |
| `get_risk_metrics` | 风险指标（Beta / Jensen Alpha / 波动率 / Sharpe）| `"贵州茅台过去 1 年 Beta 和波动率"` |

#### `financial_docs` — 公告 / 新闻（2 个）

`get_company_announcements`（公司公告 / 监管文件 / 招股书 / 业绩公告 / 致股东信）/ `get_financial_news`（财经新闻）共用入参：

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `query` | ✅ | string | 自然语言，如 `"贵州茅台 2024 年报"` / `"美联储利率政策"` |
| `top_k` | | int | 返回文档数 |
| `start_date` / `end_date` | | string | 格式 `YYYY-MM-DD` |

```bash
node scripts/cli.mjs call financial_docs get_financial_news '{"query":"美联储利率政策","top_k":5,"start_date":"2026-01-01"}'
```

#### `economic_data` — EDB 宏观（1 个）

`get_economic_data` — EDB 宏观 / 行业经济指标，提供 `freq` / `magnitude` / `currency` 等精细化字段控制：

| 字段 | 必填 | 说明 |
|---|---|---|
| `metricIdsStr` | ✅ | **自然语言问句**（不是指标 ID），如 `"中国 GDP"` / `"美国 CPI 同比"` |
| `beginDate` / `endDate` | | `yyyyMMdd` |
| `freq` | | `日`=`1` / `工作日`=`2` / `周`=`3` / `月`=`4` / `季`=`5` / `半年`=`6` / `年`=`7` / `年度`=`8`（中文或代码均可）|
| `magnitude` | | `个`=`1` / `千` / `万` / `百万` / `千万` / `亿` / `十亿` / `百亿` / `千亿` / `万亿` |
| `currency` | | `USD` / `CNY` / `EUR` / `JPY` / `AUD` / `GBP` / `CHF` / `CAD` / `SGD` / `HKD` / `MYR` / `BYR` |
| `searchType` | | `深度`=`0` / `精确`=`1` |
| `ifUnion` | | `开启`=`1` / `不开启`=`2`（混合搜索）|

```bash
node scripts/cli.mjs call economic_data get_economic_data '{"metricIdsStr":"中国 CPI 同比","freq":"月","beginDate":"20240101","endDate":"20261231"}'
```

#### `analytics_data` — NL 通用入口（1 个）

`get_financial_data` — 自然语言通用查询入口，覆盖整个 Wind 数据库（含跨域综合 / 指数 / 衍生品 / 债券 / 商品等其它 server_type 之外的杂项）。

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `question` | ✅ | string | 自然语言问句，如 `"中证 500 最近一周表现"` |
| `lang` | | enum | `CNS`=中文（默认）/ `ENS`=英文 |

```bash
node scripts/cli.mjs call analytics_data get_financial_data '{"question":"中证 500 最近一周表现"}'
```

---

## 4. 注意事项（违反必失败）

| 规则 | 后果 |
|---|---|
| 命令必须在**本文件所在目录**下执行 | cli.mjs 用相对路径，否则找不到资源 |
| K 线 `begin_date` 必须**显式传**（哪怕传昨天）| 不传只回 2 条数据 |
| `*_quote` 字段名是 `begin / end`，**不是** `begin_date / end_date` | 字段名错参数解析报错 |
| K 线日期 `yyyyMMdd`，文档查询 / EDB 字段 `start_date` / `end_date` 用 `YYYY-MM-DD` | 格式混了报错 |
| `aftype` 只接受 `"0"` / `"1"`（无"不复权"） | 其他值报错 |
| 单工具调用**只支持单标的** | 逗号分隔多代码后端只识别第 1 个，其余静默忽略 |
| 结果末尾**必须标注**「数据来源于万得 Wind 金融数据服务」 | 合规要求 |

---

## 5. 使用技巧

| 场景 | 怎么做 |
|---|---|
| 拿单时点最新值 / 已知具体字段名 | 用行情类工具（`*_price_indicators`），结构化入参 |
| 拿过去 N 日时间序列 | K 线 / 分钟级用行情类（`*_kline` / `*_quote`）；技术指标 / 财务时间序列用 NL 类（`*_technicals` 等）|
| 财务 / 档案 / 持仓 / 事件等深度业务问题 | NL 类工具，自然语言入参 |
| `indexes` 字段不在常用快捷里 | Read `references/indicators.md`（694 项 enum，命名陷阱多：大小写混杂 / 拼写错原样保留 / `Type` `Shares` 等单词字段含义特殊，凭印象猜必错）|
| 多标的对比（`贵州茅台 vs 五粮液`）| 单工具单标的限制 → 并行多次调用 |
| NL `question` / `query` 写法 | 提取关键实体即可。✅ `"005827.OF 基金档案"` / ❌ `"帮我查一下..."` |

---

## 6. 出错怎么办

cli.mjs 大部分错误会自动输出错误码 + 处理建议（stderr），照建议走即可。常见 schema 类陷阱：

| 错误 | 解法 |
|---|---|
| `indexes` 字段不识别 / 字段名不存在 | Read `references/indicators.md` 挑准确字段名 |
| 工具不存在 / 未知 server_type / schema 对不上 | 跑 `npx skills update wind-mcp-skill -y` 拉新版 |
| 调用似乎啥都没报 | 检查命令是否在本 SKILL.md 所在目录下执行 |

---

## 7. 保持最新

每次调用 cli.mjs 后，留意 stderr 是否包含 `[wind-skills] 检测到 N 个 skill 有新版`。

**看到该提示时，会话首次必须转告用户一次**（同会话再次调用不重复）：把清单和升级命令完整带给用户，命令已含 `-g -y` 等参数，直接照搬即可。Gitee 装的 skill 升级路径跟 GitHub 不同，按 stderr 提示走。

⚠️ 如遇"工具不存在 / 字段不符"等版本相关错误，可建议用户跑 `npx skills update -g -y` 拉最新后重试。
