#!/usr/bin/env node
import { fileURLToPath } from "node:url";

// Thin wrapper so the skill can call a stable entrypoint.
// Delegates real work to request.js (which supports direct execution too).
import "./request.js";

const requestEntrypoint = new URL("./request.js", import.meta.url);

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  console.log(
    [
      "Usage:",
      "  node .cursor/skills/finance-stream-fetch/scripts/stream-fetch.mjs --prompt <QUESTION>",
      "",
      "Options:",
      "  --prompt, -p   user question (required)",
      "",
      "Config:",
      "  Reads FINANCE_STREAM_API_URL and FINANCE_STREAM_API_KEY from environment variables.",
      "",
      "Examples (PowerShell):",
      '  node .cursor/skills/finance-stream-fetch/scripts/stream-fetch.mjs --prompt "分析一下茅台股票情况"',
    ].join("\n"),
  );
  process.exitCode = args.length === 0 ? 2 : 0;
} else {
  // Re-run request.js so its CLI parser + streaming output runs in one place.
  const nodePath = process.execPath;
  const { spawn } = await import("node:child_process");
  const child = spawn(nodePath, [fileURLToPath(requestEntrypoint), ...args], {
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

