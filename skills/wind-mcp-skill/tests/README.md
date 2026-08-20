# wind-mcp-skill 测试集

`cli.mjs` 的测试与诊断脚本。分两类:**确定性单测**(无网络、无凭据,可直接跑)和**集成/诊断**(需真实后端与凭据)。

## 确定性单测(直接 `node tests/xxx.mjs`)

| 脚本 | 作用 |
| --- | --- |
| `run-cli-contract-tests.mjs` | argv / exit / 错误码等 CLI 契约行为 |
| `run-error-tests.mjs` | 各种后端错误形状统一塌缩为 `backend_error` |
| `run-code-matrix-tests.mjs` | 业务码成功边界:`data.code` 为 `0` 或任意 `2xx` 判成功,其余判 `backend_error`(用 `mock-code.mjs` 造后端) |
| `compare-plans.mjs` | 跨方案的错误参数拦截对比 |

配套 preload(被上面脚本引用,不单独运行):`mock-fetch.mjs`、`capture-fetch.mjs`、`mock-code.mjs`。

## 集成 / 诊断(需真实后端 + 凭据,手动跑,勿入 CI)

| 脚本 | 作用 |
| --- | --- |
| `run-all-tools-tests.mjs` | 遍历 manifest 全部工具的正确+错误用例冒烟测试 |
| `redirect-fetch.mjs` | preload:把 `economic_data` 调用转发到 newtools 测试服务器 |
| `newtools-probe.mjs` | 诊断:对用 `wind.sessionid` 鉴权的 MCP 服务器 `tools/list` / `tools/call` |

凭据与地址一律走环境变量,脚本内不写死:

```bash
# 全工具冒烟(需 config.json 里的 key 或 WIND_API_KEY);带上 newtools 环境变量即可覆盖两个新 EDB 工具
WIND_NEWTOOLS_URL='<test-server-mcp-url>' \
WIND_NEWTOOLS_SESSION='<wind.sessionid>' \
NODE_TLS_REJECT_UNAUTHORIZED=0 \
  node --import tests/redirect-fetch.mjs tests/run-all-tools-tests.mjs

# 诊断某服务器的工具 schema
WIND_MCP_URL='<mcp-url>' WIND_MCP_SESSION='<wind.sessionid>' \
NODE_TLS_REJECT_UNAUTHORIZED=0 node tests/newtools-probe.mjs list
```
