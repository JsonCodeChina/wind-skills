// wind-alice update-notify.mjs (v1 共享 schema) 通知行为测试
// 子进程 + 隔离 HOME: maybePrintUpdateNotice 在 import 时按 homedir 固化 CACHE_FILE,
// 故每个场景 spawn 新进程, HOME 指向临时目录, 互不污染。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const NOTIFY_MOD = join(REPO, 'skills/wind-alice/scripts/update-notify.mjs');
const SKILL = 'wind-alice';

// 起一个隔离 HOME, 写 lock + (可选)v1 cache, 返回路径与该安装的 cache key
function setupHome({ entryState, sourceUrl = 'https://github.com/JsonCodeChina/wind-skills.git', project = false } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'wa-notify-'));
  const lockObj = { version: 3, skills: { [SKILL]: {
    sourceUrl, sourceType: sourceUrl.includes('gitee') ? 'gitee' : 'github',
    skillPath: `skills/${SKILL}/SKILL.md`, skillFolderHash: 'x',
    installedAt: '2026-05-20T00:00:00.000Z', updatedAt: '2026-05-20T00:00:00.000Z',
  } } };
  let lockPath, cwd;
  if (project) {
    cwd = join(home, 'proj'); mkdirSync(cwd, { recursive: true });
    lockPath = join(cwd, 'skills-lock.json');
  } else {
    mkdirSync(join(home, '.agents'), { recursive: true });
    lockPath = join(home, '.agents', '.skill-lock.json');
    cwd = home;
  }
  writeFileSync(lockPath, JSON.stringify(lockObj));

  const cacheDir = join(home, '.cache', 'wind-aifinmarket');
  mkdirSync(cacheDir, { recursive: true });
  const cacheFile = join(cacheDir, 'update-state.json');
  const key = `${SKILL}|${realpathSync.native(resolve(lockPath))}`;   // == canonicalizeLockPath
  if (entryState) {
    const now = new Date().toISOString();
    writeFileSync(cacheFile, JSON.stringify({
      version: 1, meta: { callCount: 1, fallbackShownAt: null },
      entries: { [key]: { lastCheckedAt: now, lastSuccessAt: now, ...entryState } },
    }, null, 2));
  }
  return { home, cwd, cacheFile, key };
}

function runNotify(home, cwd) {
  const script = `const m = await import(${JSON.stringify(pathToFileURL(NOTIFY_MOD).href)}); m.maybePrintUpdateNotice();`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd, encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home, XDG_STATE_HOME: '' },
  });
  return (r.stderr || '') + (r.stdout || '');
}

const readCache = (f) => JSON.parse(readFileSync(f, 'utf8'));
const cleanup = (home) => rmSync(home, { recursive: true, force: true });

describe('wind-alice update-notify.mjs (v1)', () => {
  it('pending → 打印 [notice] + 升级命令, 并标记 lastNotifiedSha=latestSha', () => {
    const { home, cwd, cacheFile, key } = setupHome({ entryState: { latestSha: 'BBB', lastNotifiedSha: 'AAA' } });
    const out = runNotify(home, cwd);
    assert.match(out, /\[notice\] wind-alice 有新版本可用/);
    assert.match(out, /npx skills update wind-alice -g -y/);
    assert.equal(readCache(cacheFile).entries[key].lastNotifiedSha, 'BBB');
    cleanup(home);
  });

  it('基线态 (latest==notified) → 静默', () => {
    const { home, cwd } = setupHome({ entryState: { latestSha: 'AAA', lastNotifiedSha: 'AAA' } });
    assert.equal(runNotify(home, cwd).trim(), '');
    cleanup(home);
  });

  it('去重: 标记后再调 → 静默', () => {
    const { home, cwd } = setupHome({ entryState: { latestSha: 'BBB', lastNotifiedSha: 'AAA' } });
    assert.match(runNotify(home, cwd), /有新版本可用/);   // 第一次提示 + 标记
    assert.equal(runNotify(home, cwd).trim(), '');         // 第二次静默
    cleanup(home);
  });

  it('project 安装 → 升级命令不带 -g', () => {
    const { home, cwd } = setupHome({ entryState: { latestSha: 'BBB', lastNotifiedSha: 'AAA' }, project: true });
    const out = runNotify(home, cwd);
    assert.match(out, /npx skills update wind-alice -y/);
    assert.doesNotMatch(out, /update wind-alice -g/);
    cleanup(home);
  });

  it('Gitee 源 → 改用 npx skills add 重装命令', () => {
    const { home, cwd } = setupHome({ entryState: { latestSha: 'BBB', lastNotifiedSha: 'AAA' }, sourceUrl: 'https://gitee.com/jsonCodeChina/wind-skills.git' });
    assert.match(runNotify(home, cwd), /npx skills add .*gitee\.com.*--skill wind-alice/);
    cleanup(home);
  });

  it('无 cache → 不崩溃, 无输出', () => {
    const { home, cwd } = setupHome({ entryState: null });
    assert.equal(runNotify(home, cwd).trim(), '');
    cleanup(home);
  });

  it('损坏 cache → 不崩溃, 无输出', () => {
    const { home, cwd, cacheFile } = setupHome({ entryState: { latestSha: 'BBB', lastNotifiedSha: 'AAA' } });
    writeFileSync(cacheFile, '{ broken json');
    assert.equal(runNotify(home, cwd).trim(), '');
    cleanup(home);
  });
});
