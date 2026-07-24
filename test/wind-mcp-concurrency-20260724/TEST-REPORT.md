# Wind MCP 股票行情并发测试报告

## 测试目的

验证股票行情工具在并发 5、10、20、50 时的实际表现，区分：

- 本地 Node/Undici 连接建立失败；
- 请求到达 Wind 后端后触发的工具并发限制；
- CLI 最终暴露的 `NETWORK_ERROR` 与 `CONCURRENCY_LIMIT_ERROR`。

## 测试方法

- 工具：`stock_data.get_stock_price_indicators`
- 参数：单个股票代码，指标为 `中文简称,最新成交价`
- 进程模型：每个请求启动独立 Node CLI 进程
- 调试：启用 `WIND_DEBUG=1`，记录内部 fetch 重试
- 并发阶段：5、10、20、50
- 阶段间冷却：5 秒
- CLI：`skills/wind-mcp-skill/scripts/cli.mjs`

## 测试结果

| 并发 | 请求数 | 成功 | 失败 | 成功率 | 中位耗时 | P95 | 最大耗时 | Fetch 重试 | 最终错误 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 5 | 5 | 5 | 0 | 100% | 764 ms | 11,520 ms | 11,520 ms | 1 | 无 |
| 10 | 10 | 10 | 0 | 100% | 1,084 ms | 1,167 ms | 1,167 ms | 0 | 无 |
| 20 | 20 | 16 | 4 | 80% | 1,391 ms | 1,482 ms | 12,127 ms | 1 | `CONCURRENCY_LIMIT_ERROR` × 4 |
| 50 | 50 | 34 | 16 | 68% | 2,480 ms | 3,179 ms | 12,624 ms | 1 | `CONCURRENCY_LIMIT_ERROR` × 16 |

## 关键观察

### 1. 并发 10 在本轮全部成功

并发 10 的 10 个请求全部成功，没有 fetch 重试，也没有后端限流。结果支持当前 Skill 将最大正常并发设为 10。

### 2. 超过 10 后出现后端明确限流

并发 20 和 50 的所有最终失败均为：

```text
CONCURRENCY_LIMIT_ERROR
当前工具并发请求数量超限，请稍后重试
```

错误信封包含 `server_type=stock_data`，大部分还包含 `tool_name=get_stock_price_indicators` 和原始参数。这证明这些失败请求已经到达 Wind MCP 服务，并由后端并发控制拒绝，不是本地 Node 在发送前统一失败。

### 3. 确实存在偶发连接建立超时

并发 5、20、50 各出现一次：

```text
[wind-mcp fetch retry 1/3] UND_ERR_CONNECT_TIMEOUT: fetch failed
```

该错误发生在 Node/Undici 建立连接阶段，可能尚未到达业务后端。三个请求均被 CLI 内部重试恢复，最终成功，没有形成对调用方暴露的 `NETWORK_ERROR`。

其典型耗时约 11.5–12.6 秒，明显高于正常请求，是各阶段最大耗时的来源。

### 4. 本轮没有最终 `NETWORK_ERROR`

85 个请求中：

- 最终成功：65；
- 最终失败：20；
- 最终 `CONCURRENCY_LIMIT_ERROR`：20；
- 最终 `NETWORK_ERROR`：0；
- 连接超时后重试成功：3。

因此，“以前的 NetworkError 可能来自本地 Node 连接限制、请求没有到达业务后端”这一推测对少量连接错误是成立的；但超过 10 并发时的主要失败原因仍是后端明确的工具并发限制。

## 为什么并发 20/50 的成功数超过 10

并发参数表示同时启动的进程数，不代表所有请求会在后端同一毫秒进入受限的业务阶段。初始化、网络传输和快速完成会错开实际占用时段，因此：

- 并发 20 时有 16 个先后成功；
- 并发 50 时有 34 个先后成功；
- 其余在后端活跃槽位已满时被拒绝。

这不代表后端上限高于 10。

## 结论

1. 并发 5、10 可正常使用，本轮并发 10 为 100% 成功。
2. 并发超过 10 会稳定出现后端 `CONCURRENCY_LIMIT_ERROR`。
3. Node/Undici 偶发 `UND_ERR_CONNECT_TIMEOUT` 确实存在，并可能发生在请求到达业务后端之前。
4. 当前 CLI 的内部 fetch 重试能够吸收本轮全部连接建立超时。
5. 正常生产调用仍应维持最大并发 10；命中并发超限后应停止新请求、冷却并恢复串行。

## 测试产物

- `run-concurrency-test.mjs`：并发测试执行器
- `concurrency-results.json`：逐请求完整结果
- `concurrency.log`：阶段摘要
- `concurrency.err.log`：测试执行器错误日志
