# Wind MCP 反馈证据包(2026-07-09)

给 wind-mcp-skill / Wind MCP 服务维护方。**从 `wind-mcp-improvement-proposal.md` 读起**,
每个问题下方的"证据"条目都能在本包内直接核对,无需访问我们的环境。

## 目录结构与对照方法

```
wind-mcp-improvement-proposal.md   ← 意见书正文(8 章 + 3 附录,每问题带证据与解决方案)
evidence/
  logs/                            ← 8 次真实运行的完整日志(22 个文件)
                                      意见书引用格式 "logs/run_X.log:行号" → 对应本目录同名文件
                                      TOOL 行 = 请求全参数;RESULT 行 = 服务原始返回
  data/                            ← 被点名的原始返回体落盘件
                                      命名 = <运行时间戳>_<原文件名>.json
                                      (意见书里的 runs/<时间戳>/.agent/data/wind_X.json 即此)
  reports/                         ← 两份受数据缺陷影响的最终交付报告
                                      20260709-005304_report.md(市值三值,附录A"市值双口径")
                                      20260709-044238_report.md(美股涨跌幅错算,1.3 节)
  specs-snapshot/                  ← 贵方规格文件在我们审计时刻的副本(锁定版本对照用):
                                      tool-contracts.md / normalization-rules.json /
                                      tool-validation-rules.json / error-codes.json
```

## 快速复现三个 P0(不用读全文也能 5 分钟核对)

1. **excelTotalCount 计数不可信**:打开 `evidence/data/20260709-044238_wind_010.json`,
   `excelTotalCount=62` 但 rows 恰为 31 行(申万一级全集 31 个行业,数据是全的,计数是 2 倍);
   再看 `20260709-031421_wind_007.json`:`138` vs 69 行。
2. **整列 INVALID**:`20260709-044238_wind_006.json` 的 `AVGPRICE` 列 242/242 全是字符串
   `"INVALID"`;`20260709-044238_wind_002.json` 的 `TURNOVER` 列 390/391 无效。
3. **quote 缺前收盘 → 错误涨跌幅进报告**:`20260709-044238_wind_006.json`(上证 quote)
   首末行自算 +1.70%,`20260709-044238_wind_011.json`(price_indicators)= 1.65%;
   错误数字已进 `evidence/reports/20260709-044238_report.md` 美股表(-0.06% 系开收差)。

## 说明

- 调用方(我们)自身的问题已在意见书第 8.2 节自我申报并已修复,不计入对贵方的要求;
- 初稿被我方评审推翻的 6 条断言在附录 B 公开留痕;
- 附录 C 是留给贵方确认的未决问题,盼复。
