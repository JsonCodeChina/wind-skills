# 手工 checklist · agent 渲染

更新提示走 **stderr**。不同 agent host 对子进程 stderr 的处理不同——有的完整呈现给用户，有的吞掉，有的混进 stdout。这决定了客户到底**看不看得见**更新提示，必须在每个目标 agent 上真验一次。

前置：先在该 agent 所在机器上跑通 `e2e/run-e2e.sh`（拿到一个 pending 状态），然后在**该 agent 内**真实触发一次成功的 `cli call`，观察 agent 是否把 `[notice]` 那几行呈现给用户。

| 项 | Agent | 怎么验 | 期望 | 结果 | 备注 |
|---|---|---|---|---|---|
| M-AG1 | Claude Code | agent 内调一次成功 call（cache 处于 pending） | 用户能看到 `[notice] … 升级命令 …` | | |
| M-AG2 | Codex | 同上 | stderr 不被吞 | | |
| M-AG3 | Cursor | 同上 | stderr 完整呈现 | | |
| M-AG4 | Cline | 同上 | stderr 完整呈现 | | |
| M-AG5 detached 存活 | 任一 | 成功 call 后立刻看 `~/.cache/wind-aifinmarket/update-state.json` 是否被 detached 子进程刷新 | entry 的 `lastCheckedAt` 被更新（说明 detached 探活在该宿主存活） | | 脚本里这步用同步探活兜底；这里验真宿主行为 |
| M-AG6 超时 | 任一 | 断网/超时下调 call | 主结果正常返回，无报错、无卡顿（探活 5s abort 静默失败） | | |

> 每验一个 agent，记下 agent 名 + 版本。填完附进总结论报告。
