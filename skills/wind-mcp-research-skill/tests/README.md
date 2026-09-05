# 测试

```bash
cd skills/wind-mcp-research-skill
export WIND_SKILL_NO_UPDATE=1        # 否则每次 call 成功都会在后台起一次 skill 自更新

node tests/run-offline-tests.mjs          # 契约测试：不发网络，任何环境都能跑
node tests/run-boundary-tests.mjs         # 边界测试：畸形输入 / 协议异常 / 极值入参，默认离线
node tests/run-boundary-tests.mjs --live  # 额外跑真实后端的三组边界（消耗积分）
node scripts/cli.mjs smoke                # 全量冒烟：用注册表里的实测样例逐个调 132 个工具
node scripts/cli.mjs smoke futures        # 只冒烟一个 server
```

## 三层的分工

| 层 | 跑什么 | 什么时候跑 |
| --- | --- | --- |
| `run-offline-tests.mjs` | 参数校验规则、信封形态、SSE/JSON 解析、业务错误嗅探、`find` 排序与零命中语义、自动更新开关、**工具目录的体量上限**、注册表与文档一致性 | 每次改 `scripts/` 或 `references/` 之后 |
| `run-boundary-tests.mjs` | 空/畸形/超长入参、`__proto__`、路径穿越、HTTP 401/429/500、半截 SSE、并发串扰、数组与日期极值 | 改传输层或校验层之后 |
| `cli.mjs smoke` | 132 个工具逐个真实调用 | 改 `annotations.json` 的样例之后，或怀疑后端有变时 |

离线两层用 `tests/mock-fetch.mjs` 顶掉 `globalThis.fetch`，进程内直接调用 `scripts/cli.mjs` 导出的 `main()`，因此断言的是**用户实际看到的 stdout 信封**，不是内部函数返回值。

## 为什么有「目录体量上限」这条测试

`references/<server>.md` 是**目录**，不是完整契约：只有调用要点 + 一张工具表。完整参数表走 `cli.mjs describe <server> <tool>`，按需取单个工具。

之前把全量参数表写进目录，`company.md` 涨到 3.5 万字，而 agent 一次只用其中一个工具的参数。现在测试卡了两条线：单份 ≤ 1 万字、7 份合计 ≤ 4 万字，并且禁止目录里出现 `| 参数 | 必填 |` 表头。**「顺手把文档补全一点」会让这条测试红**，这是故意的。

## 后端变了怎么办

```bash
node scripts/cli.mjs doctor          # 看 Key、7 个 server 连通性、注册表漂移、上次自更新状态
node scripts/cli.mjs diff company    # 只看差异，不写文件
node scripts/cli.mjs refresh company # 拉最新 schema 写回 registry.json 并重生成全部目录
node tests/run-offline-tests.mjs     # 一致性测试会指出哪些样例因改名/改字段失效
```

`refresh` 只覆盖 schema，**不会动 `scripts/annotations.json`** 里的人工内容（server 说明、领域关键词、样例入参、已知故障）。样例因 schema 变动而失效时，`run-offline-tests.mjs` 的「样例本身能通过校验」一项会点名到具体工具。
