# Wind MCP 500 条问句真实后端测试报告

- 测试时间：2026-07-16T08:21:28.134Z 至 2026-07-16T08:33:01.045Z
- 基线问句：100 条
- 表达变体：5 种
- 实际问句：500 条
- 执行方式：串行，并发数 1
- 参数传递：`@file`
- 后端调用尝试：516 次
- 成功：426
- 失败：74
- 原始通过率：85.20%
- 当日额度失败：71
- 排除额度后的有效样本：429
- 有效成功：426
- 有效失败：3
- 有效通过率：99.30%
- 首次额度错误：ID 430

## 表达变体结果

| 变体 | 成功/总数 | 额度失败 | 有效成功率 |
| --- | ---: | ---: | ---: |
| `original` | 85/100 | 14 | 85/86 (98.8%) |
| `please_query` | 85/100 | 14 | 85/86 (98.8%) |
| `want_to_know` | 86/100 | 14 | 86/86 (100.0%) |
| `wind_data` | 86/100 | 14 | 86/86 (100.0%) |
| `accurate_result` | 84/100 | 15 | 84/85 (98.8%) |

## 路由结果

| 路由 | 成功/总数 | 额度失败 | 有效成功率 |
| --- | ---: | ---: | ---: |
| `economic_data.natural_language_get_edb_data` | 0/15 | 15 | 无有效样本 |
| `fund_data.get_fund_price_indicators` | 50/50 | 0 | 50/50 (100.0%) |
| `index_data.get_index_kline` | 5/15 | 10 | 5/5 (100.0%) |
| `index_data.get_index_price_indicators` | 70/70 | 0 | 70/70 (100.0%) |
| `stock_data.get_risk_metrics` | 0/5 | 5 | 无有效样本 |
| `stock_data.get_stock_equity_holders` | 0/5 | 5 | 无有效样本 |
| `stock_data.get_stock_fundamentals` | 0/20 | 20 | 无有效样本 |
| `stock_data.get_stock_kline` | 29/40 | 11 | 29/29 (100.0%) |
| `stock_data.get_stock_price_indicators` | 272/275 | 0 | 272/275 (98.9%) |
| `stock_data.get_stock_technicals` | 0/5 | 5 | 无有效样本 |

## 错误码分布

| 错误码 | 数量 |
| --- | ---: |
| `DAILY_LIMIT_ERROR` | 71 |
| `MARKET_TARGET_NOT_FOUND` | 3 |

## 失败明细

最多展示前 100 条；全部结果见 `raw-results.json`。

| ID | 基线 | 变体 | 路由 | 错误码 | 摘要 |
| ---: | ---: | --- | --- | --- | --- |
| 246 | 50 | `original` | `stock_data.get_stock_price_indicators` | `MARKET_TARGET_NOT_FOUND` | {"data": null, "error": {"code": "MARKET_TARGET_NOT_FOUND", "message": "未识别到有效的金融标的:NVDA"}} (server=stock_data) |
| 247 | 50 | `please_query` | `stock_data.get_stock_price_indicators` | `MARKET_TARGET_NOT_FOUND` | {"data": null, "error": {"code": "MARKET_TARGET_NOT_FOUND", "message": "未识别到有效的金融标的:NVDA"}} (server=stock_data) |
| 250 | 50 | `accurate_result` | `stock_data.get_stock_price_indicators` | `MARKET_TARGET_NOT_FOUND` | {"data": null, "error": {"code": "MARKET_TARGET_NOT_FOUND", "message": "未识别到有效的金融标的:NVDA"}} (server=stock_data) |
| 430 | 86 | `accurate_result` | `stock_data.get_stock_kline` | `DAILY_LIMIT_ERROR` |  |
| 431 | 87 | `original` | `index_data.get_index_kline` | `DAILY_LIMIT_ERROR` |  |
| 432 | 87 | `please_query` | `index_data.get_index_kline` | `DAILY_LIMIT_ERROR` |  |
| 433 | 87 | `want_to_know` | `index_data.get_index_kline` | `DAILY_LIMIT_ERROR` |  |
| 434 | 87 | `wind_data` | `index_data.get_index_kline` | `DAILY_LIMIT_ERROR` |  |
| 435 | 87 | `accurate_result` | `index_data.get_index_kline` | `DAILY_LIMIT_ERROR` |  |
| 436 | 88 | `original` | `index_data.get_index_kline` | `DAILY_LIMIT_ERROR` |  |
| 437 | 88 | `please_query` | `index_data.get_index_kline` | `DAILY_LIMIT_ERROR` |  |
| 438 | 88 | `want_to_know` | `index_data.get_index_kline` | `DAILY_LIMIT_ERROR` |  |
| 439 | 88 | `wind_data` | `index_data.get_index_kline` | `DAILY_LIMIT_ERROR` |  |
| 440 | 88 | `accurate_result` | `index_data.get_index_kline` | `DAILY_LIMIT_ERROR` |  |
| 441 | 89 | `original` | `stock_data.get_stock_kline` | `DAILY_LIMIT_ERROR` |  |
| 442 | 89 | `please_query` | `stock_data.get_stock_kline` | `DAILY_LIMIT_ERROR` |  |
| 443 | 89 | `want_to_know` | `stock_data.get_stock_kline` | `DAILY_LIMIT_ERROR` |  |
| 444 | 89 | `wind_data` | `stock_data.get_stock_kline` | `DAILY_LIMIT_ERROR` |  |
| 445 | 89 | `accurate_result` | `stock_data.get_stock_kline` | `DAILY_LIMIT_ERROR` |  |
| 446 | 90 | `original` | `stock_data.get_stock_kline` | `DAILY_LIMIT_ERROR` |  |
| 447 | 90 | `please_query` | `stock_data.get_stock_kline` | `DAILY_LIMIT_ERROR` |  |
| 448 | 90 | `want_to_know` | `stock_data.get_stock_kline` | `DAILY_LIMIT_ERROR` |  |
| 449 | 90 | `wind_data` | `stock_data.get_stock_kline` | `DAILY_LIMIT_ERROR` |  |
| 450 | 90 | `accurate_result` | `stock_data.get_stock_kline` | `DAILY_LIMIT_ERROR` |  |
| 451 | 91 | `original` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 452 | 91 | `please_query` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 453 | 91 | `want_to_know` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 454 | 91 | `wind_data` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 455 | 91 | `accurate_result` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 456 | 92 | `original` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 457 | 92 | `please_query` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 458 | 92 | `want_to_know` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 459 | 92 | `wind_data` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 460 | 92 | `accurate_result` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 461 | 93 | `original` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 462 | 93 | `please_query` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 463 | 93 | `want_to_know` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 464 | 93 | `wind_data` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 465 | 93 | `accurate_result` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 466 | 94 | `original` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 467 | 94 | `please_query` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 468 | 94 | `want_to_know` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 469 | 94 | `wind_data` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 470 | 94 | `accurate_result` | `stock_data.get_stock_fundamentals` | `DAILY_LIMIT_ERROR` |  |
| 471 | 95 | `original` | `stock_data.get_stock_technicals` | `DAILY_LIMIT_ERROR` |  |
| 472 | 95 | `please_query` | `stock_data.get_stock_technicals` | `DAILY_LIMIT_ERROR` |  |
| 473 | 95 | `want_to_know` | `stock_data.get_stock_technicals` | `DAILY_LIMIT_ERROR` |  |
| 474 | 95 | `wind_data` | `stock_data.get_stock_technicals` | `DAILY_LIMIT_ERROR` |  |
| 475 | 95 | `accurate_result` | `stock_data.get_stock_technicals` | `DAILY_LIMIT_ERROR` |  |
| 476 | 96 | `original` | `stock_data.get_risk_metrics` | `DAILY_LIMIT_ERROR` |  |
| 477 | 96 | `please_query` | `stock_data.get_risk_metrics` | `DAILY_LIMIT_ERROR` |  |
| 478 | 96 | `want_to_know` | `stock_data.get_risk_metrics` | `DAILY_LIMIT_ERROR` |  |
| 479 | 96 | `wind_data` | `stock_data.get_risk_metrics` | `DAILY_LIMIT_ERROR` |  |
| 480 | 96 | `accurate_result` | `stock_data.get_risk_metrics` | `DAILY_LIMIT_ERROR` |  |
| 481 | 97 | `original` | `stock_data.get_stock_equity_holders` | `DAILY_LIMIT_ERROR` |  |
| 482 | 97 | `please_query` | `stock_data.get_stock_equity_holders` | `DAILY_LIMIT_ERROR` |  |
| 483 | 97 | `want_to_know` | `stock_data.get_stock_equity_holders` | `DAILY_LIMIT_ERROR` |  |
| 484 | 97 | `wind_data` | `stock_data.get_stock_equity_holders` | `DAILY_LIMIT_ERROR` |  |
| 485 | 97 | `accurate_result` | `stock_data.get_stock_equity_holders` | `DAILY_LIMIT_ERROR` |  |
| 486 | 98 | `original` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 487 | 98 | `please_query` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 488 | 98 | `want_to_know` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 489 | 98 | `wind_data` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 490 | 98 | `accurate_result` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 491 | 99 | `original` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 492 | 99 | `please_query` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 493 | 99 | `want_to_know` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 494 | 99 | `wind_data` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 495 | 99 | `accurate_result` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 496 | 100 | `original` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 497 | 100 | `please_query` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 498 | 100 | `want_to_know` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 499 | 100 | `wind_data` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |
| 500 | 100 | `accurate_result` | `economic_data.natural_language_get_edb_data` | `DAILY_LIMIT_ERROR` |  |

## 测试说明

- 500 条问句由历史 100 问基线生成 5 种措辞，完整清单见 `cases.json`。
- 历史 K 线日期在执行前转换为 ISO 8601 `yyyy-MM-dd`。
- 历史 `economic_data.get_economic_data` 路由迁移到当前 `natural_language_get_edb_data`。
- 每次调用通过 UTF-8 JSON 参数文件和 `@file` 传参。
- 网络、临时不可用、限流和并发错误仅在错误信封允许时原样重试一次。
- `DAILY_LIMIT_ERROR` 表示测试账户当日额度耗尽，不计入功能有效样本；额度触发后的路由通过率不能用于判断工具质量。
- 非额度失败共 3 条，均为 `NVDA` 裸代码触发的 `MARKET_TARGET_NOT_FOUND`；同一基线的另外 2 次调用成功，体现后端 NER 存在波动。
