---
name: push-dev-repos
description: 把本地 wind-skills 的改动推到开发仓（GitHub bobibobu/wind-skills 的 main 分支），并可选开 PR 到上游 JsonCodeChina/wind-skills:main。用户说"推送开发仓 / 推到 bobibobu / 提 PR 到 JsonCode"等触发本 skill。
---

# 推送开发仓 + 提 PR 到上游

## 触发时机

- "推送开发仓"
- "推到 bobibobu / 推 GitHub"
- "提 PR 到 JsonCodeChina / 提 PR 到上游"
- "同步本地改动到 GitHub"

## 仓库与权限

| 远端 | 角色 | 当前 PAT 写权限 |
|---|---|---|
| `origin` (Gitea `gitea.wind.com.cn/jhuan.jerry/wind-skills`) | 内网镜像 | ❌ 跳过 |
| `bobibobu/wind-skills` (GitHub) | 个人 fork / 开发仓 | ✅ 直推 |
| `JsonCodeChina/wind-skills` (GitHub) | 上游主仓 | ❌ 走 PR |

## 凭证

PAT 文件：`/home/wind/ybyu/github-token.txt`（600 权限，归属 GitHub 用户 `bobibobu`）。

```bash
TOKEN=$(cat /home/wind/ybyu/github-token.txt)
```

⚠️ Token 不写入 `git config` / `git remote` URL，每次 push / API 用 inline URL 一次性带入；用完不残留。

## 执行流程

### Step 0 — 确认本地状态

```bash
cd /home/wind/ybyu/wind-skills
git status --short
git log --oneline -3
```

若有未提交改动，先与用户确认 commit message 再 `git add` + `git commit`。

### Step 1 — fetch bobibobu/main 防冲突

```bash
TOKEN=$(cat /home/wind/ybyu/github-token.txt)
git fetch "https://x-access-token:$TOKEN@github.com/bobibobu/wind-skills.git" main
git log --oneline FETCH_HEAD ^master   # 远端是否有本地没的
git log --oneline master ^FETCH_HEAD   # 本地领先几个
```

### Step 2 — 如远端前进 → rebase

```bash
git rebase FETCH_HEAD
```

冲突时停下问用户决策，**不擅自选边**。

### Step 3 — fast-forward push 到 bobibobu/main

```bash
TOKEN=$(cat /home/wind/ybyu/github-token.txt)
git push "https://x-access-token:$TOKEN@github.com/bobibobu/wind-skills.git" master:refs/heads/main
```

**绝不用 `--force`**。被拒就回 Step 1 重新 fetch + rebase。

### Step 4 — 验证

```bash
TOKEN=$(cat /home/wind/ybyu/github-token.txt)
curl -s -H "Authorization: token $TOKEN" \
  https://api.github.com/repos/bobibobu/wind-skills/branches/main \
  | grep -E '"name"|"sha"' | head -2
```

`sha` 应等于本地 `git rev-parse master`。

### Step 5 — 询问是否开 PR 到 JsonCodeChina

不要默认开。问用户："要顺便提 PR 到 JsonCodeChina/wind-skills:main 吗？"

要开就调 API（title / body 跟用户确认或基于本次 commits 起草）：

```bash
TOKEN=$(cat /home/wind/ybyu/github-token.txt)
curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "title": "<简洁标题,< 70 字>",
    "head": "bobibobu:main",
    "base": "main",
    "body": "## Summary\n- <bullet 1>\n- <bullet 2>\n\n## Notes\n<可选>"
  }' \
  https://api.github.com/repos/JsonCodeChina/wind-skills/pulls \
  | grep -E '"html_url"|"number"|"state"' | head -3
```

返回的 `html_url` 给用户，由有上游写权限的人手动合（PR 永远不会因为无冲突自动合）。

## 常见陷阱

| 现象 | 原因 / 解法 |
|---|---|
| `[rejected] fetch first` | 远端有 GitHub UI 上的手动 commit（如 README 编辑），按 Step 1-2 fetch + rebase |
| `pre-receive hook declined` 推 origin | Gitea 的 `ybyu.yuyanbo` 没写权限，跳过 origin 不推 |
| 401 Unauthorized | PAT 失效或被撤销，让用户重新生成贴一个 |
| 403 推 JsonCodeChina | bobibobu 不是 collaborator，**只能走 PR**，不要硬推 |
| PR "There isn't anything to compare" | 两侧无共同祖先，需要本地 merge `--allow-unrelated-histories` 后再开 PR |

## 不要做

- 不要 `git push --force` 任何分支
- 不要把 token 写进 `git config` / remote URL / 任何文件
- 不要默认提 PR（先问用户）
- 不要碰 `skills/buffett`（已删除，确保它不复活）
