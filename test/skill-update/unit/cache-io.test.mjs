// P0 单测: readCache + mergeCacheEntry — cache 容错 + 并发安全
// 覆盖测试矩阵 C23(损坏 cache) / C24(cache 不存在) / C8(read-modify-write race)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MOD = new URL('../../../skills/wind-mcp-skill/scripts/update-check.mjs', import.meta.url);
const load = () => import(MOD);

function tmpCache() {
  const dir = mkdtempSync(join(tmpdir(), 'wind-cache-'));
  return { dir, file: join(dir, 'update-state.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('readCache / mergeCacheEntry 已实现', async () => {
  const { readCache, mergeCacheEntry } = await load();
  assert.equal(typeof readCache, 'function', '应 export readCache');
  assert.equal(typeof mergeCacheEntry, 'function', '应 export mergeCacheEntry');
});

test('C24: cache 文件不存在 → 返回空结构, 不抛错', async () => {
  const { readCache } = await load();
  const { file, cleanup } = tmpCache();
  try {
    let cache;
    assert.doesNotThrow(() => { cache = readCache(file); });
    assert.equal(cache.version, 1);
    assert.deepEqual(cache.entries, {});
  } finally { cleanup(); }
});

test('C23: 损坏 cache (非法 JSON) → 返回空结构, 不抛错', async () => {
  const { readCache } = await load();
  const { file, cleanup } = tmpCache();
  try {
    writeFileSync(file, 'not json at all {{{');
    let cache;
    assert.doesNotThrow(() => { cache = readCache(file); }, '损坏 cache 不应抛错');
    assert.equal(cache.version, 1);
    assert.deepEqual(cache.entries, {}, '损坏内容当空 cache, 后续探活覆盖重建');
  } finally { cleanup(); }
});

test('正常 cache → 原样解析', async () => {
  const { readCache } = await load();
  const { file, cleanup } = tmpCache();
  try {
    const data = { version: 1, meta: { callCount: 3 }, entries: { 'k|p': { latestSha: 'x' } } };
    writeFileSync(file, JSON.stringify(data));
    const cache = readCache(file);
    assert.equal(cache.entries['k|p'].latestSha, 'x');
    assert.equal(cache.meta.callCount, 3);
  } finally { cleanup(); }
});

test('C8: mergeCacheEntry 只 patch 自己的 key, 其它 entry 原样透传 (锁内重读)', async () => {
  const { mergeCacheEntry, readCache } = await load();
  const { file, cleanup } = tmpCache();
  try {
    // 初始: entryA + entryB
    writeFileSync(file, JSON.stringify({
      version: 1, meta: {}, entries: {
        'wind-mcp-skill|/a': { latestSha: 'a1', lastCheckedAt: 't0' },
        'wind-mcp-skill|/b': { latestSha: 'b1', lastCheckedAt: 't0' },
      },
    }));
    // 模拟"另一个进程"在我们读后、写前改了 entryB
    const onDisk = JSON.parse(readFileSync(file, 'utf8'));
    onDisk.entries['wind-mcp-skill|/b'].latestSha = 'b2-by-other-proc';
    writeFileSync(file, JSON.stringify(onDisk));
    // 我们 patch entryA
    mergeCacheEntry(file, 'wind-mcp-skill|/a', { latestSha: 'a2', lastCheckedAt: 't1' });
    const after = readCache(file);
    assert.equal(after.entries['wind-mcp-skill|/a'].latestSha, 'a2', '自己的 key 被 patch');
    assert.equal(after.entries['wind-mcp-skill|/b'].latestSha, 'b2-by-other-proc',
      '另一进程对 entryB 的改动必须保留 (锁内重读, 不能用旧快照覆盖)');
  } finally { cleanup(); }
});

test('mergeCacheEntry: cache 不存在时也能创建并写入', async () => {
  const { mergeCacheEntry, readCache } = await load();
  const { file, cleanup } = tmpCache();
  try {
    assert.doesNotThrow(() => mergeCacheEntry(file, 'wind-mcp-skill|/a', { latestSha: 'x' }));
    assert.ok(existsSync(file));
    assert.equal(readCache(file).entries['wind-mcp-skill|/a'].latestSha, 'x');
  } finally { cleanup(); }
});
