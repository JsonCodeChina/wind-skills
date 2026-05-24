# wind-mcp-skill 更新逻辑设计文档

> **决策日期**：2026-05-23
> **决策者**：alice + BMad Master
> **状态**：✅ 设计确认，待开工
> **关联文档**：[Lock Schema 实测报告](./lock-schema-test-results.md)
> **代码位置**：`scripts/cli.mjs` + `scripts/update-check.mjs`
> **适用 skill**：wind-mcp-skill / wind-find-finance-skill / wind-alice（三个 skill 共用同一套更新逻辑）

---

## 1. 摘要

wind-mcp-skill 当前更新逻辑（cli.mjs + update-check.mjs 共 **1622 行**）被定性为过度工程化。方案在保留核心功能（探活 GitHub/Gitee 远端 → stderr 提示新版）的前提下：

- **砍掉 ~60% 代码**（落点 550-650 行，专家保守估 700-900 行）
- **修复 1 个隐性 bug**（项目级 + Gitee 探活完全失效）
- **吸收 6 个专家提出的设计修正**
- **引入 ETag/304 机制**实现高频探活而不耗 GitHub 配额（24h TTL → 6h TTL）

---

## 2. 设计目标

- **不污染上下文** — AI agent 调用 skill 时 stderr 严格控制
- **简单** — 代码量对标 pip self_outdated_check (246 行) / update-notifier (~400 行)
- **可靠** — 失败完全静默，不重复打扰，不依赖会话概念
- **跨版本兼容** — global (v3 lock) 和 project (v1 lock) 双 schema 都支持
- **零维护扩展** — 未来新增任何访问远端的命令，自动覆盖更新检测

---

## 3. 5 个核心原则

| # | 原则 |
|---|---|
| **N1** | **不识别会话** — CLI 进程视角看不到会话边界，不依赖此概念 |
| **N2** | **TTL 之内静默** — cache 命中，不探活，不打 stderr |
| **N3** | **远端变了才通知** — 主业务 result 输出之后，stderr 追加一行 |
| **N4** | **探活失败静默吞** — 网络/限流/解析失败都不打 stderr |
| **N5** | **通知去重严格** — lastNotifiedSha 字段，同一版本最多通知一次 |

---

## 4. 14 条核心决策

| 类别 | 决策 |
|---|---|
| 触发条件 | 仅命令实际访问远端时（cmdCall 等），未来新远端命令各自开头调一次 |
| TTL | 6h |
| 网络优化 | ETag / If-None-Match → 304 不计 GitHub 配额 |
| 数据文件 | 1 个 JSON：`~/.cache/wind-aifinmarket/update-state.json` |
| Cache key | `${skillName}\|${canonicalizeLockPath(lockPath)}` |
| 多 entry 共存 | global / project / 多 skill / 不同源都不冲突 |
| 失败处理 | 完全静默（不打 stderr） |
| 通知时机 | stdout result 输出之后，stderr 追加 |
| 通知前缀 | `[notice]` |
| 升级命令 | 按每条 pending entry 各自给（不智能选），多条就多条 |
| 首次客户 | 静默写基线（lastNotifiedSha 必须三都有才算 pending） |
| 并发写 | 子进程锁内重读 + only patch self + 其它原样透传 |
| Cache GC | Lazy GC（Phase C 探活时清孤儿 entry） |
| 长尾 fallback | 默认开，整个生命周期最多一次提示 |

---

## 5. Cache 数据结构

```json
{
  "version": 1,
  "entries": {
    "wind-mcp-skill|/home/wind/.agents/.skill-lock.json": {
      "lockSchemaVersion": 3,
      "latestSha":         "<远端最新 SHA>",
      "lastNotifiedSha":   "<上次通知过的 SHA>",
      "etag":              "abc123",
      "lastCheckedAt":     "2026-05-23T06:27:27.286Z",
      "lastSuccessAt":     "2026-05-23T06:27:27.286Z",
      "lockSignature":     "<字段白名单 hash>"
    },
    "wind-mcp-skill|/home/wind/proj-a/skills-lock.json": { ... },
    "wind-alice|/home/wind/.agents/.skill-lock.json":     { ... }
  }
}
```

### 字段说明

| 字段 | 含义 |
|---|---|
| `version` | cache schema 版本，当前 1。不等于 1 当空 cache 处理 |
| `entries` | map：key 唯一标识一份安装，value 是其探活状态 |
| `entries.*.lockSchemaVersion` | 该 lock 文件的 schema 版本（1 或 3），影响探活路径选择 |
| `entries.*.latestSha` | 远端 latest tree SHA |
| `entries.*.lastNotifiedSha` | 上次通知客户的 SHA。等于 latestSha → 不再通知 |
| `entries.*.etag` | GitHub/Gitee 返回的 ETag，下次请求带 If-None-Match 头 |
| `entries.*.lastCheckedAt` | 上次探活时间（成功 200 或 304 都算） |
| `entries.*.lastSuccessAt` | 上次成功拿到非 304 响应的时间（用于长尾 fallback） |
| `entries.*.lockSignature` | 白名单字段计算的 hash，lock 变化检测 |

### Cache key 设计

`key = ${skillName}|${canonicalizeLockPath(lockPath)}`

`canonicalizeLockPath()` 实现：

1. 尝试 `fs.realpathSync.native(path)` — 解析软链接
2. realpath 失败（lock 文件不存在等场景）→ 降级 `path.normalize(path.resolve(path))`
3. Windows 平台额外 `.toLowerCase()`

保证：global / project / 多 skill / 不同源都不冲突，软链接 / `./` / 大小写差异不产生重复 key。

---

## 6. 4 个 Phase 流程图

### Phase A：客户安装（vercel-labs/skills 工具控制，wind-skills 无法干涉）

```
npx skills add <repo> [-g] -y → 写 lock 文件
```

4 种 lock schema 实测见 [lock-schema-test-results.md](./lock-schema-test-results.md)。

### Phase B：cli.mjs 主进程

```
cli.mjs <args>
      ↓
cmd 路由判定: help/无参/无效命令 → exit (不触发)
              commands[cmd] 存在 → 进 main 业务流程
      ↓
触发点: 仅"实际访问远端"的命令才调更新检测
  cmdCall → maybeNotifyAndSpawnUpdate() → mcpRequest
  cmdSetupKey/OpenPortal/Diagnose → 不调远端,不触发
  未来新远端命令: 各自在开头调一次,零维护扩展
      ↓
── maybeNotifyAndSpawnUpdate() 内部 ───────────────

collectEntries() → 找当前 skill 所有 lock entries
      ↓
对每条 entry 算:
  cacheKey  = `${SKILL_NAME}|${canonicalizeLockPath(entry.lockPath)}`
  state     = cache.entries[cacheKey] (可能空)
  pending_i = state && state.latestSha && state.lastNotifiedSha
              && state.latestSha != state.lastNotifiedSha
  stale_i   = !state.lastCheckedAt
              || (now - state.lastCheckedAt > 6h)
              || (state.lockSignature != currentSig)
      ↓
any(stale_i)? → spawnUpdateCheck() detached → 进 Phase C
      ↓
执行 commands[cmd]() 主业务 → process.stdout.write(result)
      ↓
     (stdout flush)
      ↓
any(pending_i)?
┌─ YES ──────────────────────────────────────────────────────────┐
│  process.stderr.write:                                          │
│                                                                  │
│  [notice] wind-mcp-skill 有新版本可用                           │
│  升级命令:                                                       │
│    npx skills update wind-mcp-skill -g -y      ← global 那条     │
│    npx skills update wind-mcp-skill -y         ← project 那条    │
│  本次调用结果不受影响。                                          │
│                                                                  │
│  每条 pending entry 各自一条命令(按 lockPath 推 scope)          │
│  单 entry 就一条; 多 entry 就多条                               │
│                                                                  │
│  对每条 pending entry:                                          │
│  updateCache(cacheKey, { lastNotifiedSha: state.latestSha })   │
└─ NO ──→ (静默退出)
```

### Phase C：update-check.mjs 子进程（detached, stdio: ignore）

```
collectEntries()
      ↓
对每条 entry 独立处理:
┌────────────────────────────────────────────────────────────┐
│  cacheKey = `${SKILL_NAME}|${canonicalizeLockPath(...)}`    │
│  stale 判定同 Phase B                                       │
│  stale=否 → skip 这条                                       │
│  stale=是 → 探活 (走 ETag/304):                              │
│                                                              │
│   v3 path (entry 有 sourceUrl + installedAt):                │
│     fetchTreeWithETag(sourceUrl, state.etag)                │
│       ┌─ HTTP 200 (远端变了) ────────────────────┐           │
│       │ newEtag = resp.headers.etag             │           │
│       │ currentSha = 解析 body                   │           │
│       │ fetchCommitAtTime(installedAt+1h)       │           │
│       │   → installedSha                        │           │
│       │ 比对得 outdated                         │           │
│       └─ HTTP 304 (远端没变) ────────────────────┐           │
│       │ 不计 GitHub 限流配额!                    │           │
│       │ latestSha 不变 (复用)                   │           │
│       │ 只刷 lastCheckedAt                      │           │
│       │ (lastSuccessAt 不刷,304 不算"真成功")    │           │
│       └─────────────────────────────────────────┘           │
│                                                              │
│   v1 path (缺 sourceUrl + installedAt):                     │
│     deriveSourceUrl 修 Gitee bug:                            │
│        entry.source.startsWith('git@') → 直接用             │
│     fetchTreeWithETag → 200/304 同上                        │
│     readBaseline 比对                                        │
│                                                              │
│  ┌─ 成功 (200/304) ───┐    ┌─ 失败 (网络/404) ──┐           │
│  │ withLock 内重读 → │   │ ❌ 不写 cache         │           │
│  │ 只 patch 自己负责 │   │  (避免假装"已检查")   │           │
│  │ 的 cacheKey →     │   │ 完全静默,不打 stderr  │           │
│  │ 其它 entry 原样   │   └─────────────────────┘           │
│  │ 透传 → writeFile  │                                       │
│  └────────────────────┘                                       │
└────────────────────────────────────────────────────────────┘
      ↓
Lazy GC: cache.entries 里 lockPath 文件不存在的孤儿 entry → 删除
      ↓
子进程退出
```

### Phase D：长尾 fallback（默认开，整个生命周期最多一次）

```
Phase B 末尾, 任一 cacheKey 的
(now - lastSuccessAt > 14d) + cli 累计调用 >= 10 + 本生命周期未提示过:
      ↓
stderr 一行:
[notice] wind-mcp-skill 更新检测连续 14 天无成功,
         可能是网络问题, 不影响本次调用。
      ↓
全局标记 fallback 已触发,后续永不再打
(标记位写在 cache 顶层,如 cache.fallbackShown = true)
```

---

## 7. 6 个必做修正

| # | 修正 | 解决什么 |
|---|---|---|
| **#1** | `canonicalizeLockPath()` | 软链接 / `./` / Windows 大小写不敏感会让同一 lock 产生不同 cacheKey |
| **#2** | 子进程 read-modify-write fix | `withLock` 只锁写不锁"读改写"，两个子进程并发会丢 lastNotifiedSha |
| **#3** | 首次见 latestSha 静默写基线 | pending 判定要求 latestSha + lastNotifiedSha 三都有，否则每个新客户首跑被骚扰 |
| **#4** | `lockSignature` 字段白名单 hash | 不要整文件 hash，避免客户改无关字段触发多余探活 |
| **#5** | cache entry 加 `lockSchemaVersion` | v1 用 computedHash + v3 用 installedAt，异质字段混用 `lockSignature` 字符串比较有歧义 |
| **#6** | 通知首行 `[notice]` 前缀 | 替代 `[wind-skills] 提示:`，对齐业界 INFO/WARNING/NOTICE 惯例，降低 agent 误判 |

---

## 8. Bug 修复

### 8.1 项目级 + Gitee 探活完全失效

**实测验证**：Case 4（project + Gitee）的 lock 内容：

```json
{
  "version": 1,
  "skills": {
    "wind-mcp-skill": {
      "source": "git@gitee.com:wind_info/wind-skills.git",
      "sourceType": "git",
      "skillPath": "skills/wind-mcp-skill/SKILL.md",
      "computedHash": "..."
    }
  }
}
```

**当前 `deriveSourceUrlCandidates` 逻辑**：

```js
if (/^https?:\/\//.test(entry.source)) return [entry.source]; // SSH 不匹配
if (t === 'git' || t === 'gitee') return [`https://gitee.com/${entry.source}.git`];
// 拼出: https://gitee.com/git@gitee.com:wind_info/wind-skills.git.git ← 垃圾 URL
```

**修复**（在函数起点加 1 行）：

```js
if (entry.source.startsWith('git@')) return [entry.source];
```

**影响范围**：所有项目级 + Gitee 安装的客户。

---

## 9. 行数预期 + 砍掉清单

### 砍掉项

| 砍掉项 | 行数（估） |
|---|---|
| sentinel 文件 + getSessionId 5 层 fallback + 跨平台 walk | -400 |
| maybeNotifyFailureOnce | -50 |
| filterAlreadyUpgraded（含 hash 跨空间 bug） | -50 |
| cleanupLegacyFiles + cleanupStaleSentinels | -40 |
| snooze 系统 | -30 |
| cmd === 'call' 命令名硬编码 | -20 |
| **小计** | **-590** |

### 新增项

| 新增项 | 行数（估） |
|---|---|
| canonicalizeLockPath (#1) | +20 |
| 子进程 read-modify-write fix (#2) | +30 |
| 首次见 latestSha 写基线 (#3) | +5 |
| lockSignature 字段白名单 hash (#4) | +15 |
| cache entry 加 lockSchemaVersion (#5) | +5 |
| `[notice]` 前缀 (#6) | +0（只改文案） |
| ETag / If-None-Match 处理 | +40 |
| Lazy GC 孤儿 entry 清理 | +10 |
| 长尾 fallback（默认开） | +25 |
| Gitee SSH URL 直通 | +1 |
| **小计** | **+151** |

### 净变化

- 简单加减：1622 - 590 + 151 = **1183 行**
- 实际重写时还会顺手压缩冗余抽象、合并相似函数、删防御性代码
- 专家保守估**实际落点 700-900 行**，激进估 500-650 行
- **目标 ≤ 800 行，超出 1000 行就说明又过度工程化了**

---

## 10. 兼容性 + 客户升级路径

### 10.1 旧 cache 处理

**策略**：静默忽略让它自然重建。理由：

1. cache 是纯优化数据无业务价值，最坏后果是用户多看一次"有新版本"提示
2. 写兼容读层会拖出至少 30 行 + 一个永远删不掉的死代码路径
3. 删旧 cache 需要知道旧路径，增加耦合

**实现**：`JSON.parse` 失败或 `version !== 1` 直接当空 cache 处理，首次写入时覆盖。

### 10.2 客户首次升级到 的体验

1. 客户跑 `npx skills update wind-mcp-skill` 拉到 代码
2. 下次跑 cli call → 主进程读 cache（旧 schema 或为空）→ 当空处理
3. spawnUpdateCheck 子进程探活 → 写 cache 基线（lastNotifiedSha = latestSha）
4. **本次不通知**（修正 #3 静默写基线）
5. 下次远端真出新版 → 通知客户升级

不会出现"刚升级完又被通知有新版"的尴尬。

### 10.3 命名迁移（aimarket → aifinmarket）

旧 cache 路径 `~/.cache/wind-aimarket/`、旧 config 路径 `~/.wind-aimarket/config` **不自动迁移**。客户升级后：

- 旧目录变孤儿但无害
- API Key 配置（`~/.wind-aifinmarket/config` 或 `~/.wind-aimarket/config`）当前代码只读新路径，客户需要重新 `setup-key`

> 这是已知的迁移成本，由命名迁移决策造成，不在 更新逻辑范畴。

---

## 11. 落地路径

| 阶段 | 内容 | 状态 |
|---|---|---|
| 1 | 设计方案 + 文档落档（本文） | ✅ 完成 |
| 2 | 测试用例规划（test-plan.md） | 🔄 进行中 |
| 3 | 实测 4 种 lock schema（lock-schema-test-results.md） | ✅ 完成 |
| 4 | wind-mcp-skill 代码重写（按测试驱动） | ⏳ 未开始 |
| 5 | wind-find-finance-skill 套用相同代码 | ⏳ 未开始 |
| 6 | wind-alice 套用相同代码 | ⏳ 未开始 |
| 7 | dev 仓灰度发布 | ⏳ 未开始 |
| 8 | 同步到 official 仓（人工审核） | ⏳ 未开始 |

---

## 12. 关联文档

- [Lock Schema 实测报告](./lock-schema-test-results.md) — 4 case 字段差异 + 隐性 bug 实测推导
- [测试用例规划](./test-plan.md) — 测试矩阵 + 关键场景 + 自动化 vs 手工拆分
- `test/lock-schema/` 原始 lock 文件 — 实测产出的 4 种 lock 文件留档，用于回归对比
