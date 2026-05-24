# 手工 checklist · OS 特性

`run-e2e.sh` 在 Linux 上自动覆盖主链路。以下两条**只能在真实 OS 上验证**，因为涉及平台相关的路径行为。在目标 OS 上跑完 e2e 后，人工补这张表。

| 项 | OS | 怎么验 | 期望 | 结果（PASS/FAIL/NA） | 备注 |
|---|---|---|---|---|---|
| M-OS1 软链 realpath | macOS | 把 skill 装在软链路径下，再用真实路径各调一次 cli call | 两次解析到**同一个 cache key**（不产生重复 entry / 不重复通知） | | `canonicalizeLockPath` 走 `fs.realpathSync.native` |
| M-OS2 大小写+反斜杠 | Windows | 用 `C:\X` 与 `c:\x`、正反斜杠混写路径各调一次 | 规范化为同一 cache key（Windows 大小写不敏感 + 反斜杠归一） | | 只能在真 Windows 验，`.toLowerCase()` 分支 |
| M-OS3 安装/升级 | macOS / Windows | `npx skills add` / `update` 全局 + 项目 | exit 0，lock 落地 | | Windows 用 Git Bash / WSL 跑 run-e2e.sh |

> macOS / Windows 物理机找同事跑。填完把本表附进总结论报告。
