# wind-mcp-skill 更新机制测试指南

## 1. 涉及的关键文件

测试前需要知道哪些文件可以被操纵：

| 文件 | 路径 | 作用 | 可篡改内容 |
|------|------|------|-----------|
| 统一缓存 | `~/.cache/wind-aifinmarket/update-state.json` | update-check 写入、cli.mjs 读取 | status、outdated、lockSignature、lastCheck、snoozedUntil |
| Lock 文件 | `~/.agents/.skill-lock.json` | skill 安装信息 | sourceUrl、updatedAt/installedAt、skillFolderHash |
| Lock 文件锁 | `~/.cache/wind-aifinmarket/update-state.json.lock` | 并发写保护 | 删除/设置过期时间 |
| Legacy 文件 | `~/.cache/wind-aifinmarket/wind-find-update-*.json` | v1 残留 | 手动创建后观察是否被清理 |

## 2. 手动测试流程

### 2.1 基础运行（无缓存冷启动）

```bash
# 清空缓存
rm -f ~/.cache/wind-aifinmarket/update-state.json

# 运行更新检查脚本
cd skills/wind-mcp-skill
node scripts/update-check.mjs 2>&1

# 查看缓存结果
cat ~/.cache/wind-aifinmarket/update-state.json
```

**预期结果：**
- 脚本立即退出，exit code = 0
- 缓存文件被创建，`schemaVersion: 3`
- 如果网络可达 GitHub → `status` 为 `up_to_date`、`update_available` 或 `unknown`
- 如果网络不可达 → `status` 为 `transient_error`，`reason` 为 `network` 或 `timeout`

### 2.2 缓存命中（不重复请求）

```bash
# 第一次运行
node scripts/update-check.mjs 2>&1
FIRST=$(node -e "const c=JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.cache/wind-aifinmarket/update-state.json','utf8'));console.log(c.skills['wind-mcp-skill'].lastCheck)")

# 第二次运行
node scripts/update-check.mjs 2>&1
SECOND=$(node -e "const c=JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.cache/wind-aifinmarket/update-state.json','utf8'));console.log(c.skills['wind-mcp-skill'].lastCheck)")

# 对比：lastCheck 不应变
echo "第一次: $FIRST"
echo "第二次: $SECOND"
[ "$FIRST" = "$SECOND" ] && echo "缓存命中" || echo "缓存未命中"
```

### 2.3 模拟"检测到新版本"

直接修改缓存文件，模拟 `update_available` 状态：

```bash
# 获取真实 lockSignature（用于命中缓存）
LOCK_SIG=$(node -e "
  const lock = JSON.parse(require('fs').readFileSync(require('os').homedir() + '/.agents/.skill-lock.json', 'utf8'));
  const entry = lock.skills['wind-mcp-skill'];
  const path = require('os').homedir() + '/.agents/.skill-lock.json';
  console.log(path + '|' + (entry.updatedAt || entry.installedAt));
")

# 获取真实 skillFolderHash
REAL_HASH=$(node -e "
  const lock = JSON.parse(require('fs').readFileSync(require('os').homedir() + '/.agents/.skill-lock.json', 'utf8'));
  console.log(lock.skills['wind-mcp-skill'].skillFolderHash);
")

# 写入模拟的 update_available 缓存
cat > ~/.cache/wind-aifinmarket/update-state.json << EOFJ
{
  "schemaVersion": 3,
  "skills": {
    "wind-mcp-skill": {
      "status": "update_available",
      "outdated": [{
        "name": "wind-mcp-skill",
        "current": "abc1234",
        "latest": "def5678",
        "sourceUrl": "https://github.com/Wind-Information-Co-Ltd/wind-skills.git",
        "host": "github",
        "installedHash": "${REAL_HASH}"
      }],
      "ttlMs": 43200000,
      "lastCheck": "$(date -u +%FT%T.%3NZ)",
      "lockSignature": "${LOCK_SIG}"
    }
  }
}
EOFJ

# 运行脚本 — 应该看到 stderr 输出通知
node scripts/update-check.mjs 2>&1

# 运行 CLI — notices 数组应包含 update_available
node scripts/cli.mjs call stock_data get_stock_basicinfo '{"question":"600519.SH"}' 2>/dev/null | node -e "
  const j = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log('notices:', JSON.stringify(j.notices, null, 2));
"
```

### 2.4 模拟"用户已升级"（installedHash 过滤）

在 2.3 的基础上，改掉 `installedHash` 使其与 lock 文件不匹配：

```bash
# 将 installedHash 改为一个假值
node -e "
  const f = require('os').homedir() + '/.cache/wind-aifinmarket/update-state.json';
  const c = JSON.parse(require('fs').readFileSync(f, 'utf8'));
  c.skills['wind-mcp-skill'].outdated[0].installedHash = '0000000000000000000000000000000000000000';
  require('fs').writeFileSync(f, JSON.stringify(c, null, 2));
"

# 运行 CLI — update_available 通知应该被过滤掉
node scripts/cli.mjs call stock_data get_stock_basicinfo '{"question":"600519.SH"}' 2>/dev/null | node -e "
  const j = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const updates = (j.notices || []).filter(n => n.type === 'update_available');
  console.log('update notices after upgrade:', updates.length);
  // 预期: 0 (已被 filterAlreadyUpgraded 过滤)
"
```

### 2.5 模拟"缓存过期"

```bash
# 将 lastCheck 设为过去时间 + 短 TTL
node -e "
  const f = require('os').homedir() + '/.cache/wind-aifinmarket/update-state.json';
  const c = JSON.parse(require('fs').readFileSync(f, 'utf8'));
  c.skills['wind-mcp-skill'].lastCheck = '2000-01-01T00:00:00Z';
  c.skills['wind-mcp-skill'].ttlMs = 300000;
  require('fs').writeFileSync(f, JSON.stringify(c, null, 2));
"

# 运行脚本 — 应该重新做网络请求
node scripts/update-check.mjs 2>&1
```

### 2.6 模拟"lock 文件变化"

```bash
# 篡改 lockSignature
node -e "
  const f = require('os').homedir() + '/.cache/wind-aifinmarket/update-state.json';
  const c = JSON.parse(require('fs').readFileSync(f, 'utf8'));
  c.skills['wind-mcp-skill'].lockSignature = 'fake_signature';
  require('fs').writeFileSync(f, JSON.stringify(c, null, 2));
"

# 运行脚本 — lockSignature 不匹配会触发重新检查
node scripts/update-check.mjs 2>&1

# 查看新的 lockSignature 是否被修正
node -e "
  const c = JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.cache/wind-aifinmarket/update-state.json','utf8'));
  console.log('lockSignature:', c.skills['wind-mcp-skill'].lockSignature);
"
```

### 2.7 模拟"静音"（snooze）

```bash
# 添加 snoozedUntil
node -e "
  const f = require('os').homedir() + '/.cache/wind-aifinmarket/update-state.json';
  const c = JSON.parse(require('fs').readFileSync(f, 'utf8'));
  c.skills['wind-mcp-skill'].snoozedUntil = '2099-01-01T00:00:00Z';
  require('fs').writeFileSync(f, JSON.stringify(c, null, 2));
"

# 运行脚本 — 不应有任何 stderr 输出
node scripts/update-check.mjs 2>&1

# 清除 snooze
node -e "
  const f = require('os').homedir() + '/.cache/wind-aifinmarket/update-state.json';
  const c = JSON.parse(require('fs').readFileSync(f, 'utf8'));
  delete c.skills['wind-mcp-skill'].snoozedUntil;
  require('fs').writeFileSync(f, JSON.stringify(c, null, 2));
"
```

### 2.8 模拟"无 lock 条目"

```bash
# 临时重命名 lock 文件
mv ~/.agents/.skill-lock.json ~/.agents/.skill-lock.json.bak

# 清缓存
rm -f ~/.cache/wind-aifinmarket/update-state.json

# 运行脚本 — 应该得到 unknown (lock_missing)
node scripts/update-check.mjs 2>&1

# 查看结果
node -e "
  const c = JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.cache/wind-aifinmarket/update-state.json','utf8'));
  console.log('status:', c.skills['wind-mcp-skill'].status);
  console.log('reason:', c.skills['wind-mcp-skill'].reason);
"
# 预期: status=unknown, reason=lock_missing

# 恢复
mv ~/.agents/.skill-lock.json.bak ~/.agents/.skill-lock.json
```

### 2.9 模拟"损坏缓存"

```bash
# 写入非法内容
echo "this is not json!!!" > ~/.cache/wind-aifinmarket/update-state.json

# 运行脚本 — 不应崩溃
node scripts/update-check.mjs 2>&1
echo "exit code: $?"

# 验证缓存被恢复为有效 JSON
node -e "
  const c = JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.cache/wind-aifinmarket/update-state.json','utf8'));
  console.log('schemaVersion:', c.schemaVersion);
"
# 预期: schemaVersion=3
```

### 2.10 模拟"Gitee 源更新"

```bash
# 获取 lockSignature
LOCK_SIG=$(node -e "
  const lock = JSON.parse(require('fs').readFileSync(require('os').homedir() + '/.agents/.skill-lock.json', 'utf8'));
  const entry = lock.skills['wind-mcp-skill'];
  const path = require('os').homedir() + '/.agents/.skill-lock.json';
  console.log(path + '|' + (entry.updatedAt || entry.installedAt));
")

# 写入 Gitee 源的 update_available
cat > ~/.cache/wind-aifinmarket/update-state.json << EOFJ
{
  "schemaVersion": 3,
  "skills": {
    "wind-mcp-skill": {
      "status": "update_available",
      "outdated": [{
        "name": "wind-mcp-skill",
        "current": "abc1234",
        "latest": "def5678",
        "sourceUrl": "https://gitee.com/someorg/wind-skills.git",
        "host": "gitee"
      }],
      "ttlMs": 43200000,
      "lastCheck": "$(date -u +%FT%T.%3NZ)",
      "lockSignature": "${LOCK_SIG}"
    }
  }
}
EOFJ

# 运行 CLI — 升级命令应为 npx skills add（重装）
node scripts/cli.mjs call stock_data get_stock_basicinfo '{"question":"600519.SH"}' 2>/dev/null | node -e "
  const j = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const updates = (j.notices || []).filter(n => n.type === 'update_available');
  if (updates.length > 0) {
    console.log('upgrade_command:', updates[0].items[0].upgrade_command);
    // 预期: 包含 'npx skills add' 和 'Gitee'
  }
"
```

## 3. 自动化测试覆盖范围

运行命令：

```bash
cd skills/wind-mcp-skill
node tests/update-check.test.mjs   # update-check.mjs 的 25 个测试
node tests/cli.test.mjs             # cli.mjs 的 20+ 个测试
```

### 3.1 update-check.test.mjs 测试矩阵

| 测试组 | 用例数 | 覆盖场景 |
|--------|--------|---------|
| 基础运行 | 4 | exit code=0、缓存 schema v3、正确 skill name、合法 status |
| SKILL_NAME 自动检测 | 2 | 从目录路径推导名称、不同路径产生不同名称 |
| TTL 缓存命中 | 3 | 缓存命中不重请求、过期触发重请求、lockSignature 变化失效 |
| Snooze 保留 | 3 | snoozedUntil 跨写保留、snoozeLevel 保留、静音时无输出 |
| 边界场景 | 4 | 损坏缓存、空缓存、旧 v2 格式、无 lock 条目 |
| Legacy 清理 | 2 | 删除 wind-find-update-state.json、删除 baseline 文件 |
| printNotice 输出 | 5 | update_available 输出版本和命令、Gitee 源用重装命令、transient_error 输出原因、unknown 输出原因、up_to_date 无输出 |
| 统一缓存格式 | 2 | 写入不覆盖其他 skill、多 skill 共存 |
| 文件锁与并发 | 3 | 锁文件正常清除、过期锁自动清理、5 进程并发写缓存仍完整 |
| 缓存命中性能 | 1 | 命中时 < 300ms（无网络请求） |
| installedHash 字段 | 1 | outdated 条目包含 installedHash |

### 3.2 cli.test.mjs 测试矩阵

| 测试组 | 用例数 | 覆盖场景 |
|--------|--------|---------|
| Envelope 结构 | 2 | help 返回 ok:true、成功调用含 data+meta |
| USAGE_ERROR | 4 | 未知命令、无参数、缺 params、setup-key 无参数 |
| UNKNOWN_SERVER_TYPE | 1 | 拒绝无效 server_type |
| UNKNOWN_TOOL_NAME | 1 | 拒绝无效 tool 并返回 available_tools |
| INVALID_PARAMS_JSON | 1 | 拒绝格式错误的 JSON |
| UNKNOWN_SCOPE | 1 | 拒绝无效 scope |
| KEY_INVALID | 1 | 假 key 被后端拒绝 |
| fallback_allowed | 4 | 客户端错误都不允许 fallback |
| Tool manifest | 2 | manifest JSON 有效、覆盖全部 server_type |
| error-codes.json | 1 | 所有错误码含必需字段 |
| 成功调用输出 | 2 | 返回 MCP 原始 result、notices 数组存在 |
| 跨 skill 通知隔离 | 3 | v2 缓存中纯 foreign skill 不泄露、混合时只保留 own |
| 已升级通知抑制 | 2 | installedHash 匹配时保留通知、不匹配时抑制通知 |

### 3.3 自动化测试的局限性

| 场景 | 是否覆盖 | 原因 |
|------|----------|------|
| 真正的远端 SHA 对比 | **部分** | 依赖网络可达 GitHub API，不可达时走 transient_error 分支 |
| `update_available` 完整链路 | **部分** | 缓存被 seed 为 update_available，但并非通过真实 API 检测得出 |
| MCP 后端返回成功数据 | **依赖后端** | 后端不可用时跳过成功路径测试 |
| 多 skill 同时运行 update-check | **已覆盖** | 并发测试写 5 个进程 |
| `installedHash` 字段传递 | **已覆盖** | seed 缓存 + cli.mjs 读缓存的端到端验证 |
| Gitee 源的 API 调用 | **未覆盖** | 测试环境中 sourceUrl 全部是 GitHub |

## 4. 手动篡改速查表

以下是可直接修改的缓存字段及其效果：

```
~/.cache/wind-aifinmarket/update-state.json
├── schemaVersion: 3                          # 改为 2 → 触发 v2→v3 格式升级
├── skills
│   └── wind-mcp-skill
│       ├── status                            # 直接改为目标状态
│       │   ├── "up_to_date"                  #   模拟无更新
│       │   ├── "update_available"            #   模拟有更新
│       │   ├── "transient_error"             #   模拟网络错误
│       │   └── "unknown"                     #   模拟无法判断
│       ├── outdated[]                        # update_available 时必需
│       │   └── {current, latest, sourceUrl, host, installedHash}
│       ├── reason                            # transient_error / unknown 时的原因
│       ├── ttlMs                             # 调小 → 快速过期；调大 → 长期有效
│       ├── lastCheck                         # 改为过去 → 触发过期重检查
│       ├── lockSignature                     # 改为假值 → 触发 lockSignature 失效
│       ├── snoozedUntil                      # 设为未来 → 静音所有通知
│       └── snoozeLevel                       # 静音级别（数值）

~/.agents/.skill-lock.json
└── skills
    └── wind-mcp-skill
        ├── sourceUrl                         # 改为 gitee.com → 测试 Gitee 升级命令
        ├── updatedAt / installedAt           # 改为过去 → 改变反查的 commit 范围
        └── skillFolderHash                   # 改变 → 模拟用户已升级
```

## 5. 网络不可达时的测试策略

在当前环境 GitHub API 不可达，更新检查会走 `transient_error` 路径。要完整测试更新机制：

**方案 A：篡改缓存模拟各状态**（2.3 ~ 2.10 节的方法）
- 无需网络，直接 seed 目标状态到缓存
- 验证 cli.mjs 读取和展示行为
- 验证 filterAlreadyUpgraded 逻辑

**方案 B：配置代理**
```bash
# 如果有 HTTP 代理
export HTTPS_PROXY=http://your-proxy:port
node scripts/update-check.mjs 2>&1
```

**方案 C：mock HTTP 层**
在测试中可以用环境变量或代码注入替换 `fetch`，返回预设的 GitHub API 响应：
- Trees API 返回预设的 tree SHA
- Commits API 返回预设的 commit SHA
- 模拟 rate limit（403/429）
- 模拟超时

## 6. 完整验证清单

手动验证以下端到端场景：

- [ ] **冷启动**：无缓存 → 运行脚本 → 缓存被创建 → exit code 0
- [ ] **缓存命中**：有缓存且新鲜 → 再次运行 → lastCheck 不变 → 无网络请求
- [ ] **缓存过期**：lastCheck 设为过去 → 运行 → lastCheck 被更新
- [ ] **有更新 + 通知展示**：seed update_available → cli call → notices 含 update_available
- [ ] **有更新 + 已升级过滤**：改 installedHash → cli call → notices 无 update_available
- [ ] **Gitee 源**：sourceUrl 改为 gitee → cli call → upgrade_command 为 npx skills add
- [ ] **网络错误**：seed transient_error → cli call → notices 含 update_check_failed
- [ ] **unknown 状态**：seed unknown → cli call → notices 含 update_check_unknown
- [ ] **静音**：设 snoozedUntil → cli call → notices 为空
- [ ] **损坏缓存**：写非法内容 → 脚本不崩溃 → 缓存被重建
- [ ] **Legacy 清理**：创建 v1 残留文件 → 运行脚本 → 文件被删除
- [ ] **跨 skill 隔离**：缓存含其他 skill → cli call → 只展示 wind-mcp-skill 的通知
- [ ] **多 skill 共存**：缓存含多个 skill → 运行脚本 → 其他 skill 条目不被覆盖
- [ ] **并发安全**：同时运行 5 个脚本实例 → 缓存 JSON 完整有效
- [ ] **缓存命中性能**：缓存新鲜时运行 → 耗时 < 300ms
