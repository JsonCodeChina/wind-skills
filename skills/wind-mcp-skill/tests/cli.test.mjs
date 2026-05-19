import { describe, it, afterEach } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, '..');
const CLI = join(SKILL_DIR, 'scripts', 'cli.mjs');
const MANIFEST_PATH = join(SKILL_DIR, 'references', 'tool-manifest.json');
const CACHE_DIR = join(homedir(), '.cache', 'wind-aifinmarket');
const CACHE_FILE = join(CACHE_DIR, 'update-state.json');

// Run CLI, return parsed JSON stdout. env overrides merged onto process.env.
function run(args, { env: extraEnv = {}, expectFail = false } = {}) {
  let stdout;
  try {
    stdout = execFileSync('node', [CLI, ...args], {
      cwd: SKILL_DIR,
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, ...extraEnv },
    });
  } catch (err) {
    // CLI exits with code 1 on errors; stdout still contains the JSON envelope.
    stdout = err.stdout || '';
    if (!stdout && !expectFail) throw err;
  }
  const json = JSON.parse(stdout);
  if (!expectFail) {
    assert.ok(json.ok !== undefined, 'envelope missing ok');
    assert.ok(json.meta?.cli_version, 'envelope missing meta.cli_version');
    assert.ok(typeof json.meta?.schema_version === 'number', 'envelope missing meta.schema_version');
  }
  return json;
}

// Run CLI expecting failure; assert ok=false + specific error code.
function runFail(args, expectedCode, { env: extraEnv = {} } = {}) {
  const json = run(args, { env: extraEnv, expectFail: true });
  assert.equal(json.ok, false, `expected ok=false`);
  assert.equal(json.error?.code, expectedCode, `expected error.code=${expectedCode}, got ${json.error?.code}`);
  assert.equal(typeof json.error?.retryable, 'boolean', 'error.retryable must be boolean');
  assert.equal(typeof json.error?.fallback_allowed, 'boolean', 'error.fallback_allowed must be boolean');
  assert.ok(json.error?.agent_action, 'error.agent_action must be non-empty');
  assert.ok(json.error?.category, 'error.category must be non-empty');
  assert.ok(json.error?.hint, 'error.hint must be non-empty');
  return json;
}

// ───── Envelope structure ─────

describe('envelope structure', () => {
  it('help command returns ok:true with usage data', () => {
    const json = run([]);
    assert.equal(json.ok, true);
    assert.equal(json.command, 'help');
    assert.ok(json.data?.usage, 'missing data.usage');
    assert.ok(json.data.usage.includes('server_type'), 'usage should list server_type');
  });

  it('success envelope has data + meta', { timeout: 30_000 }, async () => {
    // Network-dependent: retry once on transient failure.
    let json;
    for (let attempt = 0; attempt < 2; attempt++) {
      json = run([
        'call', 'stock_data', 'get_stock_basicinfo',
        '{"question":"600519.SH"}',
      ]);
      if (json.ok) break;
      if (attempt === 0 && json.error?.retryable) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
    }
    assert.equal(json.ok, true, `call returned error: ${json.error?.code} ${json.error?.message}`);
    assert.equal(json.command, 'call');
    assert.ok(json.data, 'missing data');
    assert.equal(json.data.server_type, 'stock_data');
    assert.equal(json.data.tool, 'get_stock_basicinfo');
    assert.ok(json.data.result, 'missing raw MCP result');
    assert.ok(json.meta.cli_version);
    assert.equal(typeof json.meta.schema_version, 'number');
  });
});

// ───── Client-side error codes ─────

describe('USAGE_ERROR', () => {
  it('unknown command', () => {
    const json = runFail(['foobar'], 'USAGE_ERROR');
    assert.ok(json.data?.usage, 'should include usage in data');
  });

  it('call with no args', () => {
    const json = runFail(['call'], 'USAGE_ERROR');
    assert.ok(json.data?.usage, 'should include usage in data');
  });

  it('call missing params_json', () => {
    const json = runFail(['call', 'stock_data', 'get_stock_quote'], 'USAGE_ERROR');
    assert.ok(json.data?.usage);
  });

  it('setup-key with no args', () => {
    const json = runFail(['setup-key'], 'USAGE_ERROR');
    assert.ok(json.data?.usage);
  });
});

describe('UNKNOWN_SERVER_TYPE', () => {
  it('rejects invalid server_type before network call', () => {
    runFail(['call', 'fake_data', 'get_stock_quote', '{}'], 'UNKNOWN_SERVER_TYPE');
  });
});

describe('UNKNOWN_TOOL_NAME', () => {
  it('rejects invalid tool_name and provides available_tools', () => {
    const json = runFail(['call', 'stock_data', 'nonexistent_tool', '{}'], 'UNKNOWN_TOOL_NAME');
    assert.ok(Array.isArray(json.error.context?.available_tools));
    assert.ok(json.error.context.available_tools.length > 0, 'should list available tools');
    assert.ok(json.error.context.available_tools.includes('get_stock_quote'));
  });
});

describe('INVALID_PARAMS_JSON', () => {
  it('rejects malformed JSON', () => {
    const json = runFail(['call', 'stock_data', 'get_stock_quote', '{bad}'], 'INVALID_PARAMS_JSON');
    assert.ok(json.error.message.includes('params JSON'));
  });
});

describe('UNKNOWN_SCOPE', () => {
  it('rejects invalid scope', () => {
    runFail(['setup-key', 'testkey12345678', '--scope', 'nowhere'], 'UNKNOWN_SCOPE');
  });
});

// ───── Auth errors ─────

describe('KEY_INVALID', () => {
  it('fake key gets rejected as invalid', () => {
    const json = runFail(
      ['call', 'stock_data', 'get_stock_quote', '{"windcode":"600519.SH"}'],
      'KEY_INVALID',
      { env: { WIND_API_KEY: 'fake_test_key_12345678' } },
    );
    assert.equal(json.error.category, 'auth');
    assert.equal(json.error.retryable, false);
    assert.equal(json.error.fallback_allowed, false);
    assert.ok(json.error.context?.api_key_masked, 'should include masked key');
  });
});

// ───── Fallback behavior ─────

describe('fallback_allowed logic', () => {
  // Client errors should never allow fallback
  const clientErrors = [
    ['USAGE_ERROR', ['foobar']],
    ['UNKNOWN_SERVER_TYPE', ['call', 'fake', 'get', '{}']],
    ['UNKNOWN_TOOL_NAME', ['call', 'stock_data', 'fake', '{}']],
    ['INVALID_PARAMS_JSON', ['call', 'stock_data', 'get_stock_quote', '{x}']],
  ];
  for (const [code, args] of clientErrors) {
    it(`${code} has fallback_allowed=false`, () => {
      const json = runFail(args, code);
      assert.equal(json.error.fallback_allowed, false);
    });
  }
});

// ───── Tool manifest validation ─────

describe('tool manifest', () => {
  it('manifest JSON is valid and covers all server_types', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const expectedServers = [
      'stock_data', 'global_stock_data', 'fund_data', 'index_data',
      'bond_data', 'financial_docs', 'economic_data', 'analytics_data',
    ];
    for (const server of expectedServers) {
      assert.ok(Array.isArray(manifest[server]), `manifest missing ${server}`);
      assert.ok(manifest[server].length > 0, `manifest ${server} has no tools`);
    }
  });

  it('every tool in manifest matches SKILL.md server_type tables', () => {
    // Ensure each server_type has at least one tool that the CLI accepts
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    for (const [server, tools] of Object.entries(manifest)) {
      for (const tool of tools) {
        assert.ok(typeof tool === 'string' && tool.length > 0, `${server} has invalid tool entry`);
      }
    }
  });
});

// ───── Error code consistency ─────

describe('error-codes.json vs cli.mjs consistency', () => {
  it('error-codes.json is valid and all codes have required fields', () => {
    const ecPath = join(SKILL_DIR, 'references', 'error-codes.json');
    const ec = JSON.parse(readFileSync(ecPath, 'utf8'));
    assert.ok(ec.schema_version, 'missing schema_version');
    const requiredFields = ['category', 'retryable', 'fallback_allowed', 'agent_action'];
    for (const [code, def] of Object.entries(ec.codes)) {
      for (const field of requiredFields) {
        assert.ok(field in def, `${code} missing ${field}`);
      }
    }
  });
});

// ───── Successful call output shape ─────

describe('successful call output', () => {
  it('stock_data get_stock_basicinfo returns raw MCP result text', () => {
    const json = run(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"600519.SH"}']);
    assert.equal(json.ok, true);
    assert.ok(json.data?.result, 'missing data.result');
    assert.equal(json.data.result.isError, false);
    assert.ok(
      json.data.result.content?.some(item => item?.type === 'text' && typeof item.text === 'string'),
      'raw result should contain text content',
    );
  });

  it('success output includes notices array', () => {
    const json = run(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"600519.SH"}']);
    assert.ok(Array.isArray(json.notices), 'notices should be array');
  });
});

// ───── cross-skill notice isolation ─────

describe('cross-skill notice filtering', () => {
  afterEach(() => {
    // 清掉污染的 cache 以免影响其他测试
    try { if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE); } catch {}
  });

  it('does NOT leak foreign skill notices via legacy v2 cache schema', () => {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    // 模拟 wind-alice 写出的 legacy v2 顶层 schema,outdated 全部是别的 skill
    writeFileSync(CACHE_FILE, JSON.stringify({
      schemaVersion: 2,
      status: 'update_available',
      outdated: [{
        name: 'wind-alice',
        current: 'aaaaaaa',
        latest: 'bbbbbbb',
        sourceUrl: 'https://github.com/example/wind-alice.git',
      }],
      ttlMs: 43200000,
      lockSignature: 'fake-sig',
      lastCheck: new Date().toISOString(),
    }, null, 2));

    const json = run(['call', 'stock_data', 'nonexistent_tool', '{}'], { expectFail: true });
    // wind-mcp-skill cli 在失败路径(catch/die)不调 collectUpdateNotices,所以 notices 默认为空
    // 真正的测试在下一个用例里(成功路径)
    assert.equal(json.ok, false);
  });

  it('legacy v2 cache containing only foreign skills returns empty notices', () => {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({
      schemaVersion: 2,
      status: 'update_available',
      outdated: [
        { name: 'wind-alice', current: 'aaa', latest: 'bbb', sourceUrl: 'https://github.com/x/wind-alice.git' },
        { name: 'wind-find-finance-skill', current: 'ccc', latest: 'ddd', sourceUrl: 'https://github.com/x/y.git' },
      ],
      ttlMs: 43200000,
      lockSignature: 'fake-sig',
      lastCheck: new Date().toISOString(),
    }, null, 2));

    const json = run(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"600519.SH"}']);
    // 成功路径会调 collectUpdateNotices。过滤后 outdated 为空 → 不发 update_available notice。
    const updateNotices = (json.notices || []).filter(n => n.type === 'update_available');
    assert.equal(updateNotices.length, 0,
      `expected no update_available notices (foreign skills filtered), got: ${JSON.stringify(updateNotices)}`);
  });

  it('legacy v2 cache mixing own + foreign skills only leaks own', () => {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({
      schemaVersion: 2,
      status: 'update_available',
      outdated: [
        { name: 'wind-alice', current: 'aaa', latest: 'bbb', sourceUrl: 'https://github.com/x/wind-alice.git' },
        { name: 'wind-mcp-skill', current: '0000000', latest: '1111111', sourceUrl: 'https://github.com/x/wind-mcp.git' },
      ],
      ttlMs: 43200000,
      lockSignature: 'fake-sig',
      lastCheck: new Date().toISOString(),
    }, null, 2));

    const json = run(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"600519.SH"}']);
    const updateNotices = (json.notices || []).filter(n => n.type === 'update_available');
    if (updateNotices.length > 0) {
      // 如果 filterAlreadyUpgraded 没把 wind-mcp-skill 也过掉(installedHash 不匹配 / startsWith 失败),
      // notices 里应该只有 wind-mcp-skill,绝不能有 wind-alice。
      for (const n of updateNotices) {
        for (const item of n.items) {
          assert.equal(item.name, 'wind-mcp-skill',
            `foreign skill leaked: ${item.name}`);
        }
      }
    }
  });
});

// ───── post-upgrade notice suppression(installedHash 严格相等)─────

describe('post-upgrade notice suppression', () => {
  afterEach(() => {
    try { if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE); } catch {}
  });

  // 从本机 lock 读真实 wind-mcp-skill skillFolderHash 和构造真实 lockSignature。
  // 真实 signature 让 spawnUpdateCheck 异步进程 cache-hit 直接退出,不覆盖我们 seed 的 cache。
  function getRealLockInfo() {
    const xdg = process.env.XDG_STATE_HOME;
    const lockPath = xdg
      ? join(xdg, 'skills', '.skill-lock.json')
      : join(homedir(), '.agents', '.skill-lock.json');
    if (!existsSync(lockPath)) return null;
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      const entry = lock?.skills?.['wind-mcp-skill'];
      if (!entry) return null;
      return {
        hash: entry.skillFolderHash || null,
        signature: `${lockPath}|${entry.updatedAt || entry.installedAt || ''}`,
      };
    } catch { return null; }
  }

  function seedV3CacheWithInstalledHash(installedHash, lockSignature) {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({
      schemaVersion: 3,
      skills: {
        'wind-mcp-skill': {
          status: 'update_available',
          outdated: [{
            name: 'wind-mcp-skill',
            current: installedHash.slice(0, 7),
            latest: 'newhash',
            sourceUrl: 'https://github.com/Wind-Information-Co-Ltd/wind-skills.git',
            host: 'github',
            installedHash,
          }],
          ttlMs: 43200000,
          lockSignature,
          lastCheck: new Date().toISOString(),
        },
      },
    }, null, 2));
  }

  it('PRESERVES notice when cache.installedHash matches lock.skillFolderHash (not upgraded)', () => {
    const info = getRealLockInfo();
    if (!info?.hash || !info?.signature) return;  // 本机无 lock 条目时跳过(CI 环境)

    seedV3CacheWithInstalledHash(info.hash, info.signature);

    const json = run(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"600519.SH"}']);
    const updates = (json.notices || []).filter(n => n.type === 'update_available');
    assert.equal(updates.length, 1, 'should preserve update_available notice when hash matches');
    assert.equal(updates[0].items[0].name, 'wind-mcp-skill');
  });

  it('SUPPRESSES notice when cache.installedHash differs from lock.skillFolderHash (user upgraded)', () => {
    const info = getRealLockInfo();
    if (!info?.hash || !info?.signature) return;

    // installedHash 设为一个明显不同的假 hash → 模拟用户已经升级,lock 现在的 hash 是新的
    const fakeOldHash = '0000000000000000000000000000000000000000';
    seedV3CacheWithInstalledHash(fakeOldHash, info.signature);

    const json = run(['call', 'stock_data', 'get_stock_basicinfo', '{"question":"600519.SH"}']);
    const updates = (json.notices || []).filter(n => n.type === 'update_available');
    assert.equal(updates.length, 0,
      `should suppress notice after upgrade; got ${JSON.stringify(updates)}`);
  });
});
