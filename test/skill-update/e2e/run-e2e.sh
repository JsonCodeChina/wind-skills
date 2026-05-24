#!/usr/bin/env bash
# wind-skills 更新流程 · 真实全链路 e2e 引擎
# 一个 source×scope 组合跑一遍 E1..E7, 每项打印【实际/期望/结论】, 退出码反映结果。
# 全程隔离 HOME, 不碰真实环境; key 只走 env, 绝不落盘。
#
# 用法:
#   WIND_API_KEY=<key> bash run-e2e.sh --source github --scope global [--skill wind-mcp-skill]
#   bash run-e2e.sh --source gitee --scope project           # 无 key: 需 key 的用例自动 SKIP
#
# 由 SKILL.md 编排逐组合调用; 也可单独跑。

set -u

# ───────────── 参数 ─────────────
SKILL="wind-mcp-skill"; SOURCE="github"; SCOPE="global"
while [ $# -gt 0 ]; do
  case "$1" in
    --skill)  SKILL="$2";  shift 2;;
    --source) SOURCE="$2"; shift 2;;
    --scope)  SCOPE="$2";  shift 2;;
    *) echo "未知参数: $1"; exit 2;;
  esac
done

# ───────────── skill profile (扩展 3 个 skill 只改这里) ─────────────
# github_repo | gitee_url | 一个能成功的样例 call (server_type tool params_json)
case "$SKILL" in
  wind-mcp-skill)
    GH_REPO="JsonCodeChina/wind-skills"
    GT_URL="https://gitee.com/jsonCodeChina/wind-skills.git"
    SAMPLE_CALL=(call stock_data get_stock_basicinfo '{"question":"600519.SH公司基本档案"}')
    HAS_CLI=1 ;;
  wind-find-finance-skill)
    GH_REPO="JsonCodeChina/wind-skills"
    GT_URL="https://gitee.com/jsonCodeChina/wind-skills.git"
    SAMPLE_CALL=()        # TODO: find-finance 无 cli.mjs, 触发探活方式不同, 待补 profile
    HAS_CLI=0 ;;
  wind-alice)
    GH_REPO="JsonCodeChina/wind-skills"
    GT_URL="https://gitee.com/jsonCodeChina/wind-skills.git"
    SAMPLE_CALL=()        # TODO: wind-alice 主入口 wind-alice.mjs, 待补 profile
    HAS_CLI=0 ;;
  *) echo "未知 skill: $SKILL"; exit 2;;
esac

if [ "$HAS_CLI" != "1" ]; then
  echo "⚠️  [$SKILL] profile 未就绪 (该 skill 触发/调用方式与 wind-mcp-skill 不同, 待补)。本版仅 wind-mcp-skill 可跑。"
  exit 3
fi

case "$SOURCE" in
  github) ADD_TARGET="$GH_REPO" ;;
  gitee)  ADD_TARGET="$GT_URL" ;;
  *) echo "未知 source: $SOURCE"; exit 2;;
esac

# ───────────── 环境 ─────────────
H=$(mktemp -d "/tmp/wind-e2e.${SKILL}.${SOURCE}.${SCOPE}.XXXXXX")
PROJ="$H/proj"; mkdir -p "$PROJ"
CACHE="$H/.cache/wind-aifinmarket/update-state.json"
cleanup() { rm -rf "$H"; }
trap cleanup EXIT

PASS=0; FAIL=0; SKIP=0
hdr()  { printf '\n──────── %s ────────\n' "$1"; }
ok()   { PASS=$((PASS+1)); printf '  ✅ PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  ❌ FAIL  %s\n' "$1"; }
skip() { SKIP=$((SKIP+1)); printf '  ⏭️  SKIP  %s\n' "$1"; }
show() { printf '     %s\n' "$1"; }   # 可见: 打印实际/期望

echo "═══════════════════════════════════════════════════════════"
echo " e2e: skill=$SKILL  source=$SOURCE  scope=$SCOPE"
echo " 隔离 HOME=$H   node=$(node -v 2>/dev/null)"
echo "═══════════════════════════════════════════════════════════"

# cache 字段读/注入小工具 (node, 不依赖 jq)
cache_get() { HOME="$H" node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1]));const e=c.entries[process.argv[2]]||{};console.log(e[process.argv[3]]??"")' "$CACHE" "$CKEY" "$1" 2>/dev/null; }
cache_set() { HOME="$H" node -e 'const f=process.argv[1],k=process.argv[2];const c=JSON.parse(require("fs").readFileSync(f));c.entries[k]=c.entries[k]||{};c.entries[k][process.argv[3]]=process.argv[4];require("fs").writeFileSync(f,JSON.stringify(c,null,2))' "$CACHE" "$CKEY" "$1" "$2"; }
cache_del() { HOME="$H" node -e 'const f=process.argv[1],k=process.argv[2];const c=JSON.parse(require("fs").readFileSync(f));if(c.entries[k])delete c.entries[k][process.argv[3]];require("fs").writeFileSync(f,JSON.stringify(c,null,2))' "$CACHE" "$CKEY" "$1"; }
gh_quota() { curl -s "https://api.github.com/rate_limit" 2>/dev/null | grep -m1 '"remaining"' | grep -oE '[0-9]+' || echo "?"; }

# ═════════ E1: 真实下载 ═════════
hdr "E1 真实下载 (npx skills add, $SOURCE, $SCOPE)"
if [ "$SCOPE" = "global" ]; then
  ( cd "$H" && HOME="$H" timeout 180 npx -y skills add "$ADD_TARGET" --skill "$SKILL" -g -y ) >/dev/null 2>&1
else
  ( cd "$PROJ" && HOME="$H" timeout 180 npx -y skills add "$ADD_TARGET" --skill "$SKILL" -y ) >/dev/null 2>&1
fi
INSTALL_RC=$?
LOCK=$(find "$H/.agents" "$PROJ" -name ".skill-lock.json" -o -name "skills-lock.json" 2>/dev/null | head -1)
CLI=$(find "$H/.agents" "$PROJ" -path "*${SKILL}/scripts/cli.mjs" 2>/dev/null | head -1)
UPD=$(find "$H/.agents" "$PROJ" -path "*${SKILL}/scripts/update-check.mjs" 2>/dev/null | head -1)
if [ "$INSTALL_RC" = "0" ] && [ -n "$LOCK" ] && [ -n "$CLI" ]; then
  LOCK_CANON=$(HOME="$H" node -e 'console.log(require("fs").realpathSync(process.argv[1]))' "$LOCK" 2>/dev/null || echo "$LOCK")
  CKEY="${SKILL}|${LOCK_CANON}"
  LVER=$(HOME="$H" node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).version)' "$LOCK")
  LSRC=$(HOME="$H" node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1])).skills[process.argv[2]];console.log(s.sourceUrl||s.source)' "$LOCK" "$SKILL")
  show "lock=$LOCK  (schema v$LVER)"
  show "source=$LSRC"
  ok "E1 下载 — lock 落地, cli.mjs 到位"
else
  bad "E1 下载失败 (rc=$INSTALL_RC, lock=${LOCK:-无}, cli=${CLI:-无}) — 后续依赖安装, 中止本组合"
  echo; echo "结果: pass=$PASS fail=$FAIL skip=$SKIP"; exit 1
fi

# ═════════ E2: 首用静默基线 ═════════
hdr "E2 首用静默基线"
OUT=$(mktemp); ERR=$(mktemp)
( cd "$(dirname "$CLI")" && HOME="$H" node "$CLI" "${SAMPLE_CALL[@]}" ) 1>"$OUT" 2>"$ERR" || true
if [ ! -s "$ERR" ]; then ok "E2a 首跑 stderr 空 (无 notice)"; else bad "E2a 首跑 stderr 非空: $(cat "$ERR")"; fi
# 显式同步探活建立基线 (detached 子进程在脚本宿主下不保证跑完, 见 cases.md 说明)
( cd "$(dirname "$UPD")" && HOME="$H" node "$UPD" ) >/dev/null 2>&1 || true
LSHA=$(cache_get latestSha); NSHA=$(cache_get lastNotifiedSha)
show "latestSha=$LSHA"; show "lastNotifiedSha=$NSHA"
if [ -n "$LSHA" ] && [ "$LSHA" = "$NSHA" ]; then ok "E2b 基线写入 latestSha==lastNotifiedSha (不 pending)"; else bad "E2b 基线异常 (latest=$LSHA notified=$NSHA)"; fi
rm -f "$OUT" "$ERR"

# ═════════ E3: 探活真实性 ═════════
hdr "E3 探活真实性 (真去远端拉, 非回显)"
Q0=$(gh_quota)
cache_set latestSha "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
cache_set lastNotifiedSha "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
cache_del etag
cache_set lastCheckedAt "2020-01-01T00:00:00.000Z"
( cd "$(dirname "$UPD")" && HOME="$H" node "$UPD" ) >/dev/null 2>&1 || true
LSHA2=$(cache_get latestSha); Q1=$(gh_quota)
show "探活后 latestSha=$LSHA2  (注入的假值=deadbeef…)"
show "GitHub 配额 $Q0 → $Q1"
if [ -n "$LSHA2" ] && [ "$LSHA2" != "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" ]; then
  ok "E3 探活真实 — latestSha 被远端真值覆盖 (非回显假值)"
else
  if [ "$SOURCE" = "gitee" ]; then skip "E3 gitee 探活未更新 latestSha (gitee API 可能 404/私有, 见 cases.md) — 真实记录"; else bad "E3 探活未拉到远端真值 (仍为假值/空)"; fi
fi

# ═════════ E4: 有新版通知 (方案A, 需 key) ═════════
hdr "E4 有新版通知 (方案A: 拨旧 lastNotifiedSha 造 pending)"
cache_set lastNotifiedSha "0000000000000000000000000000000000000000"
EXPECT_FLAG=$([ "$SCOPE" = "global" ] && echo " -g" || echo "")
# 升级命令按源不同: gitee 的 `update` 解析不了源, 故给完整 `add <gitee-url>` (见 buildUpgradeCommand)
if [ "$SOURCE" = "gitee" ]; then
  EXPECT_CMD="npx skills add ${GT_URL} --skill ${SKILL}${EXPECT_FLAG} -y"
else
  EXPECT_CMD="npx skills update ${SKILL}${EXPECT_FLAG} -y"
fi
if [ -z "${WIND_API_KEY:-}" ]; then
  skip "E4 需成功 call (notice 只在成功 call 上发) → 缺 WIND_API_KEY, 跳过。期望应为: [notice] + $EXPECT_CMD"
else
  OUT=$(mktemp); ERR=$(mktemp)
  ( cd "$(dirname "$CLI")" && HOME="$H" WIND_API_KEY="$WIND_API_KEY" node "$CLI" "${SAMPLE_CALL[@]}" ) 1>"$OUT" 2>"$ERR" || true
  show "stdout(首行)=$(head -c 120 "$OUT")"
  show "stderr 实际:"; sed 's/^/        /' "$ERR"
  show "期望含: [notice] + $EXPECT_CMD"
  if grep -q "\[notice\]" "$ERR" && grep -qF "$EXPECT_CMD" "$ERR"; then
    ok "E4 通知 — stderr 出 [notice] + 正确升级命令 (scope 对)"
  else
    bad "E4 通知缺失或升级命令错 (期望 $EXPECT_CMD)"
  fi
  rm -f "$OUT" "$ERR"
fi

# ═════════ E5: 去重 ═════════
hdr "E5 去重 (同版本不重复通知)"
if [ -z "${WIND_API_KEY:-}" ]; then
  skip "E5 需成功 call → 缺 WIND_API_KEY"
else
  ERR=$(mktemp)
  ( cd "$(dirname "$CLI")" && HOME="$H" WIND_API_KEY="$WIND_API_KEY" node "$CLI" "${SAMPLE_CALL[@]}" ) 1>/dev/null 2>"$ERR" || true
  if [ ! -s "$ERR" ]; then ok "E5 去重 — 二次 call stderr 空"; else bad "E5 仍重复通知: $(cat "$ERR")"; fi
  rm -f "$ERR"
fi

# ═════════ E6: 真升级 ═════════
hdr "E6 真升级 (npx skills update)"
if [ "$SCOPE" = "global" ]; then
  ( cd "$H" && HOME="$H" timeout 120 npx -y skills update "$SKILL" -g -y ) >/dev/null 2>&1; URC=$?
else
  ( cd "$PROJ" && HOME="$H" timeout 120 npx -y skills update "$SKILL" -y ) >/dev/null 2>&1; URC=$?
fi
show "update exit=$URC"
if [ "$URC" = "0" ]; then ok "E6 升级命令执行成功 (exit 0)"; else bad "E6 升级失败 (exit $URC)"; fi

# ═════════ E7: 升级后不误报 ═════════
hdr "E7 升级后不误报"
if [ -z "${WIND_API_KEY:-}" ]; then
  skip "E7 需成功 call → 缺 WIND_API_KEY"
else
  ERR=$(mktemp)
  ( cd "$(dirname "$CLI")" && HOME="$H" WIND_API_KEY="$WIND_API_KEY" node "$CLI" "${SAMPLE_CALL[@]}" ) 1>/dev/null 2>"$ERR" || true
  if [ ! -s "$ERR" ]; then ok "E7 升级后 stderr 空 (无误报)"; else bad "E7 升级后误报: $(cat "$ERR")"; fi
  rm -f "$ERR"
fi

# ───────────── 本组合小结 ─────────────
echo
echo "═══════════════════════════════════════════════════════════"
echo " 组合结果  [$SKILL · $SOURCE · $SCOPE]   pass=$PASS  fail=$FAIL  skip=$SKIP"
echo "═══════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
