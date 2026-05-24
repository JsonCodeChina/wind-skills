# Lock 文件 Schema 实测报告

> **实测日期**：2026-05-23
> **环境**：Linux + Node v20.19.6 + `npx skills@latest`
> **原始 lock 文件**：[`../test/lock-schema/`](../test/lock-schema/)
> **关联文档**：[wind-mcp-skill 更新逻辑 v2.3](./wind-mcp-skill-update-logic-v2.3.md)

---

## 1. 实测方法

在 4 种隔离环境（`/tmp/wind-skills-lock-test/case-N/`）分别跑 `npx skills add`，把生成的 lock 文件抓回 `aifin-market-skills/test/lock-schema/` 留档。

| Case | 命令 | Lock 写入位置 |
|---|---|---|
| 1: global + GitHub | `npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-mcp-skill -g -y` | `$HOME/.agents/.skill-lock.json` |
| 2: global + Gitee | `npx skills add git@gitee.com:wind_info/wind-skills.git --skill wind-mcp-skill -g -y` | `$HOME/.agents/.skill-lock.json` |
| 3: project + GitHub | `npx skills add Wind-Information-Co-Ltd/wind-skills --skill wind-mcp-skill -y` | `<cwd>/skills-lock.json` |
| 4: project + Gitee | `npx skills add git@gitee.com:wind_info/wind-skills.git --skill wind-mcp-skill -y` | `<cwd>/skills-lock.json` |

**隔离方式**：每个 case 用 `HOME=/tmp/wind-skills-lock-test/case-N` 把全局路径重定向；用 `GIT_SSH_COMMAND="ssh -i /home/wind/.ssh/id_ed25519 ..."` 注入 SSH key，避免污染真实 `~/.ssh/`。

---

## 2. 4 Case 对照表

| 字段 | Case 1: global+GitHub | Case 2: global+Gitee | Case 3: project+GitHub | Case 4: project+Gitee |
|---|---|---|---|---|
| Lock 文件 | `.agents/.skill-lock.json` | `.agents/.skill-lock.json` | `skills-lock.json` | `skills-lock.json` |
| **version** | **3** | **3** | **1** | **1** |
| source | `Wind-Information-Co-Ltd/wind-skills` | `git@gitee.com:wind_info/wind-skills.git` | `Wind-Information-Co-Ltd/wind-skills` | `git@gitee.com:wind_info/wind-skills.git` |
| **sourceType** | `"github"` | `"git"` | `"github"` | `"git"` |
| **sourceUrl** | `https://github.com/.../wind-skills.git` | `git@gitee.com:.../wind-skills.git` | ❌ **缺** | ❌ **缺** |
| skillPath | `skills/wind-mcp-skill/SKILL.md` | 同左 | 同左 | 同左 |
| **Hash 字段名** | `skillFolderHash` | `skillFolderHash` | **`computedHash`** | **`computedHash`** |
| Hash 值 | `694ddcf16b...` (40 字符) | `2d5f63028921...` (64 字符) | `2d5f63028921...` (64 字符) | `2d5f63028921...` (64 字符) |
| Hash 算法 | **SHA1** (40 hex) | **SHA256** (64 hex) | SHA256 | SHA256 |
| **installedAt** | `2026-05-23T06:27:27.286Z` | `2026-05-23T06:27:39.169Z` | ❌ **缺** | ❌ **缺** |
| **updatedAt** | 同 installedAt | 同 installedAt | ❌ **缺** | ❌ **缺** |
| 顶层 `dismissed` 字段 | ✅ `{}` | ✅ `{}` | ❌ 无 | ❌ 无 |

---

## 3. 关键发现

### 3.1 Global vs Project 走不同 schema 版本

- **Global（带 -g）→ version 3**，schema 完整：有 `sourceUrl` + `installedAt` + `updatedAt`
- **Project（不带 -g）→ version 1**，schema 精简：**缺 sourceUrl / installedAt / updatedAt**

**影响**：v2.3 探活逻辑必须双 path：v3 走 installedAt 反查，v1 走 baseline 兜底。

### 3.2 Hash 字段名不同

- v3 用 `skillFolderHash`
- v1 用 `computedHash`

**影响**：代码必须 `entry.skillFolderHash || entry.computedHash` 双字段读。

### 3.3 Hash 算法竟然不一致

- **Case 1（global GitHub）：SHA1**（40 hex 字符）— 推测 npx skills 直接复用了 git tree SHA
- 其他 3 个 case：**SHA256**（64 hex 字符）— 是 npx skills 自己算的内容 hash

**影响**：不能假设 hash 长度统一。任何 hash 比对逻辑必须对长度宽容。

### 3.4 sourceType 字段：Gitee 是 `"git"` 不是 `"gitee"`

- GitHub → `"github"`
- **Gitee → `"git"`**（不是 `"gitee"`！）

**影响**：当前 update-check.mjs 的 `deriveSourceUrlCandidates` 已经把 `'git'` 和 `'gitee'` 都当 Gitee 处理 ✅，没踩坑。但任何依赖 sourceType 区分 Gitee 的代码都要小心。

### 3.5 🔴 隐性 bug：项目级 + Gitee 探活完全失效

**Case 4 lock 内容**：
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

**当前 update-check.mjs `deriveSourceUrlCandidates` 推导路径**：

```js
function deriveSourceUrlCandidates(entry) {
  if (entry?.sourceUrl) return [entry.sourceUrl];          // v1 缺,跳过
  if (typeof entry?.source !== 'string') return [];
  if (/^https?:\/\//.test(entry.source)) return [entry.source];  // SSH 不匹配
  const t = entry.sourceType;
  if (t === 'github') return [`https://github.com/${entry.source}.git`];
  if (t === 'git' || t === 'gitee')                           // ← 进这里
    return [`https://gitee.com/${entry.source}.git`];          // 拼接错误
  return [];
}
```

**拼出来**：`https://gitee.com/git@gitee.com:wind_info/wind-skills.git.git`

**后续 `parseSourceUrl` regex 错误解析**：

```js
const m = sourceUrl.match(/(?:github\.com|gitee\.com)[:/]([^/]+)\/([^/]+?)(?:\.git)?(?:$|[/?#])/);
// owner = "git@gitee.com:wind_info"  ← 含 @ 和 : 的非法 owner
// repo  = "wind-skills.git"
```

**最终请求 Gitee API**：
```
GET https://gitee.com/api/v5/repos/git@gitee.com:wind_info/wind-skills/git/trees/main?recursive=1
→ 404 Not Found
```

**结果**：项目级 + Gitee 安装的所有客户**完全无法探活到新版**，永远拿不到更新提示。

### 3.6 修复方案（v2.3 已纳入）

在 `deriveSourceUrlCandidates` 起点加 1 行 SSH URL 直通：

```js
function deriveSourceUrlCandidates(entry) {
  if (entry?.sourceUrl) return [entry.sourceUrl];           // v3 path
  if (typeof entry?.source !== 'string') return [];
  // ↓ v2.3 新增：SSH URL 直接当 sourceUrl 用
  if (entry.source.startsWith('git@')) return [entry.source];
  if (/^https?:\/\//.test(entry.source)) return [entry.source];
  // ... 后面短形拼接逻辑不变
}
```

**影响范围**：所有项目级 + Gitee 安装的客户都需要客户升级到 v2.3 后才能恢复探活。Global 客户不受影响（v3 lock 有 sourceUrl 直接用）。

---

## 4. 对 v2.3 设计的影响

| 实测发现 | v2.3 设计响应 |
|---|---|
| Global v3 / Project v1 双 schema | Cache entry 加 `lockSchemaVersion` 字段（修正 #5） |
| Hash 字段名 + 算法都不同 | `skillFolderHash || computedHash` 双字段兼容；hash 比对不依赖长度 |
| Project + Gitee 探活 bug | `deriveSourceUrlCandidates` 加 SSH URL 直通分支（必做 bug 修） |
| sourceType "git" = Gitee | 保持现状（代码已经对了） |
| Global 缺少 sourceUrl 也可能存在 | v3 path 探活前必须先判 `entry.sourceUrl` 是否真存在，缺失就走 v1 path |

---

## 5. 原始 lock 文件留档

每个 case 的完整目录树：

```
test/lock-schema/
├── case-1-global-github/
│   ├── .agents/.skill-lock.json              ← lock 文件（关键产出）
│   └── .npm/_npx/...                          ← npx 缓存（可忽略）
├── case-2-global-gitee/
│   ├── .agents/.skill-lock.json
│   └── .npm/_npx/...
├── case-3-project-github/
│   ├── skills-lock.json                       ← lock 文件
│   └── .npm/_npx/...
└── case-4-project-gitee/
    ├── skills-lock.json
    └── .npm/_npx/...
```

可作为 v2.3 实现的测试 fixture 直接复用。

---

## 6. 复测命令

完整复测脚本见 `test/lock-schema/run-test.sh`（待生成）。简化版：

```bash
TESTROOT=/tmp/wind-skills-lock-test
SSH_CMD="ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no"

for case in \
  "case-1-global-github:Wind-Information-Co-Ltd/wind-skills:-g" \
  "case-2-global-gitee:git@gitee.com:wind_info/wind-skills.git:-g" \
  "case-3-project-github:Wind-Information-Co-Ltd/wind-skills:" \
  "case-4-project-gitee:git@gitee.com:wind_info/wind-skills.git:"; do
    IFS=":" read label src flag <<< "$case"
    mkdir -p "$TESTROOT/$label"
    HOME="$TESTROOT/$label" GIT_SSH_COMMAND="$SSH_CMD" \
      npx -y skills@latest add "$src" --skill wind-mcp-skill $flag -y
done
```
