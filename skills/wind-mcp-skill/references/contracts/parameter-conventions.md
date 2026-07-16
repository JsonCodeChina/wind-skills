# 公共参数约定

<!-- 本文件与各 server 契约统一位于 references/contracts/。 -->

所有服务共用本文件；选定 `server_type` 后再读 `tool-index.json` 指向的单个服务契约。服务文件没有明确声明的字段不得传入。

## 统一输入

- 自然语言统一使用 `question`。`financial_docs` 兼容旧 `query`，CLI 转换到后端 `query`。
- 日期范围统一优先使用 `begin_date` / `end_date`。CLI 为 Quote 转成 `begin` / `end`，为 EDB 转成 `beginDate` / `endDate`。
- 日期值推荐 `yyyyMMdd`；CLI 兼容 `yyyy-MM-dd`、`yyyy/MM/dd` 并归一成 `yyyyMMdd`。只有 Quote 允许 `LAST`。
- `lang` 对外使用 `中文` / `English`；兼容 `zh` / `zh-CN` / `CNS` 和 `en` / `en-US` / `ENS`。Analytics 后端由 CLI 转成 `CNS` / `ENS`。
- 同义字段同时出现且值不一致时返回 `PARAM_CONFLICT_ERROR`，不得静默选择。

## 标的

- 行情工具统一使用 `windcode`；不得写 `code`、`ticker`、`symbol`、`sec_code` 或 `stock_code`。
- 优先传用户给出的名称、简称或代码，不得猜测交易所后缀。
- 已确认的标准代码可直接传，例如 `600519.SH`、`0700.HK`、`AAPL.O`、`005827.OF`、`000300.SH`。
- 简称可能歧义时先问用户。NER 失败时按错误信封询问准确全称或 Wind 标准代码。
- `windcode` 类型及多标的方式以所选工具契约和后端实际支持为准，不施加全局单标的限制。

## 行情参数

- `indexes` 必须是英文逗号分隔字符串，逐字来自 `references/indicators.md`；只传用户明确请求的指标。
- K 线 `period`：`1/3/4/5/6/7/8/9/10/11/12/13/14/15`；CLI 可将 `day/D/daily/日线` 归一为 `10`，周线为 `11`，月线为 `12`。
- K 线可选：`count`、`aftime`、`issusp`、`afdate`；`aftime` 与 `issusp` 只允许 `0/1`。
- Quote 返回分钟 / 日内序列，不保证提供 `pre_close` 或 `pct_chg`。缺少这些字段时不得用开盘价推导日涨跌幅，改用对应价格指标或 K 线工具。
- 结构化数据区（`rows` 和数组型 `value`）中的后端 `INVALID` 由 CLI 转为 `null`，表示缺失或不适用，不得按 0 计算；正文、状态和元数据中的同名字面量保持原样。单位缺失时不得自行猜测或换算。
- `excelTotalCount` 不是可信的总数或分页依据；以 `cli_meta.tables[].actual_row_count` 表示实际返回行数，`cli_meta.completeness=unknown` 时必须披露完整性未知。
- Quote 的 `begin_date/end_date` 可传日期或 `LAST`。

## 自然语言参数

- `question` 必须是非空字符串，并按工具场景写成单一、明确的问题。
- `lang` 可省略，默认中文。
- 筛选和领域 NL 问句不得增加用户未给出的条件。

## 调用

从 Skill 目录执行：

```bash
node scripts/cli.mjs call <server_type> <tool_name> '<params_json>'
```
