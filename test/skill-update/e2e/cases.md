# e2e 用例档案 — 每例步骤 + 期望输出

`run-e2e.sh` 对每个 `source×scope` 组合按序跑 E1..E7。下表是每例的目的、步骤、**期望输出**，供人对照、供 agent 判对错。所有数据均来自 2026-05-24 真实实测（GitHub×global 已逐条验证通过）。

| 用例 | 目的 | 步骤 | 期望输出 / 通过条件 |
|---|---|---|---|
| **E1** 真实下载 | 真客户安装能落地 | `npx skills add <repo> --skill wind-mcp-skill [-g] -y` | exit 0；lock 文件存在；global→`.agents/.skill-lock.json`(v3)，project→`skills-lock.json`(v1)；`cli.mjs` 到位 |
| **E2a** 首跑静默 | 首次用不打扰 | 首次 `cli call` | **stderr 空**（cache 空→不 pending→无 notice） |
| **E2b** 基线写入 | 首探活只写基线不通知 | 同步跑 `update-check.mjs` | cache 出现 entry，`latestSha == lastNotifiedSha`（相等→不 pending） |
| **E3** 探活真实 | 真去远端拉，不是回显 lock | 注入假 `latestSha=deadbeef…`+清 etag+置 stale，再探活 | `latestSha` 被远端**真值覆盖**（≠ deadbeef）；GitHub 配额 -1（gitee 见下） |
| **E4** 有新版通知 | 客户看得见的提示正确 | 方案A：拨 `lastNotifiedSha=0000…` 造 pending → **真 key 成功 call** | stderr 出 4 行：`[notice] wind-mcp-skill 有新版本可用 / 升级命令: / npx skills update wind-mcp-skill <-g 仅global> -y / 本次调用结果不受影响。`；result 走 stdout |
| **E5** 去重 | 同版本不反复打扰 | 再一次成功 call | stderr 空（lastNotifiedSha 已对齐 latestSha） |
| **E6** 真升级 | 升级命令本身能跑 | `npx skills update wind-mcp-skill [-g] -y` | exit 0 |
| **E7** 升级后不误报 | 刚升级完不该再提示 | 升级后再成功 call | stderr 空 |

## E4 期望 stderr 原文（global）
```
[notice] wind-mcp-skill 有新版本可用
升级命令:
  npx skills update wind-mcp-skill -g -y
本次调用结果不受影响。
```
project scope 时升级命令为 `npx skills update wind-mcp-skill -y`（**无 `-g`**）。

**Gitee 源升级命令不同**（`buildUpgradeCommand` 有意为之——gitee 的 `npx skills update` 重解析源走不通，故给完整 `add`）：
```
npx skills add https://gitee.com/jsonCodeChina/wind-skills.git --skill wind-mcp-skill -g -y
```
project scope 去掉 `-g`。脚本按 `--source` 自动切换期望，不要混用。

## 重要说明
- **E2b/E3 用同步探活**：真 cli call 触发的探活是 detached 异步子进程，在脚本宿主下可能被进程组回收没写完。为得到确定的 cache 状态，脚本在这两步**同步直跑 `update-check.mjs`**。"detached 在真 agent 宿主能否存活"是 `manual/agent-checklist.md` 的观察项，不在自动化范畴。
- **E4/E5/E7 需真 key**：notice 只在成功 call 上发（cli.mjs 报错走 `die()` 立即退出，跳过通知）。无 `WIND_API_KEY` 这三例自动 SKIP。
- **Gitee 的 E3 可能 SKIP**：实测 gitee `api/v5` tree 接口对该仓返回 404（私有/接口差异），探活可能拉不到 latestSha。脚本对 gitee 的 E3 失败记为 SKIP 并提示"如实记录"，不算 FAIL，但报告需标注"gitee 探活未验证"。
- **跨源 hash 差异**：GitHub skillFolderHash = 40 位 sha1，Gitee = 64 位 sha256。两边探活比对都要正确。
