# wind-mcp-skill 更新机制说明

## 1. 架构概览

更新机制由两个脚本协作完成：

| 脚本 | 角色 | 运行方式 |
|------|------|----------|
| `scripts/update-check.mjs` | 后台探活：检测远端是否有新版本 | 由 cli.mjs 异步 spawn，独立后台进程 |
| `scripts/cli.mjs` | 前台主流程：读取检测结果，输出到 JSON envelope | 用户/AI Agent 直接调用 |

**核心设计原则：**
- 前台不阻塞：MCP 调用和更新检查完全并行
- 后台不报错：update-check.mjs 任何异常都静默吞掉，exit code 永远为 0
- 结果走缓存：两个脚本通过共享文件 `~/.cache/wind-aifinmarket/update-state.json` 传递状态

## 2. 完整时序

```
AI Agent
  │
  ├─ cli.mjs call stock_data get_stock_quote '{...}'
  │    │
  │    ├─ (1) spawn update-check.mjs [detached, stdio=ignore]
  │    │         │
  │    │         ├─ 清理 v1 legacy 文件
  │    │         ├─ 读 lock 文件 + 统一缓存
  │    │         ├─ 缓存新鲜？ ──是──▶ 打印 stderr 后退出
  │    │         ├─ 否：遍历 lock 条目
  │    │         │    ├─ fetchCurrentTree() → currentSha
  │    │         │    ├─ fetchCommitAtTime() → installCommit.sha
  │    │         │    ├─ fetchTreeBySha() → installedSha
  │    │         │    └─ currentSha vs installedSha
  │    │         ├─ 聚合结果 → 写统一缓存
  │    │         └─ printNotice(stderr) → 退出
  │    │
  │    ├─ (2) 执行 MCP 调用（initialize + tools/call）  ← 不等后台
  │    │
  │    ├─ (3) collectUpdateNotices()
  │    │         ├─ 读统一缓存
  │    │         ├─ filterAlreadyUpgraded()
  │    │         └─ 按 status 生成 notice 对象
  │    │
  │    └─ (4) 输出 JSON envelope
  │         { ok, data, notices: [...], meta }
  │
  └─ AI Agent 读取 notices，告知用户
```

## 3. update-check.mjs 详细流程

### 3.1 Skill 名称自动检测

```javascript
const SKILL_NAME = basename(dirname(SCRIPT_DIR));
```

从脚本所在目录自动推导 skill 名。例如脚本路径为 `skills/wind-mcp-skill/scripts/update-check.mjs`，则 `SKILL_NAME = "wind-mcp-skill"`。**不硬编码任何 skill 名**，同一套代码可服务于任何 skill。

### 3.2 Lock 文件收集

`findLockFiles()` 在以下位置搜索 lock 文件：

| 位置 | 说明 |
|------|------|
| `~/.agents/.skill-lock.json` | 全局安装（默认） |
| `$XDG_STATE_HOME/skills/.skill-lock.json` | XDG 规范路径 |
| 从脚本目录向上遍历 `skills-lock.json` | 项目级 lock |
| 从 cwd 向上遍历 `skills-lock.json` | 工作目录级 lock |

`collectEntries()` 从所有 lock 文件中提取 `skills[SKILL_NAME]` 条目。

### 3.3 缓存新鲜度判断

`isCacheFresh(cache, currentSignature)` 判定条件：

1. **lockSignature 一致**：`buildLockSignature()` 将每个 lock 条目的 `lockPath|updatedAt` 排序拼接，如果 lock 文件内容没变，签名一致
2. **TTL 未过期**：`Date.now() - lastCheck < ttlMs`

两个条件都满足时直接退出，不做网络请求。

### 3.4 Hash 对比核心算法（v2 installedAt 反查方案）

这是判断"是否有更新"的核心逻辑，**基于 git tree SHA 对比**：

```
步骤 A: 获取远端当前状态
  fetchCurrentTree(parsed, ref)
  → 调用 GitHub/Gitee Trees API: GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1
  → 在返回的 tree 中找到 skill 目录的 SHA → currentSha

步骤 B: 反查安装时刻的状态
  fetchCommitAtTime(parsed, ref, skillDir, installedAt)
  → 调用 Commits API: GET /repos/{owner}/{repo}/commits?until={installedAt+1h}&path={skillDir}&per_page=1
  → 找到安装时刻的 commit SHA

  fetchTreeBySha(parsed, installCommit.sha)
  → 调用 Trees API 获取该 commit 的完整 tree
  → 找到 skill 目录的 SHA → installedSha

对比: currentSha === installedSha ?
  相同 → 无更新
  不同 → 有更新
```

**与 v1 baseline 方案的区别：**
- v1 用 baseline 文件存"上次远端 SHA"，首次 check 把当下当基准 → 如果安装的就是老版本，漏报
- v2 反查 lock.updatedAt 时刻的真实 commit → 精确对比，能检测"安装的就是老版本"

### 3.5 聚合结果与 TTL

| 状态 | 含义 | TTL |
|------|------|-----|
| `up_to_date` | 当前版本与远端一致 | 1 小时 |
| `update_available` | 检测到新版本 | 12 小时 |
| `unknown` | 无法判断（lock 缺失、URL 不支持等） | 24 小时 |
| `transient_error` | 网络错误 / 超时 / rate limit | 5 分钟（普通）/ 1 小时（rate limit） |

### 3.6 统一缓存格式（schema v3）

```json
{
  "schemaVersion": 3,
  "skills": {
    "wind-mcp-skill": {
      "status": "update_available",
      "outdated": [{
        "name": "wind-mcp-skill",
        "current": "abc1234",
        "latest": "def5678",
        "sourceUrl": "https://github.com/...",
        "host": "github",
        "installedHash": "b5b7861274e6..."
      }],
      "ttlMs": 43200000,
      "lastCheck": "2026-05-19T06:00:00.000Z",
      "lockSignature": "C:\\Users\\...\\.skill-lock.json|2026-05-15T12:07:54.499Z"
    },
    "other-skill": { ... }
  }
}
```

- 多 skill 共享同一文件
- 文件锁（O_EXCL）保护并发写入
- snooze 设置（`snoozedUntil` / `snoozeLevel`）在写入时保留

## 4. cli.mjs 通知收集流程

### 4.1 触发时机

只在 `call` 命令时触发：
1. 先 `spawnUpdateCheck()` — 异步 spawn 后台进程
2. 执行 MCP 调用
3. 调用完成后 `collectUpdateNotices()` — 读取缓存，生成 notice

### 4.2 collectUpdateNotices() 处理链

```
读缓存
  → 有状态？
    → 无: return []
    → 有: 过滤跨 skill 条目（仅保留 name === SKILL_NAME）
      → status == update_available?
        → 是: filterAlreadyUpgraded()
          → 全部已升级? → 改写缓存为 up_to_date, return []
          → 部分已升级? → 更新 outdated 列表
        → 否: 直接进入下一步
      → 已静音（snoozedUntil）? → return []
      → 按 status 返回对应 notice 对象
```

### 4.3 filterAlreadyUpgraded() — 已升级过滤

判断用户是否已经执行了升级：

```
live    = lock 文件中当前的 skillFolderHash（SHA-256）
stored  = outdated 条目中的 installedHash（缓存时记录的 skillFolderHash）

live === stored → hash 未变 → 真的还没升级 → 保留通知
live !== stored → hash 已变 → 用户已升级   → 过滤掉该通知
```

这个机制确保：即使缓存还写着 `update_available`，如果用户已经升级了 skill（lock 文件中的 hash 变了），通知会被自动清除。

### 4.4 输出到 JSON Envelope

```json
{
  "ok": true,
  "command": "call",
  "data": { ... },
  "notices": [{
    "type": "update_available",
    "severity": "info",
    "message": "检测到 1 个 skill 有新版",
    "items": [{
      "name": "wind-mcp-skill",
      "current": "abc1234",
      "latest": "def5678",
      "source": "github",
      "upgrade_command": "npx skills update wind-mcp-skill -g -y"
    }]
  }],
  "meta": { "cli_version": "1.6.0", "schema_version": 1 }
}
```

AI Agent 读取 `notices` 数组，将更新信息告知用户。

## 5. 涉及的文件清单

| 文件 | 读写方 | 说明 |
|------|--------|------|
| `~/.agents/.skill-lock.json` | update-check 读取 / cli.mjs 读取 | skill 安装信息（sourceUrl, installedAt, skillFolderHash） |
| `~/.cache/wind-aifinmarket/update-state.json` | update-check 写入 / cli.mjs 读写 | 统一缓存（schema v3） |
| `~/.cache/wind-aifinmarket/update-state.json.lock` | update-check | 文件锁（O_EXCL 独占） |
| `references/tool-manifest.json` | cli.mjs 读取 | server_type + tool_name 合法组合 |
| `references/error-codes.json` | cli.mjs 参考 | 错误码定义 |

## 6. 边界情况处理

| 场景 | 行为 |
|------|------|
| 无 lock 文件 | `unknown (lock_missing)`，TTL 24h |
| lock 中无 sourceUrl | `unknown (no_source_url)` |
| sourceUrl 非 GitHub/Gitee | `unknown (unsupported_host)` |
| 网络超时（5s） | `transient_error (timeout)`，TTL 5min |
| API rate limit | `transient_error (rate_limit)`，TTL 1h |
| 缓存文件损坏/为空 | 当作空缓存，重新检查 |
| 旧版 v1/v2 缓存 | 自动识别为无效，重新检查 |
| legacy 文件残留 | 自动删除 `wind-find-update-*.json`、`update-baseline.json` |
| 用户已升级 | `filterAlreadyUpgraded` 检测 hash 变化，静默清除通知 |
| 多 skill 并发写缓存 | O_EXCL 文件锁 + 30s 过期清理 + 5 次重试 |

## 7. 流程图

配套流程图文件：[wind-mcp-update-mechanism.drawio](wind-mcp-update-mechanism.drawio)

包含 3 个页面：
1. **整体架构** — cli.mjs 与 update-check.mjs 的协作关系
2. **update-check 详细流程** — 从入口到各分支结果
3. **cli.mjs 通知收集** — collectUpdateNotices 的完整处理链
