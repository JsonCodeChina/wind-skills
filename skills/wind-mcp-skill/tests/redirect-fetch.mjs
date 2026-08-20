// Preload for run-all-tools-tests.mjs: transparently redirect the skill's
// economic_data calls to a "newtools" test server that hosts
// economic_indicator_search / economic_indicator_data_query (which use a
// wind.sessionid header instead of Bearer). Everything else in cli.mjs runs
// unchanged, so this exercises the real pipeline end-to-end.
//
// Configure via env (no secrets are hardcoded here):
//   WIND_NEWTOOLS_URL      full MCP url of the test server
//   WIND_NEWTOOLS_SESSION  wind.sessionid value for that server
// If either is unset, no redirect happens (calls go to prod as usual).
const URL = process.env.WIND_NEWTOOLS_URL;
const SESSION = process.env.WIND_NEWTOOLS_SESSION;
const orig = globalThis.fetch;

globalThis.fetch = async (url, opts = {}) => {
  if (URL && SESSION && typeof url === 'string' && url.includes('vserver_economic_data')) {
    const headers = { ...(opts.headers || {}) };
    delete headers.Authorization;
    headers['wind.sessionid'] = SESSION;
    return orig(URL, { ...opts, headers });
  }
  return orig(url, opts);
};
