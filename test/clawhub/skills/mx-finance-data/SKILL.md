---
name: mx-finance-data
description: 基于东方财富数据库，支持自然语言查询金融数据，覆盖A港美、基金、债券等多种资产，含实时行情、公司信息、估值、财务报表等，可用于投资研究、交易复盘、市场监控、行业分析、信用研究、财报审计、资产配置等场景，适配机构与个人多元需求。返回结果包含 xlsx 与 Markdown 文件。Natural language query for financial data across all markets, including A-shares, ETFs, bonds, Hong Kong and US stocks, and funds. It provides L1/L2 data, financial indicators, company profiles and valuation metrics. Ideal for investment research, strategy backtesting, market monitoring and industry analysis. It meets the needs of diverse institutions and individuals.
metadata:
  {
    "openclaw": {
      "requires": {
        "env":["EM_API_KEY"]
      },
      "install": [
        {
          "id": "pip-deps",
          "kind": "python",
          "package": "httpx pandas openpyxl",
          "label": "Install Python dependencies"
        }
      ]
    }
  }
---

# 金融数据查询

## 密钥来源与安全说明

- 本技能仅使用一个环境变量：`EM_API_KEY`。
- `EM_API_KEY` 由东方财富妙想服务（`https://ai.eastmoney.com/mxClaw`）签发，用于其接口鉴权。
- 在提供密钥前，请先确认密钥来源、可用范围、有效期及是否支持重置/撤销。
- 禁止在代码、提示词、日志或输出文件中硬编码/明文暴露密钥。

## 功能范围

### 1. 支持查询的对象范围

* 股票（A 股、港股、美股）
* 板块、指数、股东
* 企业发行人、债券、非上市公司
* 股票市场、基金市场、债券市场

### 2. 支持查询的数据类型

支持查询以下类型的结构化数据：

* **实时行情**（现价、涨跌幅、盘口数据等）
* **量化数据**（技术指标、资金流向等）
* **报表数据**（营收、净利润、财务比率等）

### 3. 查询方式与处理逻辑

统一使用 `--query` 传入自然语言问句（包含实体与指标），并使用 `--indicators` 传入从问句中提取的金融指标等关键信息。Skill 会先对 query 做实体识别，再按识别结果选择查数路径：

* **识别实体数 ≤ 5**：直接查数
* **识别实体数 > 5**：批量查数，最多处理识别结果中的前 **500** 个有效实体，如需大于500个实体，可分批多次调用

注意：当用户问句中只包含代词，需结合上下文或者提供文件读取所有实体名称，一并输入query。

#### `--indicators` 参数说明

调用本 Skill 前，需根据 `--query` 从用户问句中提取需要查询的**金融指标**（或指标组），填入 `--indicators`：

* 只填指标和时间范围等除实体外所有有效信息，不含实体名称等修饰语。
* 多个指标用用户原话拼接，如 `市盈率(动)和总市值`、`涨跌幅`、`营收、毛利、净利`。
* **不要在 `--indicators` 里重复写实体**。
* **尽量用用户原话表述，不要二次改写**。

> **示例**  
> 用户问「查询贵州茅台、五粮液近一年营收」  
> → `--query "查询贵州茅台、五粮液近一年营收" --indicators "近一年营收"`  

> 用户问「这批股票的涨跌幅是多少」或列出 6 只以上股票  
> → `--query "查询 A、B、C、D、E、F 六只股票的涨跌幅、pe、市值" --indicators "涨跌幅、pe、市值"`  

### 4. 输出结果

Skill 执行后会输出两个文件：

- **Excel（.xlsx）**：多 sheet 结构化数据表，每个实体/指标组合对应一个 sheet
- **Markdown（.md）**：与 Excel 内容一致的 Markdown 表格，按 sheet 分二级标题

------

## 前提条件

### 1. 注册东方财富妙想账号

访问 https://ai.eastmoney.com/mxClaw 注册账号并获取API_KEY。

### 2. 配置 Token

```bash
# macOS 添加到 ~/.zshrc，Linux 添加到 ~/.bashrc
export EM_API_KEY="your_api_key_here"
```

然后根据系统执行对应的命令：

**macOS：**
```bash
source ~/.zshrc
```

**Linux：**
```bash
source ~/.bashrc
```

### 3. 安装依赖


```bash
pip3 install httpx pandas openpyxl --user
```

## 快速开始

在工作目录下执行：

```bash
python3 {baseDir}/scripts/get_data.py --query "贵州茅台近期走势如何" --indicators "近期走势"
```

多实体示例：

```bash
python3 {baseDir}/scripts/get_data.py --query "查询贵州茅台、五粮液、宁德时代、比亚迪、隆基绿能、中芯国际的市盈率(动)" --indicators "市盈率(动)"
```

参数说明：

| 参数 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `--query` | 是 | - | 自然语言查询问句，需包含所有查询实体名称|
| `--indicators` | 是 | - | 从 query 中提取的金融指标、时间范围等关键信息|

------

### 输出示例

**直接查数：**

```
识别实体数: 1
查数模式: 直接查数
返回实体数: 1
文件: /path/to/miaoxiang/mx_finance_data/mx_finance_data_9535fe18.xlsx
Markdown: /path/to/miaoxiang/mx_finance_data/mx_finance_data_9535fe18.md
表格行数: 42
```

**多实体查数：**

```
识别实体数: 128
查数模式: 多实体
返回实体数: 128
文件: /path/to/miaoxiang/mx_finance_data/mx_finance_data_a1b2c3d4.xlsx
Markdown: /path/to/miaoxiang/mx_finance_data/mx_finance_data_a1b2c3d4.md
表格行数: 150
```

### 输出文件说明

| 文件 | 说明 |
| --- | --- |
| `mx_finance_data_<查询id>.xlsx` | 结构化数据表，包含请求的实体与指标 |
| `mx_finance_data_<查询id>.md` | 与 Excel 内容一致的 Markdown 表格 |


## 常见问题

**错误：请设置 EM_API_KEY 环境变量**

- 请访问 https://ai.eastmoney.com/mxClaw 获取`API_KEY`。
- 配置`EM_API_KEY`环境变量

**多实体查数报错：缺少 --indicators**

- 识别实体数 > 5 时必须提供 `--indicators`，否则无法构造有效的查数问句。

**当前一次请求的数据量过大，部分数据可能会有缺失，请减少指标数量和查询日期范围**

- 可分批多次（分不同指标或者日期）调用该技能，一次性请求压力过大。

**多实体查数最多处理识别结果中前 500 个有效实体**

- 可分批多次（每次500个实体数量以内）调用该技能

