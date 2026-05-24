// P0 单测: fetchTreeWithETag — ETag/304 探活 (TTL 缩短的关键前提)
// 覆盖测试矩阵 C6: 远端没变 → 304 不计 GitHub 限流配额; 远端变 → 200 + 新 etag
//
// 设计约束: fetchTreeWithETag 必须支持注入 fetcher (依赖注入), 便于单测 mock。
//   签名建议: fetchTreeWithETag(url, etag, { fetchImpl }) → { status, sha, etag }
import { test } from 'node:test';
import assert from 'node:assert/strict';

const MOD = new URL('../../../skills/wind-mcp-skill/scripts/update-check.mjs', import.meta.url);
const load = () => import(MOD);

test('fetchTreeWithETag 已实现', async () => {
  const { fetchTreeWithETag } = await load();
  assert.equal(typeof fetchTreeWithETag, 'function', '应 export fetchTreeWithETag');
});

test('C6-a: 远端变了 → 200 返回新 sha + 新 etag', async () => {
  const { fetchTreeWithETag } = await load();
  let sentHeaders = null;
  const fetchImpl = async (url, opts) => {
    sentHeaders = opts?.headers || {};
    return {
      status: 200,
      ok: true,
      headers: new Map([['etag', 'W/"new-etag"']]),
      async json() { return { sha: 'newsha123', tree: [] }; },
      async text() { return JSON.stringify({ sha: 'newsha123', tree: [] }); },
    };
  };
  const r = await fetchTreeWithETag('https://api.github.com/repos/x/y/git/trees/main', 'W/"old"', { fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(r.sha, 'newsha123');
  assert.equal(r.etag, 'W/"new-etag"', '应回传新 etag 供下次存 cache');
});

test('C6-b: 远端没变 → 304, 不返回新 sha (复用 cache)', async () => {
  const { fetchTreeWithETag } = await load();
  const fetchImpl = async () => ({
    status: 304,
    ok: false,
    headers: new Map(),
    async json() { throw new Error('304 无 body'); },
    async text() { return ''; },
  });
  const r = await fetchTreeWithETag('https://api.github.com/repos/x/y/git/trees/main', 'W/"cached"', { fetchImpl });
  assert.equal(r.status, 304, '304 = 远端没变');
  assert.ok(!r.sha, '304 不应带新 sha, 调用方复用 cache.latestSha');
});

test('C6-c: 请求必须带 If-None-Match header (有 etag 时)', async () => {
  const { fetchTreeWithETag } = await load();
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = opts?.headers || {};
    return { status: 304, ok: false, headers: new Map(), async json() { return {}; }, async text() { return ''; } };
  };
  await fetchTreeWithETag('https://api.github.com/repos/x/y/git/trees/main', 'W/"abc"', { fetchImpl });
  const inm = captured['If-None-Match'] || captured['if-none-match'];
  assert.equal(inm, 'W/"abc"', '有 cached etag 时必须带 If-None-Match, 否则 GitHub 不返 304');
});

test('C6-d: 无 etag (首次) → 不带 If-None-Match, 正常 200', async () => {
  const { fetchTreeWithETag } = await load();
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = opts?.headers || {};
    return {
      status: 200, ok: true, headers: new Map([['etag', 'W/"first"']]),
      async json() { return { sha: 's', tree: [] }; }, async text() { return '{"sha":"s","tree":[]}'; },
    };
  };
  const r = await fetchTreeWithETag('https://api.github.com/repos/x/y/git/trees/main', null, { fetchImpl });
  const inm = captured['If-None-Match'] || captured['if-none-match'];
  assert.ok(!inm, '首次无 etag 不应带 If-None-Match');
  assert.equal(r.status, 200);
  assert.equal(r.etag, 'W/"first"');
});
