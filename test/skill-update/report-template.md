# wind-skills 更新流程测试报告

> 复制本模板填写；建议存到 `test/skill-update/reports/round-<日期>-<env>.md`。

## 1. 环境抬头
- 日期：
- 运行人：
- 操作系统：
- node / npx 版本：
- **Agent host**：（Claude Code / Codex / Cursor / Cline … + 版本）
- GitHub 免认证配额（起跑时 remaining）：
- 网络：直连 / 代理 / 共享出口 IP（是否受限）：
- 被测 skill：wind-mcp-skill（其他：）
- key 是否提供：是 / 否（否 → 通知链未验证）

## 2. 跑了哪些
| 组合 | 是否跑 | 说明 |
|---|---|---|
| GitHub × 全局 | | |
| GitHub × 项目 | | |
| Gitee × 全局 | | |
| Gitee × 项目 | | |
| 手工 OS | | |
| 手工 agent | | |

## 3. 逐项结果
| 组合 | E1 | E2 | E3 | E4 | E5 | E6 | E7 | 关键实际输出 |
|---|---|---|---|---|---|---|---|---|
| GitHub×全局 | | | | | | | | |
| GitHub×项目 | | | | | | | | |
| Gitee×全局 | | | | | | | | |
| Gitee×项目 | | | | | | | | |

手工矩阵结果：见 `manual/os-checklist.md`、`manual/agent-checklist.md` 填写情况。

## 4. 总结论
- 本报告结论仅代表**当前环境 + 当前 agent**：______
- 各组合 P0（E1/E2/E3/E6/E7）是否全 PASS：
- 通知链（E4/E5）是否用真 key 验证过 PASS：
- Gitee 探活是否验证：
- 发现的问题 / 偏差：

### 是否达到发布标准
> 规则：选中组合 P0 全 PASS + 通知链至少一组合真 key PASS + 手工矩阵覆盖目标发布平台。

- [ ] 达标，可发布
- [ ] 有条件达标（说明前提，如"仅 GitHub 源、仅 Linux+Claude Code 验证"）
- [ ] 不达标（列出阻塞项）

结论说明：
