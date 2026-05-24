---
name: skill-update-test
description: 测试 wind-skills 三个 skill 的「更新流程」是否正确。在目标机器/agent 上交互执行——先问用户要 API Key，列出测试项（GitHub/Gitee × 全局/项目），逐项真实跑（真装→真用→真升级），每项给结论，最后给出"当前环境+agent 下是否达到发布标准"的总结论。当用户说"测一下更新流程""跑一遍 skill 更新测试""验证更新功能能不能发布"时使用。
---

# wind-skills 更新流程测试 skill

这个 skill 让**任意机器上的任意 agent**（Claude Code / Codex / Cursor / Cline …）把 wind-skills 的「更新检测与提示」整条链路真实跑一遍并出结论。它**不是单元测试**——是把真实客户体验（下载 → 使用 → 发现新版 → 升级）在当前环境里复现，用看得见的输出判断更新流程是否有误、能否发布。

> 仅放在开发仓 `test/` 下，**不分发**、不进 `skills/` 目录。

## 这个 skill 测什么 / 不测什么

- **测**：真实 `npx skills add` 安装、首用静默基线、探活真去远端、有新版时 stderr 通知 + 升级命令、去重、真升级、升级后不误报；GitHub 与 Gitee 两个源；全局与项目两种 scope；不同 OS / 不同 agent 的差异。
- **不测**：后端数据正确性、MCP 工具契约（那是 `test/wind-mcp-skill/`）、纯逻辑分支（那是同目录 `run.sh` 的 67 个静态用例，本 skill 视其为"逻辑自检层"，可选附带跑）。

---

## 怎么在目标机器上跑起来

这个 skill 不分发、不能 `npx skills add`。在目标机器上这样拿到并启动：

```bash
# 前置: node ≥18 / git / npx / curl
git clone https://github.com/JsonCodeChina/wind-skills.git   # 或 gitee SSH
cd wind-skills
```

- **方式 A（推荐，agent 驱动）**：在该机器的 agent（Claude Code / Cursor / Codex / Cline）里打开这个仓，对 agent 说"读取 `test/skill-update/SKILL.md`，按它测更新流程"。agent 就按下面的执行流程交互式跑完并出总结论，同时也验证了该 agent 能否把更新提示呈现给用户。
- **方式 B（直接跑脚本，快速/CI）**：
  ```bash
  cd test/skill-update
  WIND_API_KEY=<key> bash e2e/run-e2e.sh --source github --scope global
  # source(github|gitee) × scope(global|project) 四个组合各跑一遍
  # 不给 key: E1/E2/E3/E6 照跑, E4/E5/E7 自动 SKIP
  ```

---

## 执行流程（agent 严格按序，过程要可见）

### 步骤 0 · 前置检查
检查并打印：`node -v`（需 ≥18）、`npx` 是否可用、`git`、`bash`、`curl`。缺任何必需项 → 停下告诉用户怎么装，不要继续。

### 步骤 1 · 向用户要 API Key（必须先问）
原话问用户：

> 本测试的"有新版通知"用例（E4/E5/E7）需要一次**真实成功的 call**，请提供一个 `WIND_API_KEY`（登录 aifinmarket.wind.com.cn 开发者中心获取）。
> - Key 只在本次测试用 env 传入，**绝不写入任何文件**；
> - 测完建议你**轮换这个 key**；
> - 不提供也能测：E1/E2/E3/E6 照常跑，需 key 的用例会自动标 SKIP。

把用户给的 key 存进**当前 shell 的 env 变量 `WIND_API_KEY`**，不要写进文件、不要 echo 出来、不要存进 cache/config。

### 步骤 2 · 探测并打印环境
收集并展示给用户（这些进最终总结论的抬头）：
- 操作系统 + 版本（`uname -a` / Windows 注明）
- `node -v`、npx 版本
- **当前 agent host**：问用户/自报（Claude Code？Codex？Cursor？Cline？版本？）——不同 agent 对 stderr 的渲染不同，必须记下来
- GitHub 免认证配额：`curl -s https://api.github.com/rate_limit | grep -m1 remaining`（提醒：60/hr/IP，共享出口 IP 可能已被占用 → 探活会静默失败，属预期）
- Gitee 可达性

### 步骤 3 · 列出测试项，让用户确认跑哪些
展示矩阵（默认建议全跑）：

| 组合 | 命令 | 含 |
|---|---|---|
| GitHub × 全局 | `--source github --scope global` | E1..E7 |
| GitHub × 项目 | `--source github --scope project` | E1..E7（升级命令应**不带** `-g`）|
| Gitee × 全局 | `--source gitee --scope global` | E1..E7（注意 sha256 hash + 探活可能 404）|
| Gitee × 项目 | `--source gitee --scope project` | E1..E7 |
| 手工 · OS 特性 | `manual/os-checklist.md` | macOS 软链 realpath / Windows 大小写+反斜杠 |
| 手工 · agent 渲染 | `manual/agent-checklist.md` | 当前 agent 是否把 [notice] 完整呈现给用户 |

逐项含义见 `e2e/cases.md`（每个 E1..E7 的步骤 + 期望输出原文）。

### 步骤 4 · 逐组合执行（可见）
对每个用户选中的 source×scope，运行并**把输出实时展示给用户**：

```bash
WIND_API_KEY="$WIND_API_KEY" bash e2e/run-e2e.sh --skill wind-mcp-skill --source <github|gitee> --scope <global|project>
```

脚本每个用例都打印【实际值 / 期望值 / ✅PASS·❌FAIL·⏭️SKIP】。不要吞输出——用户要看见全过程。

### 步骤 5 · 逐项结论表
所有组合跑完，汇总成表（每行一个用例，列出组合、结论、关键实际输出）。

### 步骤 6 · 总结论（用 `report-template.md`）
按模板产出，必须包含：
1. **环境抬头**：OS / node / agent host / 配额
2. **跑了哪些**（哪些组合、哪些 SKIP 及原因）
3. **逐项结果**
4. **是否达到发布标准**（判定规则见下），并明确**这是"当前环境+当前 agent"下的结论**，不代表其他 OS/agent

建议同时把这份报告存一份到 `test/skill-update/reports/round-<日期>-<env>.md` 便于回归对比。

---

## 发布标准（判定规则，写死不含糊）

对**每个 source×scope 组合**：

- **P0 必过**（任一 FAIL = 该组合**不达标**）：`E1 下载` · `E2 首用静默` · `E3 探活真实` · `E6 升级` · `E7 升级后不误报`
- **通知链**（`E4`/`E5`）：有 key 时必过；**无 key 时 SKIP → 总结论必须标注"通知渲染未在本环境验证"**，不能算达标
- **Gitee 探活**：若 E3 在 gitee 下 SKIP（API 404/私有），如实记录为"gitee 探活未验证"，不算 FAIL 但也不算完整达标

**整体达发布标准** = 选中的所有组合 P0 全 PASS + 通知链至少在一个组合用真 key 验证过 PASS + 手工矩阵（OS/agent）至少覆盖目标发布平台。

---

## 已知坑（agent 必读，避免误判）

1. **notice 只在成功 call 上发**：cli.mjs 报错走 `die()` 直接退出，跳过通知。所以 E4/E5/E7 必须用**真 key 成功调**才能看到 notice；KEY_MISSING 的 call 永远不提示（这是已知行为，不是本测试的 bug）。
2. **detached 探活子进程**：真 cli call 触发的探活是 detached 异步的，脚本宿主下可能被进程组回收没跑完——所以 `run-e2e.sh` 在 E2/E3 用**同步直跑 `update-check.mjs`** 建立确定的 cache 状态。"detached 是否在真 agent 宿主存活"属 `manual/agent-checklist.md` 的观察项。
3. **GitHub/Gitee hash 不同**：GitHub 给 40 位 sha1、Gitee 给 64 位 sha256 的 skillFolderHash——探活两边都要能正确比对，跨源测试重点盯这条。
4. **限流**：GitHub 免认证 60/hr/IP，**304 也扣额**（免认证下 ETag 不省配额）。共享出口 IP（企业 NAT）会被占满 → 探活静默失败属预期，不是 FAIL；但要在报告里点明"本环境配额受限，探活结果可能不完整"。
5. **Gitee 安装**：用全 `.git` HTTPS URL（`https://gitee.com/jsonCodeChina/wind-skills.git`），不要用 `owner/repo` 短形式。

---

## 扩展到另外两个 skill
`run-e2e.sh` 顶部有 skill profile。`wind-find-finance-skill`（无 cli.mjs）和 `wind-alice`（入口 `wind-alice.mjs`）的触发/调用方式与 wind-mcp-skill 不同，profile 留了 TODO stub——补上各自的"入口命令 + 样例 call"即可纳入，无需改主流程。

## 关联
- `e2e/cases.md` — 每个用例步骤 + 期望输出原文
- `e2e/run-e2e.sh` — 自动化引擎
- `manual/` — OS × agent 手工矩阵
- `report-template.md` — 总结论模板
- `run.sh` + `unit/` + `integration/` — 静态逻辑自检层（67 用例，可选附带）
