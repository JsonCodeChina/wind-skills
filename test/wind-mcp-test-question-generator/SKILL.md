---
name: wind-mcp-test-question-generator
description: Generate randomized Chinese natural-language test questions and expected routing metadata from the tool contracts and parameters in skills/wind-mcp-skill. Use when testing Wind MCP skill routing, parameter extraction, tool coverage, regression behavior, or when users request 100 or another number of randomized Wind financial-data questions.
---

# Wind MCP 测试问题生成器

依据 `skills/wind-mcp-skill` 当前契约生成测试问题，不调用 Wind 后端。

## 工作流

1. 确认目标契约目录。默认使用仓库中的 `skills/wind-mcp-skill`。
2. 以运行日期创建归档目录 `reports/YYYY-MM-DD/`。所有题集、结果、报告和日志必须写入该日期目录，不得散落在 skill 根目录。
3. 运行生成脚本。默认生成 100 题，并覆盖契约清单中的全部工具：

```bash
node scripts/generate-questions.mjs --skill ../../skills/wind-mcp-skill --count 100 --output reports/YYYY-MM-DD/questions.json
```

4. 需要复现实验时传入 `--seed`；需要纯问题清单时使用 `--format md` 或 `--format txt`：

```bash
node scripts/generate-questions.mjs --skill ../../skills/wind-mcp-skill --count 100 --seed regression-01 --format md --output reports/YYYY-MM-DD/questions.md
```

5. 检查脚本摘要中的题目数、唯一题目数、工具覆盖数和缺失工具。缺失工具不为零时，不得声称全工具覆盖。
6. 将 JSON 中的 `question` 交给 `wind-mcp-skill` 测试；使用 `expected.server_type`、`expected.tool_name` 和 `expected.params` 校验路由与核心参数。

## 生成规则

- 默认先为每个工具生成至少一题，再随机补足数量。
- 随机变化标的、市场、日期、K 线周期、复权方式、指标组合、Top K、EDB 执行模式和措辞。
- 只生成契约支持范围内的正常用例；不要把错误参数测试混入默认题集。
- 日期必须为 `yyyy-MM-dd`，自然语言参数使用非空 `question`。
- `--count` 小于工具数时只能生成部分覆盖，脚本摘要必须如实报告。
- 契约工具清单变化后，脚本会因构建器缺失而失败；先按新参数补充构建器再生成，禁止静默跳过。

## 输出

JSON 是默认格式，包含 seed、生成时间、契约来源、覆盖摘要以及测试用例。每条用例包括：

- `id`
- `question`
- `expected.server_type`
- `expected.tool_name`
- `expected.params`
- `variation_tags`

除非用户另有要求，将产物写到 `reports/YYYY-MM-DD/`；同一天的多轮测试使用清晰后缀区分，避免覆盖。不得改写 `wind-mcp-skill` 自身文件。
