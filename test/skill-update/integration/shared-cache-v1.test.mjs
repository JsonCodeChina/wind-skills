// 多 skill 共享 v1 cache 集成测试
// (1) find-finance 无 cli, update-check.mjs 内联 maybeNotifyUpdate 的通知行为
// (2) no-clobber: wind-mcp / wind-alice / find-finance 同 HOME 共写一份 cache, 互不覆盖
// 全部子进程 + 隔离 HOME (CACHE_FILE 在 import 时按 homedir 固化)。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../..');

// 各 skill 的通知入口 (module, 导出函数名)
const NOTIFY = {
  'wind-mcp-skill':          [join(REPO, 'skills/wind-mcp-skill/scripts/cli.mjs'),                'maybeNotifyUpdate'],
  'wind-alice':              [join(REPO, 'skills/wind-alice/scripts/update-check.mjs'),          'maybePrintUpdateNotice'],
  'wind-find-finance-skill': [join(REPO, 'skills/wind-find-finance-skill/scripts/update-check.mjs'), 'maybeNotifyUpdate'],
};

function lockEntry(skill, sourceUrl = 'https://github.com/JsonCodeChina/wind-skills.git') {
  return {
    sourceUrl, sourceType: 'github', skillPath: `skills/${skill}/SKILL.md`,
    skillFolderHash: 'x', installedAt: '2026-05-20T00:00:00.000Z', updatedAt: '2026-05-20T00:00:00.000Z',
  };
}

// 隔离 HOME + 全局 lock(可含多 skill) + v1 cache(按 skill 给 entryState)
function setup({ skills, states }) {
  const home = mkdtempSync(join(tmpdir(), 'shared-cache-'));
  mkdirSync(join(home, '.agents'), { recursive: true });
  const lockPath = join(home, '.agents', '.skill-lock.json');
  const lockSkills = {};
  for (const s of skills) lockSkills[s] = lockEntry(s);
  writeFileSync(lockPath, JSON.stringify({ version: 3, skills: lockSkills }));

  const cacheDir = join(home, '.cache', 'wind-aifinmarket');
  mkdirSync(cacheDir, { recursive: true });
  const cacheFile = join(cacheDir, 'update-state.json');
  const lockReal = realpathSync.native(resolve(lockPath));
  const keyOf = (s) => `${s}|${lockReal}`;
  const now = new Date().toISOString();
  const entries = {};
  for (const [s, st] of Object.entries(states)) {
    entries[keyOf(s)] = { lastCheckedAt: now, lastSuccessAt: now, ...st };
  }
  writeFileSync(cacheFile, JSON.stringify({ version: 1, meta: { callCount: 1, fallbackShownAt: null }, entries }, null, 2));
  return { home, cacheFile, keyOf };
}

function runNotify(skill, home) {
  const [mod, fn] = NOTIFY[skill];
  const script = `const m = await import(${JSON.stringify(pathToFileURL(mod).href)}); await m.${fn}();`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: home, encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: '' },
  });
  return (r.stderr || '') + (r.stdout || '');
}

const readCache = (f) => JSON.parse(readFileSync(f, 'utf8'));
const cleanup = (home) => rmSync(home, { recursive: true, force: true });

describe('find-finance update-check.mjs 内联通知 (v1)', () => {
  it('pending → 打印 [notice] wind-find-finance-skill 有新版本可用', () => {
    const { home, cacheFile, keyOf } = setup({
      skills: ['wind-find-finance-skill'],
      states: { 'wind-find-finance-skill': { latestSha: 'BBB', lastNotifiedSha: 'AAA' } },
    });
    const out = runNotify('wind-find-finance-skill', home);
    assert.match(out, /\[notice\] wind-find-finance-skill 有新版本可用/);
    assert.match(out, /npx skills update wind-find-finance-skill -g -y/);
    assert.equal(readCache(cacheFile).entries[keyOf('wind-find-finance-skill')].lastNotifiedSha, 'BBB');
    cleanup(home);
  });

  it('基线态 → 静默', () => {
    const { home } = setup({
      skills: ['wind-find-finance-skill'],
      states: { 'wind-find-finance-skill': { latestSha: 'AAA', lastNotifiedSha: 'AAA' } },
    });
    assert.equal(runNotify('wind-find-finance-skill', home).trim(), '');
    cleanup(home);
  });
});

describe('多 skill 共享 v1 cache — no-clobber', () => {
  const ALL = ['wind-mcp-skill', 'wind-alice', 'wind-find-finance-skill'];

  it('三 skill 各自 notify 后, cache 仍为 v1 且三个 entry 都在、各自被标记、无 v3 残留', () => {
    const states = {};
    for (const s of ALL) states[s] = { latestSha: `NEW-${s}`, lastNotifiedSha: `OLD-${s}` };
    const { home, cacheFile, keyOf } = setup({ skills: ALL, states });

    // 依次跑三个 skill 的通知 (模拟三 skill 在同一会话被调用)
    for (const s of ALL) {
      const out = runNotify(s, home);
      assert.match(out, new RegExp(`\\[notice\\] ${s} 有新版本可用`), `${s} 应提示`);
    }

    const c = readCache(cacheFile);
    assert.equal(c.version, 1, 'schema 仍为 v1');
    assert.ok(!('schemaVersion' in c), '无 v3 schemaVersion 残留');
    assert.ok(!('skills' in c), '无 v3 skills 字段残留');
    for (const s of ALL) {
      const e = c.entries[keyOf(s)];
      assert.ok(e, `${s} 的 entry 未被清掉`);
      assert.equal(e.lastNotifiedSha, `NEW-${s}`, `${s} 已标记为最新, 且只动自己那条`);
    }
    cleanup(home);
  });
});
