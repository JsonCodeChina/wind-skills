// wind-mcp-skill notices 单元测试: notices 数组只承载 update_available
// 其它失败状态(transient_error / unknown)既不进 notices 也不进 envelope(已废弃 meta flag)

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';

const SKILL_DIR = '/home/wind/ybyu/wind-skills/skills/wind-mcp-skill';
const CACHE_DIR = join(homedir(), '.cache', 'wind-aifinmarket');
const CACHE_FILE = join(CACHE_DIR, 'update-state.json');

let savedCache = null;
if (existsSync(CACHE_FILE)) savedCache = readFileSync(CACHE_FILE, 'utf8');

function writeCache(obj) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2));
}

const REAL_SIG = (() => {
  try {
    const lockPath = process.env.XDG_STATE_HOME
      ? join(process.env.XDG_STATE_HOME, 'skills', '.skill-lock.json')
      : join(homedir(), '.agents', '.skill-lock.json');
    if (!existsSync(lockPath)) return null;
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const entry = lock?.skills?.['wind-mcp-skill'];
    return entry ? `${lockPath}|${entry.updatedAt || entry.installedAt || ''}` : null;
  } catch { return null; }
})();
const REAL_LOCK_HASH = (() => {
  try {
    const lockPath = process.env.XDG_STATE_HOME
      ? join(process.env.XDG_STATE_HOME, 'skills', '.skill-lock.json')
      : join(homedir(), '.agents', '.skill-lock.json');
    if (!existsSync(lockPath)) return null;
    return JSON.parse(readFileSync(lockPath, 'utf8'))?.skills?.['wind-mcp-skill']?.skillFolderHash || null;
  } catch { return null; }
})();

async function loadCli() {
  const url = `file://${join(SKILL_DIR, 'scripts', 'cli.mjs')}?t=${Date.now()}_${Math.random()}`;
  return await import(url);
}

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); fail++; }
}

console.log('\n=== collectUpdateNotices 行为 ===');

await test('transient_error → 空数组(不进 notices)', async () => {
  writeCache({
    schemaVersion: 3,
    skills: {
      'wind-mcp-skill': {
        status: 'transient_error', reason: 'network', ttlMs: 300_000,
        lockSignature: REAL_SIG, lastCheck: new Date().toISOString(),
      },
    },
  });
  const { collectUpdateNotices } = await loadCli();
  assert.deepEqual(collectUpdateNotices(), []);
});

await test('unknown → 空数组(不进 notices)', async () => {
  writeCache({
    schemaVersion: 3,
    skills: {
      'wind-mcp-skill': {
        status: 'unknown', reason: 'lock_missing', ttlMs: 86_400_000,
        lockSignature: REAL_SIG, lastCheck: new Date().toISOString(),
      },
    },
  });
  const { collectUpdateNotices } = await loadCli();
  assert.deepEqual(collectUpdateNotices(), []);
});

await test('up_to_date → 空数组', async () => {
  writeCache({
    schemaVersion: 3,
    skills: {
      'wind-mcp-skill': {
        status: 'up_to_date', ttlMs: 3_600_000,
        lockSignature: REAL_SIG, lastCheck: new Date().toISOString(),
      },
    },
  });
  const { collectUpdateNotices } = await loadCli();
  assert.deepEqual(collectUpdateNotices(), []);
});

await test('update_available + 未升级 → 1 条 notice', async () => {
  if (!REAL_LOCK_HASH) { console.log('    [skip] 无 lock hash'); return; }
  writeCache({
    schemaVersion: 3,
    skills: {
      'wind-mcp-skill': {
        status: 'update_available',
        outdated: [{
          name: 'wind-mcp-skill',
          current: REAL_LOCK_HASH.slice(0, 7),
          latest: 'newhash',
          sourceUrl: 'https://github.com/Wind-Information-Co-Ltd/wind-skills.git',
          host: 'github',
          installedHash: REAL_LOCK_HASH,
        }],
        ttlMs: 43_200_000, lockSignature: REAL_SIG,
        lastCheck: new Date().toISOString(),
      },
    },
  });
  const { collectUpdateNotices } = await loadCli();
  const notices = collectUpdateNotices();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].type, 'update_available');
  assert.ok(notices[0].items?.[0]?.upgrade_command);
});

await test('snooze 期间 update_available → 空数组', async () => {
  if (!REAL_LOCK_HASH) { console.log('    [skip] 无 lock hash'); return; }
  const future = new Date(Date.now() + 86_400_000).toISOString();
  writeCache({
    schemaVersion: 3,
    skills: {
      'wind-mcp-skill': {
        status: 'update_available',
        outdated: [{
          name: 'wind-mcp-skill', current: REAL_LOCK_HASH.slice(0, 7), latest: 'b',
          sourceUrl: 'https://github.com/x/y.git', host: 'github',
          installedHash: REAL_LOCK_HASH,
        }],
        ttlMs: 43_200_000, snoozedUntil: future,
        lockSignature: REAL_SIG, lastCheck: new Date().toISOString(),
      },
    },
  });
  const { collectUpdateNotices } = await loadCli();
  assert.deepEqual(collectUpdateNotices(), []);
});

await test('损坏 cache → 不抛错, 空数组', async () => {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, 'not json');
  const { collectUpdateNotices } = await loadCli();
  assert.deepEqual(collectUpdateNotices(), []);
});

await test('cache 不存在 → 不抛错, 空数组', async () => {
  if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE);
  const { collectUpdateNotices } = await loadCli();
  assert.deepEqual(collectUpdateNotices(), []);
});

await test('cli.mjs 不再 export collectUpdateFailureMeta', async () => {
  const mod = await loadCli();
  assert.equal(typeof mod.collectUpdateFailureMeta, 'undefined',
    'collectUpdateFailureMeta 已废弃,不应再 export');
});

// 恢复 cache
if (savedCache) writeFileSync(CACHE_FILE, savedCache);
else if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE);

console.log(`\n========== 结果: ${pass} pass, ${fail} fail ==========`);
process.exit(fail > 0 ? 1 : 0);
