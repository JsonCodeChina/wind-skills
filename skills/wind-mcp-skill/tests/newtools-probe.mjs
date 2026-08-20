// Diagnostic: list tools or call one tool on an MCP server that authenticates
// with a wind.sessionid header (e.g. the newtools test server). Handy when a
// tool's schema or live response shape needs confirming before editing the skill.
//
// Configure via env (no secrets hardcoded):
//   WIND_MCP_URL      full MCP url
//   WIND_MCP_SESSION  wind.sessionid value
// For self-signed IP certs, prefix the command with NODE_TLS_REJECT_UNAUTHORIZED=0.
//
// Usage:
//   node tests/newtools-probe.mjs list
//   node tests/newtools-probe.mjs call <tool_name> '<argsJson>'
const URL = process.env.WIND_MCP_URL;
const SESSION = process.env.WIND_MCP_SESSION;
if (!URL || !SESSION) {
  console.error('set WIND_MCP_URL and WIND_MCP_SESSION');
  process.exit(2);
}

function parseSSE(text) {
  const t = text.trim();
  if (t.startsWith('{')) return JSON.parse(t);
  for (const line of t.split('\n')) {
    const s = line.trim();
    if (s.startsWith('data:')) return JSON.parse(s.slice(5).trim());
  }
  throw new Error('cannot parse: ' + t.slice(0, 200));
}

async function rpc(method, params) {
  const resp = await fetch(URL, {
    method: 'POST',
    headers: {
      'wind.sessionid': SESSION,
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(120000),
  });
  return { status: resp.status, text: await resp.text() };
}

const mode = process.argv[2] || 'list';
const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'newtools-probe', version: '0' } });
console.log(`initialize HTTP ${init.status}`);
if (init.status !== 200) { console.log(init.text.slice(0, 500)); process.exit(1); }

if (mode === 'list') {
  const r = await rpc('tools/list', {});
  const tools = parseSSE(r.text).result?.tools || [];
  for (const t of tools) {
    console.log(`\n===== ${t.name} =====`);
    console.log((t.description || '').slice(0, 300));
    console.log('inputSchema:', JSON.stringify(t.inputSchema, null, 2));
  }
} else if (mode === 'call') {
  const [tool, argsJson] = process.argv.slice(3);
  const r = await rpc('tools/call', { name: tool, arguments: JSON.parse(argsJson), _meta: { clientVersion: 'probe' } });
  console.log(`tools/call HTTP ${r.status}\n--- RAW ---\n${r.text}`);
} else {
  console.error('mode must be "list" or "call"');
  process.exit(2);
}
