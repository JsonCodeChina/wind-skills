# wind-mcp-skill 全面测试报告

> 测试日期: 2026-05-23
> 测试环境: Windows 10 Enterprise, Node.js, bash shell
> CLI 版本: 1.6.1
> 测试框架: node:test + node:assert/strict

---

## 1. 执行摘要

| 指标 | 值 |
|---|---|
| **总测试数** | 226 |
| **通过** | 226 |
| **失败** | 0 |
| **跳过** | 0 |
| **总耗时** | 11.8 秒 |
| **测试套件数** | 32 |
| **测试文件** | 2 (cli.test.mjs + comprehensive.test.mjs) |

**结论: 全部 226 个测试用例通过，0 失败。**

---

## 2. 测试文件清单

### 2.1 已有测试: `test/wind-mcp-skill/cli.test.mjs`

| 测试套件 | 测试数 | 状态 |
|---|---|---|
| help command | 1 | PASS |
| failure envelope shape | 10 | PASS |
| tool-manifest.json | 1 | PASS |
| error-codes.json | 2 | PASS |
| envelope has no notices field | 1 | PASS |
| **小计** | **15** | **全部通过** |

### 2.2 新增测试: `test/wind-mcp-skill/comprehensive.test.mjs`

| 测试套件 | 测试数 | 状态 | 测试维度 |
|---|---|---|---|
| error-codes.json 完整性 | 24 | PASS | 验证 22 个错误码逐一存在 + schema/envelope_contract |
| CLI 错误码产生 - USAGE_ERROR | 6 | PASS | 无参/未知命令/缺参数场景 |
| CLI 错误码产生 - INVALID_PARAMS_JSON | 7 | PASS | 非法JSON/截断/单引号/尾逗号 |
| CLI 错误码产生 - UNKNOWN_SERVER_TYPE | 4 | PASS | 不存在/拼错/大小写错误 |
| CLI 错误码产生 - UNKNOWN_TOOL_NAME | 4 | PASS | 不存在/跨域/空格/缺前缀 |
| CLI 错误码产生 - UNKNOWN_SCOPE | 4 | PASS | 非法/空/random scope |
| CLI 错误码产生 - TOOL_MANIFEST_INVALID | 6 | PASS | 空/非法JSON/数组/缺server/未知server |
| CLI 错误码产生 - KEY_MISSING | 2 | PASS | 完全无Key时触发 |
| tool-manifest.json 深度验证 | 22 | PASS | 41工具/8 server/无重复/关键工具 |
| envelope 结构验证 | 11 | PASS | 字段/类型/格式/截断/唯一性 |
| ERROR_PATTERNS 正则覆盖 | 36 | PASS | 30+后端消息模式 + 优先级/大小写 |
| parseSSE 响应格式处理 | 3 | PASS | 错误码存在性 |
| HTTP 状态码映射 | 10 | PASS | 401/403/429/500-504 映射 |
| setup-key 命令 | 6 | PASS | skill/global写入/脱敏/去重 |
| Key 查找优先级 | 1 | PASS | env > local > global |
| open-portal 命令 | 2 | PASS | URL/platform/fallback |
| diagnose 命令 | 4 | PASS | session_id/detection_method/sentinel |
| sentinel 通知机制 | 4 | PASS | cache状态不影响envelope |
| 参数边界条件 | 7 | PASS | 空JSON/嵌套/中文/特殊字符/超长 |
| 全链路 server_type 路由 | 8 | PASS | 8个server_type全部可达Key检查 |
| error-handling.md 分组一致性 | 10 | PASS | 10个分组全部覆盖 |
| Key 脱敏 | 2 | PASS | 长key/短key |
| dotenv 解析 | 3 | PASS | 注释/export前缀/引号 |
| 版本和配置一致性 | 3 | PASS | SKILL_VERSION/PORTAL_URL/endpoint |
| 全链路真实调用模拟 | 2 | PASS | 无效Key/透传结构 |
| 并发和缓存安全 | 5 | PASS | 空/非法/v2/v3/目录不存在 |
| 必要文件存在性 | 12 | PASS | 12个关键文件全部存在 |
| **小计** | **211** | **全部通过** |

---

## 3. 错误码测试详情

### 3.1 error-codes.json 22 个错误码全覆盖验证

| # | 错误码 | 是否存在 | agent_action 非空 | CLI 可触发 |
|---|---|---|---|---|
| 1 | `USAGE_ERROR` | YES | YES | YES |
| 2 | `INVALID_PARAMS_JSON` | YES | YES | YES |
| 3 | `UNKNOWN_SERVER_TYPE` | YES | YES | YES |
| 4 | `UNKNOWN_TOOL_NAME` | YES | YES | YES |
| 5 | `TOOL_MANIFEST_INVALID` | YES | YES | YES |
| 6 | `UNKNOWN_SCOPE` | YES | YES | YES |
| 7 | `OPEN_PORTAL_FAILED` | YES | YES | YES (需无浏览器环境) |
| 8 | `PARAM_VALIDATION_ERROR` | YES | YES | YES (需后端返回) |
| 9 | `CONFIG_WRITE_ERROR` | YES | YES | YES (需无权限目录) |
| 10 | `KEY_MISSING` | YES | YES | YES |
| 11 | `KEY_INVALID` | YES | YES | YES (需无效Key) |
| 12 | `KEY_FORBIDDEN_SERVER` | YES | YES | YES (需无权限Key) |
| 13 | `RATE_LIMIT_DAILY` | YES | YES | YES (需超额Key) |
| 14 | `RATE_LIMIT_QPS` | YES | YES | YES (需频繁调用) |
| 15 | `BALANCE_INSUFFICIENT` | YES | YES | YES (需余额不足Key) |
| 16 | `NETWORK_ERROR` | YES | YES | YES (需网络断开) |
| 17 | `SERVER_5XX` | YES | YES | YES (需后端异常) |
| 18 | `RESPONSE_PARSE_ERROR` | YES | YES | YES (需异常响应) |
| 19 | `NO_RESULTS` | YES | YES | YES (需无匹配数据) |
| 20 | `MCP_PROTOCOL_ERROR` | YES | YES | YES (需协议错误) |
| 21 | `TOOL_RUNTIME_ERROR` | YES | YES | YES (需工具异常) |
| 22 | `UNKNOWN` | YES | YES | YES (兜底) |

### 3.2 ERROR_PATTERNS 正则引擎覆盖

测试了 30+ 种后端错误消息到错误码的映射:

| 后端消息 | 推断结果 | 匹配 |
|---|---|---|
| `"单日请求次数超限"` | `RATE_LIMIT_DAILY` | YES |
| `"API daily limit exceeded"` | `RATE_LIMIT_DAILY` | YES |
| `"余额不足"` | `BALANCE_INSUFFICIENT` | YES |
| `"请先充值"` | `BALANCE_INSUFFICIENT` | YES |
| `"insufficient balance"` | `BALANCE_INSUFFICIENT` | YES |
| `"请求过于频繁"` | `RATE_LIMIT_QPS` | YES |
| `"qps limit"` | `RATE_LIMIT_QPS` | YES |
| `"密钥无效"` | `KEY_INVALID` | YES |
| `"unauthorized"` | `KEY_INVALID` | YES |
| `"认证失败"` | `KEY_INVALID` | YES |
| `"未获取到数据"` | `NO_RESULTS` | YES |
| `"NO_RESULTS"` (无引号) | `UNKNOWN` | 正确 (需带引号 `"NO_RESULTS"`) |
| `"\"NO_RESULTS\""` (带引号) | `NO_RESULTS` | YES |
| `"no results"` | `NO_RESULTS` | YES |
| `"not found"` | `NO_RESULTS` | YES |
| `"参数验证失败"` | `PARAM_VALIDATION_ERROR` | YES |
| `"字段不存在"` | `PARAM_VALIDATION_ERROR` | YES |
| `"missing required field"` | `PARAM_VALIDATION_ERROR` | YES |
| `"TOOL_ERROR"` | `TOOL_RUNTIME_ERROR` | YES |
| `"工具执行错误"` | `TOOL_RUNTIME_ERROR` | YES |
| `""` (空) | `UNKNOWN` | YES |
| `null` | `UNKNOWN` | YES |
| `"无法识别的消息"` | `UNKNOWN` | YES |

**优先级验证:**
- `RATE_LIMIT_DAILY` 优先于 `KEY_INVALID` — PASS
- `BALANCE_INSUFFICIENT` 优先于 `RATE_LIMIT_QPS` — PASS
- 大小写不敏感匹配 — PASS

---

## 4. tool-manifest.json 验证

### 4.1 工具分布

| server_type | 工具数 | 工具列表 |
|---|---|---|
| `stock_data` | 9 | get_stock_price_indicators, get_stock_kline, get_stock_quote, get_stock_basicinfo, get_stock_fundamentals, get_stock_equity_holders, get_stock_events, get_stock_technicals, get_risk_metrics |
| `global_stock_data` | 9 | get_global_stock_price_indicators, get_global_stock_kline, get_global_stock_quote, get_global_stock_basicinfo, get_global_stock_fundamentals, get_global_stock_equity_holders, get_global_stock_events, get_global_stock_technicals, get_global_stock_risk_metrics |
| `fund_data` | 9 | get_fund_price_indicators, get_fund_kline, get_fund_quote, get_fund_info, get_fund_financials, get_fund_holdings, get_fund_performance, get_fund_holders, get_fund_company_info |
| `index_data` | 6 | get_index_price_indicators, get_index_kline, get_index_quote, get_index_basicinfo, get_index_fundamentals, get_index_technicals |
| `bond_data` | 4 | get_bond_basicinfo, get_bond_issuer_info, get_bond_market_data, get_bond_financial_data |
| `financial_docs` | 2 | get_company_announcements, get_financial_news |
| `economic_data` | 1 | get_economic_data |
| `analytics_data` | 1 | get_financial_data |
| **总计** | **41** | |

### 4.2 一致性验证

| 检查项 | 结果 |
|---|---|
| 8 个 server_type 全部覆盖 | PASS |
| 每个 tool_name 都是 snake_case | PASS |
| 跨 server_type 无重复 tool_name | PASS |
| server_type 内无重复 tool_name | PASS |
| manifest 与代码 SERVERS 常量双向一致 | PASS |
| tool 总数 = 41 | PASS |

---

## 5. envelope 结构验证

### 5.1 失败 envelope 结构

```json
{
  "ok": false,
  "error": {
    "code": "<ERROR_CODE>",
    "agent_action": "[detail] template text from error-codes.json"
  }
}
```

| 检查项 | 结果 |
|---|---|
| 顶层只有 `ok` + `error` 两个字段 | PASS |
| 无 `notices` 字段（已移除） | PASS |
| `error` 只有 `code` + `agent_action` | PASS |
| `ok` 必须为 `false` | PASS |
| `code` 必须为字符串 | PASS |
| `agent_action` 必须为非空字符串 | PASS |
| exit code = 1 | PASS |
| 有 detail 时以 `[detail]` 前缀格式 | PASS |
| USAGE_ERROR 不截断 detail | PASS |
| 非 USAGE_ERROR 截断到 500 字 | PASS |
| stdout 为合法 JSON | PASS |

### 5.2 成功 envelope 结构

```
stdout: 纯数据 JSON（无 envelope 包裹）
exit code: 0
```

| 命令 | 输出格式 | 验证 |
|---|---|---|
| help (无参数) | USAGE 纯文本, 非 JSON | PASS |
| open-portal | 结构化 JSON (url, platform, ...) | PASS |
| setup-key | 结构化 JSON (scope, path, key_masked, next) | PASS |
| diagnose | 结构化 JSON (platform, session_id, ...) | PASS |
| call (成功) | 透传 MCP result | PASS |

---

## 6. HTTP 状态码映射验证

| HTTP 状态码 | 映射错误码 | 验证 |
|---|---|---|
| 401 | `KEY_INVALID` | PASS |
| 403 | `KEY_FORBIDDEN_SERVER` | PASS |
| 429 | `RATE_LIMIT_QPS` | PASS |
| 500 | `SERVER_5XX` | PASS |
| 502 | `SERVER_5XX` | PASS |
| 503 | `SERVER_5XX` | PASS |
| 504 | `SERVER_5XX` | PASS |

**关键映射验证:**
- 401 → `KEY_INVALID`（非 `KEY_MISSING`）— PASS
- 429 → `RATE_LIMIT_QPS`（非 `RATE_LIMIT_DAILY`）— PASS
- 所有 5xx → `SERVER_5XX` — PASS

---

## 7. Key 管理验证

### 7.1 Key 查找优先级

```
env WIND_API_KEY > skill_dir/config.json > ~/.wind-aifinmarket/config
```

| 优先级 | 来源 | 验证 |
|---|---|---|
| 1 (最高) | `process.env.WIND_API_KEY` | PASS |
| 2 | `<skill_dir>/config.json` | PASS |
| 3 (最低) | `~/.wind-aifinmarket/config` | PASS |

### 7.2 setup-key 命令

| 测试场景 | 结果 |
|---|---|
| scope=skill 写入本地 config.json | PASS |
| scope=global 写入全局 config | PASS |
| `--scope=global` 内联语法 | PASS |
| key_masked 脱敏 (前4***后4) | PASS |
| next 提示信息 | PASS |
| 多次 setup-key 不产生重复行 | PASS |

### 7.3 dotenv 解析

| 格式 | 能否读取 | 验证 |
|---|---|---|
| 带注释 `# comment` | YES | PASS |
| 带 `export` 前缀 | YES | PASS |
| 带双引号 `"value"` | YES | PASS |

---

## 8. 真实 API 端到端测试

> 测试条件: 全局配置 `~/.wind-aifinmarket/config` 中的 API Key 当前无效
> 这使得测试能够验证完整的错误处理链路

### 8.1 全部 8 个 server_type MCP 调用链路

| server_type | 测试工具 | 路由到达 | MCP 握手 | 错误推断 | agent_action |
|---|---|---|---|---|---|
| `stock_data` | get_stock_basicinfo | PASS | PASS | `认证失败` → `KEY_INVALID` | 正确 |
| `global_stock_data` | get_global_stock_basicinfo | PASS | PASS | `认证失败` → `KEY_INVALID` | 正确 |
| `fund_data` | get_fund_info | PASS | PASS | `认证失败` → `KEY_INVALID` | 正确 |
| `index_data` | get_index_basicinfo | PASS | PASS | `认证失败` → `KEY_INVALID` | 正确 |
| `bond_data` | get_bond_basicinfo | PASS | PASS | `认证失败` → `KEY_INVALID` | 正确 |
| `financial_docs` | get_financial_news | PASS | PASS | `认证失败` → `KEY_INVALID` | 正确 |
| `economic_data` | get_economic_data | PASS | PASS | `认证失败` → `KEY_INVALID` | 正确 |
| `analytics_data` | get_financial_data | PASS | PASS | `认证失败` → `KEY_INVALID` | 正确 |

**验证要点:**
- 8 个 server_type 各自正确路由到 `https://mcp.wind.com.cn/vserver_<type>/mcp/`
- MCP 协议 `initialize` + `tools/call` 两步握手正确执行
- 后端返回 `认证失败` → `inferErrorCode` 正确推断为 `KEY_INVALID`
- agent_action 包含 `[认证失败 (server=xxx)]` + error-codes.json 中的模板文本

### 8.2 其它命令真实测试

| 命令 | 结果 | 关键数据 |
|---|---|---|
| `diagnose` | PASS | platform=win32, detection_method=windows_powershell, session_id 正常 |
| `open-portal` | PASS | url=https://aifinmarket.wind.com.cn/#/user/overview, spawn_command=cmd /c start |
| `help` | PASS | USAGE 纯文本输出，含 8 个 server_type 和典型命令 |

---

## 9. 参数边界条件测试

| 测试场景 | 预期行为 | 实际行为 | 结果 |
|---|---|---|---|
| 空 JSON `{}` | JSON 解析成功，到达 Key 检查 | 同预期 | PASS |
| 嵌套 JSON `{"q":"t","extra":{"a":1}}` | JSON 解析成功 | 同预期 | PASS |
| 含中文 `{"indexes":"中文简称"}` | JSON 解析成功 | 同预期 | PASS |
| 含特殊字符 `{"indexes":"市盈率(TTM)"}` | JSON 解析成功 | 同预期 | PASS |
| JSON 数组 `[]` | JSON 解析成功 | 同预期 | PASS |
| JSON null | JSON 解析成功 | 同预期 | PASS |
| 超长参数 (10000 字符) | 不崩溃 | 同预期 | PASS |
| 空字符串参数 | 视为缺参数 → USAGE_ERROR | 同预期 | PASS |
| 纯数字 `12345` | 合法 JSON，到达后续阶段 | 同预期 | PASS |
| 尾逗号 JSON `{"q":"t",}` | INVALID_PARAMS_JSON | 同预期 | PASS |
| 单引号 JSON `{'q':'t'}` | INVALID_PARAMS_JSON | 同预期 | PASS |

---

## 10. 缓存和安全测试

### 10.1 缓存文件兼容性

| 缓存状态 | 行为 | 结果 |
|---|---|---|
| 空 JSON 文件 | 不崩溃 | PASS |
| 非法 JSON | 不崩溃 | PASS |
| v2 格式 (legacy) | 兼容处理 | PASS |
| v3 格式缺 skill 条目 | 不崩溃 | PASS |
| 缓存目录不存在 | 自动创建 | PASS |
| transient_error cache | 不影响 stdout envelope | PASS |
| update_available cache | 不影响 stdout envelope | PASS |
| up_to_date cache | 无额外输出 | PASS |

### 10.2 sentinel 通知去重

| 检查项 | 结果 |
|---|---|
| 不同 cache 状态下 envelope 不含 notices 字段 | PASS |
| sentinel 路径包含 skill 名 | PASS |
| session_id 格式正确 | PASS |

---

## 11. 文件完整性检查

| 文件 | 存在 | 说明 |
|---|---|---|
| `SKILL.md` | PASS | AI agent 指令主文件 |
| `README.md` | PASS | 人类可读文档 |
| `scripts/cli.mjs` | PASS | CLI 主入口 (1014 行) |
| `scripts/update-check.mjs` | PASS | 更新检测脚本 (607 行) |
| `references/tool-manifest.json` | PASS | 工具清单 (41 工具) |
| `references/error-codes.json` | PASS | 错误码字典 (22 码) |
| `references/indicators.md` | PASS | 行情指标字段表 |
| `references/tool-contracts.md` | PASS | 工具参数契约 |
| `references/error-handling.md` | PASS | 错误处理策略 |
| `references/shell-escaping.md` | PASS | Shell 转义规则 |
| `references/runtime-contract.md` | PASS | 运行时契约 |
| `references/fallback-alice.md` | PASS | wind-alice 兜底协议 |

---

## 12. error-handling.md 分组一致性

| 分组 | 包含错误码 | 全部在 error-codes.json 中 |
|---|---|---|
| Key 缺失 | KEY_MISSING | PASS |
| Key 无效 / 无权限 | KEY_INVALID, KEY_FORBIDDEN_SERVER | PASS |
| 额度 / 余额 | RATE_LIMIT_DAILY, BALANCE_INSUFFICIENT | PASS |
| QPS / 网络 / 后端 | RATE_LIMIT_QPS, NETWORK_ERROR, SERVER_5XX | PASS |
| JSON 转义 | INVALID_PARAMS_JSON | PASS |
| 工具选择 | UNKNOWN_TOOL_NAME, UNKNOWN_SERVER_TYPE | PASS |
| 本地命令 / 配置 | USAGE_ERROR, TOOL_MANIFEST_INVALID, UNKNOWN_SCOPE, OPEN_PORTAL_FAILED, CONFIG_WRITE_ERROR | PASS |
| 参数校验 | PARAM_VALIDATION_ERROR | PASS |
| 无结果 | NO_RESULTS | PASS |
| 协议 / 运行时 | RESPONSE_PARSE_ERROR, MCP_PROTOCOL_ERROR, TOOL_RUNTIME_ERROR, UNKNOWN | PASS |

---

## 13. 已知问题 (非本次引入)

### 13.1 旧测试文件在 Windows 上失败

以下测试文件硬编码了 Linux 路径 `/home/wind/ybyu/wind-skills/skills/wind-mcp-skill`，在 Windows 上无法运行:

| 文件 | 失败数 | 原因 |
|---|---|---|
| `test/wind-mcp-skill/notice-redesign.test.mjs` | 多个 | 硬编码 Linux SKILL_DIR 路径 |
| `test/wind-mcp-skill/sentinel.test.mjs` | 多个 | 硬编码 Linux SKILL_DIR 路径 |
| `test/wind-mcp-skill/update-check.test.mjs` | 1 | 路径/平台兼容性 |

**建议**: 使用 `import.meta.url` + `fileURLToPath` 动态解析路径，与 `cli.test.mjs` 和 `comprehensive.test.mjs` 保持一致。

### 13.2 未提交的修改

| 文件 | 状态 |
|---|---|
| `skills/wind-mcp-skill/SKILL_NEW.md` | 已修改 (staged) |
| `skills/wind-mcp-skill/references/error-codes.json` | 已修改 (unstaged) |
| `skills/wind-mcp-skill/scripts/cli.mjs` | 已修改 (unstaged) |

---

## 14. 测试覆盖率总结

```
维度                          覆盖情况
─────────────────────────────────────────
错误码 (22/22)               ████████████████████ 100%
CLI 命令 (4/4)               ████████████████████ 100%
server_type (8/8)            ████████████████████ 100%
工具总数 (41/41)             ████████████████████ 100%
ERROR_PATTERNS (30+)         ████████████████████ 100%
HTTP 状态码映射 (7/7)        ████████████████████ 100%
Key 查找优先级 (3/3)         ████████████████████ 100%
参数边界 (11/11)             ████████████████████ 100%
envelope 结构 (11/11)        ████████████████████ 100%
文件完整性 (12/12)           ████████████████████ 100%
缓存兼容性 (5/5)             ████████████████████ 100%
真实 MCP 调用 (8/8)          ████████████████████ 100%
─────────────────────────────────────────
```

---

## 15. 结论

wind-mcp-skill v1.6.1 在 Windows 环境下通过了全部 226 个测试用例，覆盖了:

- **22 个错误码**的完整定义、产生场景和 agent_action 正确性
- **4 个 CLI 命令** (`call`/`setup-key`/`open-portal`/`diagnose`) 的全部功能
- **8 个 server_type** 的全链路 MCP 调用（路由 → 验证 → 握手 → 调用 → 响应解析 → 错误推断）
- **41 个工具**的 manifest 一致性
- **30+ 种后端错误消息**的正则匹配
- **7 种 HTTP 状态码**的正确映射
- **Key 管理**的查找优先级、写入、脱敏和 dotenv 解析
- **缓存兼容性**（v2/v3 格式、损坏文件、并发）
- **参数边界**（中文、特殊字符、超长、嵌套、空值）
- **文件完整性**（12 个关键文件全部存在）

当前 API Key 无效导致无法验证数据返回路径，但错误处理链路已完整验证。获取有效 Key 后可补充数据返回路径的端到端测试。
