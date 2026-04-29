# wind-mcp-skill

> 访问万得 Wind 金融数据

覆盖 A 股 / 港股股票（行情与财务）、ETF 与公募基金（行情与全维数据）、上市公司公告与新闻、宏观经济与行业指标。

---

## 安装

```bash
# GitHub
npx skills add JsonCodeChina/wind-skills --skill wind-mcp-skill -g -y

# Gitee 镜像（国内）
npx skills add https://gitee.com/jsonCodeChina/wind-skills.git --skill wind-mcp-skill -g -y
```

需要 `WIND_API_KEY`（登录 https://aimarket.wind.com.cn 开发者中心获取）。

---

## 命令

```bash
# 看可用工具（任选一个 server_type）
node scripts/cli.mjs list-tools fund_data
node scripts/cli.mjs list-tools financial_docs
node scripts/cli.mjs list-tools stock_data
node scripts/cli.mjs list-tools economic_data
node scripts/cli.mjs list-tools analytics_data

# 调用工具
node scripts/cli.mjs call <server_type> <tool_name> '<params_json>'

# 没 Key 时打开开发者中心（先问用户再跑）
node scripts/cli.mjs open-portal
```

> ⚠️ 所有命令在**本文件（SKILL.md）所在目录下执行**。

---

## 覆盖范围

| 数据域 | 内容 |
|---|---|
| **股票** | A 股 / 港股 — 实时行情、K 线、分钟级、财务基本面、股本、公司事件、技术指标、风险 |
| **基金** | ETF / LOF / 公募 — 行情、K 线、分钟级、档案、财务、持仓、业绩、持有人、管理公司 |
| **公司公告** | 业绩公告、监管文件、招股书、致股东信、年报（按问题语义检索） |
| **财经新闻** | 实时财经新闻（按问题语义检索） |
| **宏观经济** | EDB 宏观与行业经济指标（GDP / CPI / M2 / 行业产销量 等） |
| **通用兜底** | 自然语言 → Wind 数据（覆盖前述类别之外的杂项查询） |

---

## API Key 三级兜底

1. `export WIND_API_KEY=ak_xxx`
2. `echo '{"wind_api_key":"ak_xxx"}' > config.json`（SKILL.md 同目录）
3. `mkdir -p ~/.wind-aimarket && echo "WIND_API_KEY=ak_xxx" > ~/.wind-aimarket/config`（全局，所有 wind skill 共享）

推荐方式 3。

---

## 升级

```bash
npx skills update -g -y
```
