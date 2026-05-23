# wind-mcp-skill SKILL.md 精简与分层方案

> 目标：减少上下文占用、提升约束精准度、分层加载按需读取。
> 当前 SKILL.md 约 486 行 / ~15K 字，全部加载到上下文消耗较大。

---

## 一、当前描述性缺陷

| # | 位置 | 问题 | 修复建议 |
|---|------|------|----------|
| 1 | 第 2 节 CLI JSON 输出契约（L73-96） | 与第 7 节错误处理大量重复（`error.code` / `retryable` / `agent_action` 的优先级在两处都写了） | 第 2 节只保留「输出格式 + KEY_MISSING 强制动作」，错误处理逻辑统一归第 7 节 |
| 2 | 第 2 节 Shell 转义（L100-113） | 14 行详细表格，仅 Windows 用户需要，且大多数 Agent 不直接操作 shell | 移入 `references/shell-escaping.md`，SKILL.md 只保留 1 句提醒 + 链接 |
| 3 | 第 3 节 行情类段头（L175-177） | 单个 blockquote 超长（~600 字），混合了代码格式参考、歧义处理、windcode 用法 | 拆为 3 条独立约束写入第 5 节表格，段头只留 windcode 说明 |
| 4 | 第 3 节 NL 类重复模板（L233-313） | stock / global_stock / fund / index / bond 五个 NL 段都重复写了 `入参签名` + `question 说明` + `lang 说明`（各 3 行） | 提取一次通用 NL 入参签名，各段只保留工具表 |
| 5 | 第 7 节 wind-alice 终极兜底（L442-467） | 26 行、含安装命令和话术模板，但 90% 调用不会走到这里 | 移入 `references/fallback-alice.md`，SKILL.md 只保留触发条件和一句「按 references/fallback-alice.md 引导」 |
| 6 | 第 6 节使用技巧（L403-417） | 与第 3 节工具描述和第 5 节注意事项高度重叠 | 删除，精华合并入第 3 节各工具描述的「适用场景」句 |
| 7 | 第 1 节数据范围表（L42-51） | 第三列「工具清单」列出所有工具全名，与第 3 节完全重复 | 改为只写工具数量（如「行情 3 + NL 6」），详细清单由第 3 节承载 |

---

## 二、分阶段精简方案

### 阶段 1：消除重复，零风险减量（预计 -120 行）

**改动最小，仅删除/合并重复内容，不改变任何约束。**

| 操作 | 原位置 | 处理方式 |
|------|--------|----------|
| NL 入参签名去重 | L237-241, L254-258, L271-275, L288-292, L303-306 | 在 NL 类段头写一次 `{question, lang?}` 签名，各 server_type 段只保留工具表 |
| 第 6 节使用技巧删除 | L403-417 | 适用场景已写在各工具描述中，技巧表可删 |
| 第 2 节 Shell 转义外移 | L100-113 | 新建 `references/shell-escaping.md`，SKILL.md 留 1 行链接 |
| 第 1 节工具清单列精简 | L42-51 第三列 | 改为「行情 ×3, NL ×6」等简写 |
| 第 2 节错误处理去重 | L82-88 | 删除与第 7 节重复的 error 字段优先级列表，保留格式说明 + KEY_MISSING 强制动作 |

**预计效果**：486 → ~366 行，减 ~24%。

---

### 阶段 2：外移低频内容为 reference 文件（预计再 -100 行）

**将非每次调用必需的内容外移为独立 reference 文件，SKILL.md 只保留索引。**

| 外移内容 | 目标文件 | SKILL.md 保留 |
|----------|----------|---------------|
| wind-alice 终极兜底流程（安装判断、话术、命令） | `references/fallback-alice.md` | 1 句触发条件 + 链接 |
| Codex 沙箱配置 | `references/codex-setup.md` | 1 句提醒 |
| analytics_data 使用要求（透传规则、改写规则） | `references/analytics-rules.md` | 参数表 + 1 句「调用前必读 references/analytics-rules.md」 |
| Shell 转义详表（阶段 1 已外移） | `references/shell-escaping.md` | 同阶段 1 |
| 第 8 节更新提示处理 | `references/update-notices.md` | 1 句「调用后检查 stdout notices，按 references/update-notices.md 处理」 |

**预计效果**：366 → ~266 行，再减 ~27%。累计减 ~45%。

---

### 阶段 3：重组为分层结构（预计最终 ~220 行）

**核心 SKILL.md 只保留路由决策 + 硬约束，工具细节按需加载。**

最终 SKILL.md 结构：

```
## 1. 数据范围与路由（强制）        ← 当前第 1 节精简版 + 路由规则合并
   - 8 个 server_type 一句话能力 + 工具数量
   - 意图判定路由顺序（5 步）
   - 不触发范围 + 数据时效

## 2. 调用方法                      ← 精简到 ~15 行
   - 命令格式
   - 输出契约（ok/error/notices）
   - KEY_MISSING 强制动作（3 行）

## 3. 工具参数表                    ← 去重后的工具表
   - 行情类（3 个签名，共享参数说明 + 1 次 windcode 说明）
   - NL 类（1 次通用签名 + 各 server_type 工具表）
   - financial_docs / economic_data / analytics_data（各 1 小段）
   - 参数表内嵌适用场景（不再单列第 6 节）

## 4. 硬约束表                      ← 当前第 5 节 + 合并散落约束
   - 表格形式，每条 1 行
   - 吸收：windcode 歧义、行业默认万得、indexes 校验、NL 禁空格、字段名不可混用

## references/（按需加载）
   - indicators.md        ← 已有，不变
   - tool-manifest.json   ← 已有，不变
   - error-codes.json     ← 已有，不变
   - shell-escaping.md    ← 新建
   - fallback-alice.md    ← 新建
   - analytics-rules.md   ← 新建
   - update-notices.md    ← 新建
```

**预计效果**：最终 ~220 行，相比原始 486 行减 ~55%。

---

## 三、约束力提升点

| 改进 | 说明 |
|------|------|
| 路由与硬约束前移 | Agent 首先读到路由规则和硬约束表，减少跳过关键约束的概率 |
| 工具表内嵌适用场景 | 每个工具的描述句直接说明「何时用」，Agent 不需要跨节查找 |
| 散落约束合并到第 4 节 | windcode 歧义、行业默认、indexes 校验、NL 禁空格等目前分散在第 3/4/5/6 节，合并为一张表 |
| reference 文件带强制读取标记 | 在需要时明确写「调用此工具前必须 Read references/xxx.md」，比埋在长文中更可靠 |

---

## 四、执行建议

1. **阶段 1** 可立即执行，风险最低，无功能变更。
2. **阶段 2** 在阶段 1 验证无回归后执行，需同步更新 cli.mjs 中可能的错误提示路径。
3. **阶段 3** 在阶段 2 稳定后执行，此时 SKILL.md 已足够短，可做最终结构重组。

每个阶段完成后：提交、推送、用一个真实调用验证 Agent 仍能正确路由和调用。
