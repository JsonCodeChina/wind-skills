# wind-mcp-skill 更新逻辑测试套件

> **两层测试，看你要测什么：**
> - **真实全链路（推荐，跨机器/跨 agent）** → 读 **[`SKILL.md`](./SKILL.md)**：一个测试 skill，让 agent 交互驱动「真装→真用→真升级」，覆盖 GitHub/Gitee × 全局/项目，逐项结论 + 发布判定。
> - **静态逻辑自检（本目录原有）** → `bash run.sh`：67 个纯函数/子进程单测，不联网、不需 key，CI 用。

这个目录是 wind-mcp-skill **更新检测逻辑**（`scripts/update-check.mjs` + `scripts/cli.mjs` 的更新部分）的测试。按**功能领域**组织（更新逻辑是 3 个 skill 共用的横切功能）；`test/wind-mcp-skill/` 则按 skill 维度测整个 skill 的命令契约。

---

## 快速开始

```bash
# 在仓库任意位置都能跑 (run.sh 自解析仓库根)
bash test/skill-update/run.sh
```

期望输出末尾：

```
✅ 全部通过   (pass 67 / fail 0)
```

**不联网、不需要 WIND_API_KEY** —— 单测 + 集成全用 mock + 临时文件。

---

## 目录结构

```
test/skill-update/
├── run.sh                  ← 测试入口 (自解析仓库根, 任意位置可跑)
├── README.md               ← 本文件
├── unit/                   ← 纯函数单测 (49 用例, 不联网)
│   ├── canonicalize-lock-path.test.mjs   路径规范化 (cache key)
│   ├── derive-source-url.test.mjs        探活 URL 推导 (含 Gitee SSH bug 修复)
│   ├── pending-stale.test.mjs            通知判定 + 探活判定 (TTL)
│   ├── cache-io.test.mjs                 cache 容错 + 并发 only-patch-self
│   ├── etag-304.test.mjs                 ETag/304
│   ├── lazy-gc.test.mjs                  孤儿 entry 清理
│   ├── long-tail.test.mjs                长尾 fallback
│   └── deprecated-exports.test.mjs       旧架构函数不再 export
├── integration/            ← 子进程黑盒 (3 用例, 不联网)
│   └── update-check-subprocess.test.mjs  exit 0 / lockfile 清理 / 并发安全
└── lock-schema/            ← fixture: 4 种 lock 文件实测样本
    ├── case-1-global-github/   (.agents/.skill-lock.json, v3)
    ├── case-2-global-gitee/    (.agents/.skill-lock.json, v3)
    ├── case-3-project-github/  (skills-lock.json, v1)
    └── case-4-project-gitee/   (skills-lock.json, v1)
```

> 命令契约测试在隔壁 `test/wind-mcp-skill/cli.test.mjs`（15 用例），run.sh 默认 mode 也会带上它。

---

## run.sh 用法

```bash
bash test/skill-update/run.sh          # 全部 (unit 49 + integration 3 + cli 15 = 67)
bash test/skill-update/run.sh unit     # 只跑单元 (最快, ~0.2s)
bash test/skill-update/run.sh e2e      # 集成 + 真实探活 GitHub tree API (需网络)

# chmod +x 后可直接执行
./test/skill-update/run.sh
```

退出码：0 = 全过，1 = 有失败（CI 可直接用）。

底层等价的 node:test 原生命令见 `../../docs/skill-update/test-plan.md` §6。

---

## 测试覆盖（67 用例，按行为归类）

| 行为 | 文件 | 用例 | 核心点 |
|---|---|---|---|
| cache key 路径规范化 | canonicalize-lock-path | 5 | 软链接解析 / 降级不抛 / 大小写 |
| 探活 URL 推导 | derive-source-url | 7 | **Gitee SSH 直通不误拼** / v3/v1 |
| 通知 + 探活判定 | pending-stale | 9 | 首次静默基线 / 去重 / TTL 6h / signature |
| cache 容错 + 并发 | cache-io | 6 | 损坏/不存在不抛 / **only-patch-self** |
| ETag/304 | etag-304 | 5 | 200 新 etag / 304 复用 / If-None-Match |
| 孤儿清理 | lazy-gc | 4 | lockPath 不存在删 |
| 长尾 fallback | long-tail | 6 | 14d+10次触发 / 生命周期一次 |
| 旧架构删除 | deprecated-exports | 7 | sentinel/sid/snooze 不再 export |
| 子进程黑盒 | update-check-subprocess | 3 | exit 0 / lockfile / 并发安全 |
| 命令契约 | (wind-mcp-skill/) cli.test | 15 | 错误码 / envelope 结构 |

**4 个核心回归点**（区别于旧版，CI 必跑）：
- 首次见 latestSha 静默写基线（pending-stale）
- Gitee SSH URL 拼接 bug 回归（derive-source-url）
- 并发 only-patch-self（cache-io + integration）
- ETag/304（etag-304）

---

## 换一台机器怎么测

### 依赖

| 依赖 | 用途 | 必需 |
|---|---|---|
| **Node 18+** | `node:test` + global fetch（v20+ 最佳） | ✅ |
| **git** | clone 仓库 | ✅ |
| **bash** | 跑 run.sh（Windows 用 Git Bash / WSL） | ✅ |
| curl | e2e 探活优先用（无则 fetch 兜底） | 可选 |
| 网络 | 仅 `run.sh e2e` 需要 | 仅 e2e |
| WIND_API_KEY | 测试全用 mock + 公开 API | **不需要** |

### 步骤

```bash
# 1. clone dev 仓 (二选一)
git clone https://github.com/JsonCodeChina/wind-skills.git       # GitHub
git clone git@gitee.com:jsonCodeChina/wind-skills.git            # Gitee (国内更稳)

# 2. 进仓库
cd wind-skills

# 3. 跑全部测试 (不联网, 不需 key)
bash test/skill-update/run.sh
#    → ✅ 全部通过 (pass 67 / fail 0)
```

### 注意点

1. **官方仓暂无** —— 现在只能 clone **dev 仓**（`JsonCodeChina` / `jsonCodeChina`）。官方仓（`Wind-Information-Co-Ltd` / `wind_info`）待人工审核推送后才有。
2. **Windows** —— 用 Git Bash 或 WSL 跑 run.sh；其中 Windows 大小写路径那条用例本就要在真 Windows 上验证。
3. **e2e 限流** —— 真实探活走 GitHub 未认证 API（60 次/小时/IP），短时间反复跑会限流 → 探活静默失败（**预期行为，不是 bug**），等约 1 小时恢复。
4. **完全离线机器** —— 单测 + 集成（52 个）照常跑（不联网）；只有 `e2e` 那步会 ⚠️ 静默跳过。

---

## 关联文档

- 设计：`../../docs/skill-update/wind-mcp-skill-update-logic.md`
- 实测：`../../docs/skill-update/lock-schema-test-results.md`
- 测试规划（26 场景矩阵 C1-C26）：`../../docs/skill-update/test-plan.md`
