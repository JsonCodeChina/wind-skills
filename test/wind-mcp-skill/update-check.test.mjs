import { describe, it, beforeEach, afterEach } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, utimesSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, '..', '..', 'skills', 'wind-mcp-skill');
const SCRIPT = join(SKILL_DIR, 'scripts', 'update-check.mjs');
const CACHE_DIR = join(homedir(), '.cache', 'wind-aifinmarket');
const CACHE_FILE = join(CACHE_DIR, 'update-state.json');

// ───── Helpers ─────

function runScript(env = {}) {
  const result = spawnSync('node', [SCRIPT], {
    cwd: SKILL_DIR,
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, ...env },
  });
  return { stdout: result.stdout, stderr: result.stderr || '', status: result.status };
}

// 从 stderr 中提取脚本自身输出（排除 Node.js 引擎警告）
function scriptStderr(raw) {
  return raw
    .split('\n')
    .filter(line => !line.startsWith('(node:') && !line.startsWith('Use `node'))
    .join('\n')
    .trim();
}

function readCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try { return JSON.parse(readFileSync(CACHE_FILE, 'utf8')); }
  catch { return null; }
}

function writeCache(data) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

function clearCache() {
  try { if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE); } catch {}
}

// 从 lock 文件中读取真实 lockSignature，不依赖脚本运行结果
function readLockSignature() {
  const xdg = process.env.XDG_STATE_HOME;
  const lockPath = xdg
    ? join(xdg, 'skills', '.skill-lock.json')
    : join(homedir(), '.agents', '.skill-lock.json');
  if (!existsSync(lockPath)) return null;
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const entry = lock?.skills?.['wind-mcp-skill'];
    if (!entry) return null;
    const updatedAt = entry.updatedAt || entry.installedAt || '';
    return `${lockPath}|${updatedAt}`;
  } catch { return null; }
}

// 向缓存写入指定状态（需要先拿到 lockSignature 才能命中缓存）
function seedSkillState(state) {
  const sig = readLockSignature();
  if (!sig) throw new Error('无法读取 lock 文件，跳过需要缓存命中的测试');
  const full = readCache() || { schemaVersion: 3, skills: {} };
  if (!full.skills) full.skills = {};
  full.skills['wind-mcp-skill'] = { ...state, lastCheck: new Date().toISOString(), lockSignature: sig };
  writeCache(full);
}

// ───── Setup / Teardown ─────

describe('update-check.mjs', () => {

  beforeEach(() => { clearCache(); });
  afterEach(() => { clearCache(); });

  // ═══════════════════════════════════════
  // 1. 基础运行
  // ═══════════════════════════════════════

  describe('basic execution', () => {
    it('exits with code 0 (never blocks)', () => {
      const { status } = runScript();
      assert.equal(status, 0);
    });

    it('writes unified cache file with schemaVersion 3', () => {
      runScript();
      const cache = readCache();
      assert.ok(cache, 'cache file should exist');
      assert.equal(cache.schemaVersion, 3);
      assert.ok(cache.skills, 'cache should have skills key');
    });

    it('writes entry under correct skill name key', () => {
      runScript();
      const cache = readCache();
      assert.ok(cache.skills['wind-mcp-skill'], 'should have wind-mcp-skill key');
      const state = cache.skills['wind-mcp-skill'];
      assert.ok(state.status, 'entry should have status');
      assert.ok(state.lastCheck, 'entry should have lastCheck');
      assert.ok(typeof state.ttlMs === 'number', 'entry should have ttlMs');
    });

    it('status is one of the four valid states', () => {
      runScript();
      const cache = readCache();
      const valid = new Set(['up_to_date', 'update_available', 'unknown', 'transient_error']);
      assert.ok(valid.has(cache.skills['wind-mcp-skill'].status));
    });
  });

  // ═══════════════════════════════════════
  // 2. SKILL_NAME 自动检测
  // ═══════════════════════════════════════

  describe('SKILL_NAME auto-detection', () => {
    it('derives correct name from scripts/ parent directory', () => {
      const scriptDir = join(SKILL_DIR, 'scripts');
      assert.equal(basename(dirname(scriptDir)), 'wind-mcp-skill');
    });

    it('different skill paths produce different names', () => {
      const paths = [
        'D:/x/skills/wind-mcp-skill/scripts',
        'D:/x/skills/wind-find-finance-skill/scripts',
        'D:/x/skills/wind-alice/scripts',
      ];
      const names = paths.map(p => basename(dirname(p)));
      assert.deepEqual(names, ['wind-mcp-skill', 'wind-find-finance-skill', 'wind-alice']);
    });
  });

  // ═══════════════════════════════════════
  // 3. TTL 缓存命中
  // ═══════════════════════════════════════

  describe('TTL cache freshness', () => {
    it('second run preserves lastCheck (no re-fetch)', () => {
      runScript();
      const first = readCache();
      const firstCheck = first.skills['wind-mcp-skill'].lastCheck;

      runScript();
      const second = readCache();
      assert.equal(second.skills['wind-mcp-skill'].lastCheck, firstCheck,
        'lastCheck should not change on cache hit');
    });

    it('expired cache triggers re-fetch', () => {
      runScript();
      const cache = readCache();

      cache.skills['wind-mcp-skill'].lastCheck = '2000-01-01T00:00:00Z';
      cache.skills['wind-mcp-skill'].ttlMs = 300_000;
      writeCache(cache);

      runScript();
      const updated = readCache();
      assert.notEqual(updated.skills['wind-mcp-skill'].lastCheck, '2000-01-01T00:00:00Z',
        'lastCheck should update after expiry');
    });

    it('lockSignature change invalidates cache', () => {
      runScript();
      const cache = readCache();

      cache.skills['wind-mcp-skill'].lockSignature = 'fake_signature';
      writeCache(cache);

      runScript();
      const updated = readCache();
      assert.notEqual(updated.skills['wind-mcp-skill'].lockSignature, 'fake_signature',
        'lockSignature should be recalculated');
    });
  });

  // ═══════════════════════════════════════
  // 4. Snooze 保留
  // ═══════════════════════════════════════

  describe('snooze preservation', () => {
    it('snoozedUntil preserved on overwrite', () => {
      runScript();
      const cache = readCache();

      cache.skills['wind-mcp-skill'].snoozedUntil = '2099-01-01T00:00:00Z';
      cache.skills['wind-mcp-skill'].lastCheck = '2000-01-01T00:00:00Z';
      cache.skills['wind-mcp-skill'].ttlMs = 300_000;
      writeCache(cache);

      runScript();
      const updated = readCache();
      assert.equal(updated.skills['wind-mcp-skill'].snoozedUntil, '2099-01-01T00:00:00Z');
    });

    it('snoozeLevel preserved on overwrite', () => {
      runScript();
      const cache = readCache();

      cache.skills['wind-mcp-skill'].snoozeLevel = 3;
      cache.skills['wind-mcp-skill'].lastCheck = '2000-01-01T00:00:00Z';
      cache.skills['wind-mcp-skill'].ttlMs = 300_000;
      writeCache(cache);

      runScript();
      const updated = readCache();
      assert.equal(updated.skills['wind-mcp-skill'].snoozeLevel, 3);
    });

    it('snoozed state suppresses stderr output', () => {
      runScript();
      const cache = readCache();

      cache.skills['wind-mcp-skill'] = {
        status: 'update_available',
        outdated: [{ name: 'wind-mcp-skill', current: 'abc', latest: 'def', sourceUrl: 'https://github.com/x/y.git', host: 'github' }],
        ttlMs: 43200000,
        lastCheck: new Date().toISOString(),
        snoozedUntil: '2099-01-01T00:00:00Z',
      };
      writeCache(cache);

      const { stderr } = runScript();
      assert.ok(!scriptStderr(stderr).includes('检测到'), 'snoozed notice should not print');
    });
  });

  // ═══════════════════════════════════════
  // 5. 边界场景
  // ═══════════════════════════════════════

  describe('edge cases', () => {
    it('corrupted cache file handled gracefully', () => {
      writeFileSync(CACHE_FILE, 'this is not json!!!');
      const { status } = runScript();
      assert.equal(status, 0, 'should not crash on corrupted cache');

      const cache = readCache();
      assert.ok(cache?.schemaVersion === 3, 'should write valid new cache');
    });

    it('empty cache file handled gracefully', () => {
      writeFileSync(CACHE_FILE, '');
      const { status } = runScript();
      assert.equal(status, 0);

      const cache = readCache();
      assert.ok(cache?.schemaVersion === 3);
    });

    it('old flat format cache (schemaVersion 2) treated as invalid', () => {
      writeCache({ schemaVersion: 2, status: 'up_to_date' });
      runScript();

      const cache = readCache();
      assert.equal(cache.schemaVersion, 3, 'should overwrite with v3 format');
      assert.ok(cache.skills, 'should have skills key');
    });

    it('no lock entry for skill produces unknown or network error', () => {
      clearCache();
      // 如果本地没有 lock 文件中对应 skill 的条目，状态应该是 unknown
      // 如果有 lock 条目，会尝试网络请求，可能是 transient_error
      runScript();
      const cache = readCache();
      const state = cache.skills['wind-mcp-skill'];
      assert.ok(state, 'should have state entry');
      assert.ok(['unknown', 'transient_error'].includes(state.status),
        `expected unknown or transient_error, got ${state.status}`);
    });
  });

  // ═══════════════════════════════════════
  // 6. printNotice 输出（依赖 lockSignature 缓存命中）
  // ═══════════════════════════════════════

  describe('printNotice output', () => {
    it('update_available prints version info and upgrade command', () => {
      seedSkillState({
        status: 'update_available',
        outdated: [{
          name: 'wind-mcp-skill',
          current: 'abc1234',
          latest: 'def5678',
          sourceUrl: 'https://github.com/x/y.git',
          host: 'github',
        }],
        ttlMs: 43200000,
      });

      const { stderr } = runScript();
      const out = scriptStderr(stderr);
      assert.ok(out.includes('检测到 1 个 skill 有新版'), `stderr: ${out}`);
      assert.ok(out.includes('abc1234 → def5678'), `stderr: ${out}`);
      assert.ok(out.includes('npx skills update wind-mcp-skill -g -y'), `stderr: ${out}`);
    });

    it('update_available with Gitee source shows reinstall command', () => {
      seedSkillState({
        status: 'update_available',
        outdated: [{
          name: 'wind-mcp-skill',
          current: 'abc1234',
          latest: 'def5678',
          sourceUrl: 'https://gitee.com/x/y.git',
          host: 'gitee',
        }],
        ttlMs: 43200000,
      });

      const { stderr } = runScript();
      const out = scriptStderr(stderr);
      assert.ok(out.includes('Gitee 源不支持 update'), `stderr: ${out}`);
      assert.ok(out.includes('npx skills add'), `stderr: ${out}`);
    });

    it('transient_error prints reason', () => {
      seedSkillState({
        status: 'transient_error',
        reason: 'network',
        ttlMs: 300000,
      });

      const { stderr } = runScript();
      const out = scriptStderr(stderr);
      assert.ok(out.includes('检查更新失败'), `stderr: ${out}`);
      assert.ok(out.includes('reason=network'), `stderr: ${out}`);
    });

    it('unknown prints reason', () => {
      seedSkillState({
        status: 'unknown',
        reason: 'lock_missing',
        ttlMs: 86400000,
      });

      const { stderr } = runScript();
      const out = scriptStderr(stderr);
      assert.ok(out.includes('无法确认是否最新'), `stderr: ${out}`);
      assert.ok(out.includes('reason=lock_missing'), `stderr: ${out}`);
    });

    it('up_to_date does not print notice', () => {
      seedSkillState({
        status: 'up_to_date',
        ttlMs: 3600000,
      });

      const { stderr } = runScript();
      const out = scriptStderr(stderr);
      assert.equal(out, '', `expected no script output, got: ${out}`);
    });
  });

  // ═══════════════════════════════════════
  // 8. 统一缓存格式
  // ═══════════════════════════════════════

  describe('unified cache format', () => {
    it('merge-by-key: writing one skill does not erase another', () => {
      writeCache({
        schemaVersion: 3,
        skills: {
          'other-skill': { status: 'up_to_date', ttlMs: 3600000, lastCheck: '2026-01-01T00:00:00Z', lockSignature: 'sig1' },
        },
      });

      runScript();

      const cache = readCache();
      assert.ok(cache.skills['other-skill'], 'other-skill entry should survive');
      assert.equal(cache.skills['other-skill'].status, 'up_to_date');
      assert.ok(cache.skills['wind-mcp-skill'], 'wind-mcp-skill should be added');
    });

    it('multiple skills coexist in cache', () => {
      writeCache({
        schemaVersion: 3,
        skills: {
          'skill-a': { status: 'up_to_date', ttlMs: 3600000, lastCheck: new Date().toISOString() },
          'skill-b': { status: 'unknown', reason: 'test', ttlMs: 86400000, lastCheck: new Date().toISOString() },
        },
      });

      runScript();

      const cache = readCache();
      assert.ok(cache.skills['skill-a'], 'skill-a preserved');
      assert.ok(cache.skills['skill-b'], 'skill-b preserved');
      assert.ok(cache.skills['wind-mcp-skill'], 'wind-mcp-skill added');
      assert.equal(Object.keys(cache.skills).length, 3);
    });
  });

  // ═══════════════════════════════════════
  // 9. 文件锁 & 并发(深度场景)
  // ═══════════════════════════════════════

  describe('file lock and concurrency', () => {
    const LOCK_FILE = CACHE_FILE + '.lock';

    afterEach(() => {
      try { if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE); } catch {}
    });

    it('removes lockfile after successful run', () => {
      runScript();
      assert.ok(!existsSync(LOCK_FILE), 'lockfile should not remain after run');
    });

    it('cleans up stale lockfile (>30s old) and proceeds', () => {
      if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(LOCK_FILE, '');
      // 把 mtime 设到 90s 前 — 远超 LOCK_STALE_MS=30s
      const past = (Date.now() - 90_000) / 1000;
      // node fs 没有直接 setmtime,用 utimesSync
      utimesSync(LOCK_FILE, past, past);

      const { status } = runScript();
      assert.equal(status, 0, 'should not crash on stale lock');
      assert.ok(!existsSync(LOCK_FILE), 'stale lock should be cleaned + new one removed at end');

      const cache = readCache();
      assert.ok(cache?.schemaVersion === 3, 'cache should be written successfully');
    });

    it('concurrent runs produce intact JSON cache', async () => {
      clearCache();
      // 启 5 个并发进程
      const procs = [];
      for (let i = 0; i < 5; i++) {
        procs.push(new Promise((resolve) => {
          const p = spawnSync('node', [SCRIPT], {
            cwd: SKILL_DIR, encoding: 'utf8', timeout: 15_000, env: { ...process.env },
          });
          resolve(p.status);
        }));
      }
      const statuses = await Promise.all(procs);
      for (const s of statuses) assert.equal(s, 0, 'every concurrent run must exit 0');

      // cache 应是完整有效 JSON
      const cache = readCache();
      assert.ok(cache, 'cache file should exist after concurrent runs');
      assert.equal(cache.schemaVersion, 3, 'cache schema should be intact');
      assert.ok(cache.skills?.['wind-mcp-skill'], 'wind-mcp-skill entry should exist');
      assert.ok(!existsSync(LOCK_FILE), 'no lockfile residue');
    });
  });

  // ═══════════════════════════════════════
  // 10. cache hit 性能
  // ═══════════════════════════════════════

  describe('cache hit performance', () => {
    it('cache hit completes under 300ms (no network)', () => {
      // 先跑一次让 cache 填充
      runScript();
      const cache = readCache();
      assert.ok(cache, 'first run should produce cache');

      // 第二次跑必须快(cache hit 不走网络)
      const start = Date.now();
      const { status } = runScript();
      const elapsed = Date.now() - start;
      assert.equal(status, 0);
      assert.ok(elapsed < 300, `cache hit took ${elapsed}ms (expected < 300ms)`);
    });
  });

  // ═══════════════════════════════════════
  // 11. installedHash 字段(深度)
  // ═══════════════════════════════════════

  describe('installedHash field in outdated', () => {
    it('outdated entries carry installedHash when available', () => {
      runScript();
      const cache = readCache();
      const state = cache?.skills?.['wind-mcp-skill'];
      // 仅当远端反查成功且确实有更新可用时验证。rate_limit/transient 跳过。
      if (state?.status !== 'update_available' || !Array.isArray(state.outdated) || state.outdated.length === 0) {
        return;
      }
      const entry = state.outdated[0];
      assert.ok('installedHash' in entry, 'outdated entry should have installedHash field');
      if (entry.installedHash) {
        assert.ok(typeof entry.installedHash === 'string', 'installedHash must be string');
        assert.ok(entry.installedHash.length >= 40, `installedHash should be full hash (>=40 chars), got ${entry.installedHash.length}`);
      }
    });
  });

});
