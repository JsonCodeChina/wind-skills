// Preload for run-code-matrix-tests.mjs. Fakes the MCP backend so tools/call
// returns an inner payload {data:{code:<CODE>, data:{rows:[...]}}, error:null}.
// Used to prove the CLI's business-code success boundary without any network.
//   WIND_MOCK_CODE = the numeric code to return (e.g. "200", "1003", "-1")
//   WIND_MOCK_STR=1 => emit data.code as a STRING instead of a number
const RAW = process.env.WIND_MOCK_CODE ?? '200';
const codeVal = process.env.WIND_MOCK_STR === '1'
  ? String(RAW)
  : (/^-?\d+$/.test(RAW) ? Number(RAW) : RAW);

function sse(obj) { return `event: message\ndata: ${JSON.stringify(obj)}\n\n`; }
function makeResponse(body) { return { ok: true, status: 200, statusText: 'OK', text: async () => body }; }

globalThis.fetch = async (_url, opts = {}) => {
  const b = JSON.parse(opts.body);
  if (b.method === 'initialize') {
    return makeResponse(sse({ jsonrpc: '2.0', id: b.id, result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'mock', version: '0' } } }));
  }
  const inner = { data: { code: codeVal, data: { rows: [['x', 1]] } }, error: null };
  return makeResponse(sse({ jsonrpc: '2.0', id: b.id, result: { content: [{ type: 'text', text: JSON.stringify(inner) }], isError: false } }));
};
