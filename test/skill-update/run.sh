#!/usr/bin/env bash
# wind-mcp-skill 更新逻辑测试套件
# 在任何位置都能跑 — 脚本自动定位仓库根 (跟随软链接)
#
# 用法:
#   bash <任意路径>/run.sh          跑全部自动化测试 (unit + integration + cli)
#   bash <任意路径>/run.sh unit     只跑单元测试 (P0+P1)
#   bash <任意路径>/run.sh e2e      额外跑真实网络 e2e (探活 GitHub tree API)
#   ./run.sh                        (chmod +x 后可直接执行)
set -uo pipefail

# ── 自解析位置: run.sh 在 test/skill-update/, 仓库根 = 上两级 ──
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

command -v node >/dev/null 2>&1 || { echo "✗ 需要 Node 18+ (node:test 内置)"; exit 1; }

MODE="${1:-all}"
FAIL=0
PASS_TOTAL=0
FAIL_TOTAL=0

run() {
  local label="$1"; shift
  echo "━━━━━━━━━━━━━━━ $label ━━━━━━━━━━━━━━━"
  local out rc p f
  out="$(node --test "$@" 2>&1)"; rc=$?
  echo "$out" | grep -E "^# (tests|pass|fail)" || true
  p=$(printf '%s\n' "$out" | grep -oE "^# pass [0-9]+" | grep -oE "[0-9]+$" || echo 0)
  f=$(printf '%s\n' "$out" | grep -oE "^# fail [0-9]+" | grep -oE "[0-9]+$" || echo 0)
  PASS_TOTAL=$((PASS_TOTAL + ${p:-0}))
  FAIL_TOTAL=$((FAIL_TOTAL + ${f:-0}))
  [ "$rc" -ne 0 ] && FAIL=1
  echo ""
}

# 真实网络 e2e: 用临时 HOME 隔离, 跑 update-check.mjs 真探活 GitHub tree API (公开, 不需 key)
e2e_smoke() {
  echo "━━━━━━━━━━━━━━━ e2e: 真实探活 GitHub tree API ━━━━━━━━━━━━━━━"
  local E2E; E2E="$(mktemp -d)"
  mkdir -p "$E2E/.agents"
  cat > "$E2E/.agents/.skill-lock.json" <<'JSON'
{ "version": 3, "skills": { "wind-mcp-skill": {
  "source": "Wind-Information-Co-Ltd/wind-skills", "sourceType": "github",
  "sourceUrl": "https://github.com/Wind-Information-Co-Ltd/wind-skills.git",
  "skillPath": "skills/wind-mcp-skill/SKILL.md",
  "skillFolderHash": "x", "installedAt": "2026-05-20T00:00:00.000Z", "updatedAt": "2026-05-20T00:00:00.000Z" } } }
JSON
  HOME="$E2E" timeout 30 node "$REPO_ROOT/skills/wind-mcp-skill/scripts/update-check.mjs" 2>/dev/null
  local cache="$E2E/.cache/wind-aifinmarket/update-state.json"
  if [ -f "$cache" ] && grep -q latestSha "$cache"; then
    echo "✅ 真实探活成功, cache 写入 latestSha + etag"
  else
    echo "⚠️  探活未写 cache (可能网络不通 api.github.com — 静默失败是预期行为)"
  fi
  rm -rf "$E2E"
  echo ""
}

echo "wind-skills 更新逻辑测试 (mcp + alice + find-finance)  |  仓库: $REPO_ROOT  |  $(node --version)"
echo ""

case "$MODE" in
  unit)
    run "单元测试 (P0+P1)" test/skill-update/unit/
    ;;
  e2e)
    run "集成测试 (子进程黑盒)" test/skill-update/integration/
    e2e_smoke
    ;;
  all|*)
    run "单元测试 (P0+P1)" test/skill-update/unit/
    run "集成测试 (子进程黑盒)" test/skill-update/integration/
    run "命令契约测试" test/wind-mcp-skill/cli.test.mjs
    run "wind-alice 更新通知 (v1)" test/wind-alice/
    ;;
esac

echo "═══════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 全部通过   (pass $PASS_TOTAL / fail $FAIL_TOTAL)"
else
  echo "❌ 有失败     (pass $PASS_TOTAL / fail $FAIL_TOTAL)"
fi
exit $FAIL
