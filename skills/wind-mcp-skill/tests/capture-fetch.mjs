// Preload: mock MCP HTTP and record the last tools/call arguments.
import { writeFileSync } from 'node:fs';

const capturePath = process.env.WIND_MOCK_CAPTURE;
const captured = [];

function sse(obj) {
  return `event: message\ndata: ${JSON.stringify(obj)}\n\n`;
}

globalThis.fetch = async (_url, opts = {}) => {
  let payload = {};
  try { payload = JSON.parse(opts.body || '{}'); } catch { payload = {}; }

  if (payload.method === 'initialize') {
    return {
      ok: true, status: 200, statusText: 'OK',
      text: async () => sse({
        jsonrpc: '2.0', id: 1,
        result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'mock-wind', version: '0' } },
      }),
    };
  }

  captured.push(payload);
  if (capturePath) writeFileSync(capturePath, JSON.stringify(captured, null, 2) + '\n');

  return {
    ok: true, status: 200, statusText: 'OK',
    text: async () => sse({
      jsonrpc: '2.0', id: payload.id || 1,
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, captured: true }) }] },
    }),
  };
};
