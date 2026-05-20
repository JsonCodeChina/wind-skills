// sentinel 机制单测: ppid-based session 标识 + stderr 一次性通知 + mtime 时效
//
// 同 ppid 反复调用 → 第一次 stderr 出, 后续静默
// 模拟换 ppid (删 sentinel) → 重新允许提示
// sentinel mtime > 24h → 视为过期, 重新允许提示
// sentinel mtime > 7d → 启动清理时被删除

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, statSync, utimesSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';

const SKILL_DIR = '/home/wind/ybyu/wind-skills/skills/wind-mcp-skill';
const CACHE_DIR = join(homedir(), '.cache', 'wind-aifinmarket');
const CACHE_FILE = join(CACHE_DIR, 'update-state.json');

// 备份
let savedCache = null;
if (existsSync(CACHE_FILE)) savedCache = readFileSync(CACHE_FILE, 'utf8');

function writeCache(obj) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2));
}
function clearSentinels() {
  if (!existsSync(CACHE_DIR)) return;
  for (const n of readdirSync(CACHE_DIR)) {
    if (n.startsWith('failure-shown-')) {
      try { unlinkSync(join(CACHE_DIR, n)); } catch {}
    }
  }
}
function captureStderr(fn) {
  let captured = '';
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (c) => { captured += c; return true; };
  try { fn(); } finally { process.stderr.write = orig; }
  return captured;
}

// 每次 dynamic import 加 timestamp 防 module 缓存
async function loadCli() {
  const url = `file://${join(SKILL_DIR, 'scripts', 'cli.mjs')}?t=${Date.now()}_${Math.random()}`;
  return await import(url);
}

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); fail++; }
}

// 构造一个 cache state, 让 update-check 探针 cache-hit 不会覆盖(用未来 lastCheck + 大 TTL)
function makeFreshFailureCache(status = 'transient_error', reason = 'network') {
  return {
    schemaVersion: 3,
    skills: {
      'wind-mcp-skill': {
        status, reason, ttlMs: 86_400_000,
        lockSignature: 'fake-sig',
        lastCheck: new Date().toISOString(),
      },
    },
  };
}

console.log('\n=== T1: 同 ppid 同 cache 反复调用,只第一次出 stderr ===');

await test('第一次 maybeNotifyFailureOnce → stderr 出', async () => {
  clearSentinels();
  writeCache(makeFreshFailureCache('transient_error', 'network'));
  const mod = await loadCli();
  const stderr = captureStderr(() => mod.maybeNotifyFailureOnce());
  assert.ok(stderr.includes('[wind-skills] 更新检测失败'), `期望 stderr 出,实际: ${JSON.stringify(stderr)}`);
  assert.ok(stderr.includes('reason=network'));
  // sentinel 文件应存在
  assert.ok(existsSync(mod.sentinelPath()), 'sentinel 应已创建');
});

await test('第二次同 cache 调用 → stderr 静默', async () => {
  // 不清 sentinel, cache 仍是 failure
  writeCache(makeFreshFailureCache('transient_error', 'network'));
  const mod = await loadCli();
  const stderr = captureStderr(() => mod.maybeNotifyFailureOnce());
  assert.equal(stderr, '', `第二次应静默,实际: ${JSON.stringify(stderr)}`);
});

await test('第三次 + 不同 reason → 仍然静默(sentinel 占主导)', async () => {
  writeCache(makeFreshFailureCache('unknown', 'lock_missing'));
  const mod = await loadCli();
  const stderr = captureStderr(() => mod.maybeNotifyFailureOnce());
  assert.equal(stderr, '');
});

console.log('\n=== T2: 删 sentinel 模拟新会话 → 重新允许 ===');

await test('删 sentinel 后再调用 → stderr 重新出', async () => {
  clearSentinels();
  writeCache(makeFreshFailureCache('transient_error', 'rate_limit'));
  const mod = await loadCli();
  const stderr = captureStderr(() => mod.maybeNotifyFailureOnce());
  assert.ok(stderr.includes('reason=rate_limit'));
});

console.log('\n=== T3: sentinel mtime > 24h → 视为过期 ===');

await test('sentinel 文件 mtime 改成 25h 前 → stderr 重新出 + sentinel 被 touch 回当前', async () => {
  clearSentinels();
  // 先创建 sentinel
  writeCache(makeFreshFailureCache('transient_error'));
  let mod = await loadCli();
  captureStderr(() => mod.maybeNotifyFailureOnce());
  const sentinel = mod.sentinelPath();
  assert.ok(existsSync(sentinel));

  // 把 sentinel mtime 改成 25h 前
  const past = new Date(Date.now() - 25 * 60 * 60 * 1000);
  utimesSync(sentinel, past, past);
  const stBefore = statSync(sentinel);
  assert.ok(Date.now() - stBefore.mtimeMs > 24 * 60 * 60 * 1000);

  // 再调用 → 应视为过期, stderr 重新出
  writeCache(makeFreshFailureCache('transient_error', 'timeout'));
  mod = await loadCli();
  const stderr = captureStderr(() => mod.maybeNotifyFailureOnce());
  assert.ok(stderr.includes('reason=timeout'), `mtime 过期后应重新出,实际: ${JSON.stringify(stderr)}`);

  // sentinel mtime 应被 touch 回当前(新一轮 24h 计时)
  const stAfter = statSync(sentinel);
  assert.ok(Date.now() - stAfter.mtimeMs < 60_000, 'sentinel mtime 应被刷新');
});

console.log('\n=== T4: 成功 (up_to_date) → stderr 不出 ===');

await test('cache 是 up_to_date → 不触发 stderr', async () => {
  clearSentinels();
  writeCache({
    schemaVersion: 3,
    skills: {
      'wind-mcp-skill': {
        status: 'up_to_date', ttlMs: 3_600_000,
        lockSignature: 'fake', lastCheck: new Date().toISOString(),
      },
    },
  });
  const mod = await loadCli();
  const stderr = captureStderr(() => mod.maybeNotifyFailureOnce());
  assert.equal(stderr, '');
  // sentinel 不应被创建
  assert.equal(existsSync(mod.sentinelPath()), false);
});

await test('cache 是 update_available → 不触发 stderr (notice 走 stdout 通道)', async () => {
  clearSentinels();
  writeCache({
    schemaVersion: 3,
    skills: {
      'wind-mcp-skill': {
        status: 'update_available',
        outdated: [{ name: 'wind-mcp-skill', current: 'a', latest: 'b',
          sourceUrl: 'https://github.com/x/y.git' }],
        ttlMs: 43_200_000, lockSignature: 'fake',
        lastCheck: new Date().toISOString(),
      },
    },
  });
  const mod = await loadCli();
  const stderr = captureStderr(() => mod.maybeNotifyFailureOnce());
  assert.equal(stderr, '');
});

console.log('\n=== T5: snooze 期间不出 ===');

await test('snoozedUntil 在未来 → 失败 stderr 也静默', async () => {
  clearSentinels();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  writeCache({
    schemaVersion: 3,
    skills: {
      'wind-mcp-skill': {
        status: 'transient_error', reason: 'network', ttlMs: 300_000,
        snoozedUntil: future,
        lockSignature: 'fake', lastCheck: new Date().toISOString(),
      },
    },
  });
  const mod = await loadCli();
  const stderr = captureStderr(() => mod.maybeNotifyFailureOnce());
  assert.equal(stderr, '');
});

console.log('\n=== T6: cleanupStaleSentinels 清理 mtime > 7d ===');

await test('放置 5d / 8d / 30d 三个 sentinel → 仅 8d/30d 被删', async () => {
  clearSentinels();
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const p5 = join(CACHE_DIR, 'failure-shown-99991');
  const p8 = join(CACHE_DIR, 'failure-shown-99992');
  const p30 = join(CACHE_DIR, 'failure-shown-99993');
  for (const p of [p5, p8, p30]) writeFileSync(p, '');
  utimesSync(p5, new Date(Date.now() - 5 * 86400_000), new Date(Date.now() - 5 * 86400_000));
  utimesSync(p8, new Date(Date.now() - 8 * 86400_000), new Date(Date.now() - 8 * 86400_000));
  utimesSync(p30, new Date(Date.now() - 30 * 86400_000), new Date(Date.now() - 30 * 86400_000));

  const mod = await loadCli();
  mod.cleanupStaleSentinels();

  assert.ok(existsSync(p5), '5d 旧的应保留');
  assert.equal(existsSync(p8), false, '8d 应删除');
  assert.equal(existsSync(p30), false, '30d 应删除');
  // 清理掉自己留下的
  if (existsSync(p5)) unlinkSync(p5);
});

console.log('\n=== T7: stdout envelope 完全不含失败信号 ===');

await test('collectUpdateNotices: transient_error → 空数组 (确认未回归)', async () => {
  writeCache(makeFreshFailureCache('transient_error'));
  const { collectUpdateNotices } = await loadCli();
  assert.deepEqual(collectUpdateNotices(), []);
});

await test('cli.mjs 不再 export collectUpdateFailureMeta(已废弃)', async () => {
  const mod = await loadCli();
  assert.equal(typeof mod.collectUpdateFailureMeta, 'undefined');
});

// 恢复
clearSentinels();
if (savedCache) writeFileSync(CACHE_FILE, savedCache);
else if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE);

console.log(`\n========== 结果: ${pass} pass, ${fail} fail ==========`);
process.exit(fail > 0 ? 1 : 0);
