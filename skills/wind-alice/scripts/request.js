import randomUUID from "./uuidv7.js";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_API_URL = "http://aliceexp.wind.com.cn/Weaver/ChatAgent";
const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url))); // .../finance-stream-fetch
const WIND_AIMARKET_PORTAL = "https://aimarket.wind.com.cn";

/** 流式 status-update / UIState 里 A2A.Markdown 常见提示（体验日配额） */
const WIND_TRIAL_DAY_QUOTA_SNIPPET =
  "很抱歉，今日已超出体验期任务限额，欢迎您明日再来尝试。";

let windTrialQuotaHandled = false;

export class WindTrialQuotaExceeded extends Error {
  constructor() {
    super("WIND_TRIAL_DAY_QUOTA");
    this.name = "WindTrialQuotaExceeded";
  }
}

function logWindTrialQuotaIfPresent(events) {
  if (windTrialQuotaHandled || !Array.isArray(events) || events.length === 0) {
    return;
  }
  for (const ev of events) {
    let text;
    try {
      text = JSON.stringify(ev);
    } catch {
      continue;
    }
    if (text.includes(WIND_TRIAL_DAY_QUOTA_SNIPPET)) {
      windTrialQuotaHandled = true;
      console.error("token已使用完");
      throw new WindTrialQuotaExceeded();
    }
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = (name) => {
    const idx = args.indexOf(name);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };

  const prompt = get("--prompt") ?? get("-p");
  return { prompt };
}

function parseDotenv(content) {
  const env = {};
  for (const rawLine of content.split("\n")) {
    let line = rawLine.replace(/^﻿/, "").trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    } else {
      const hashIdx = val.indexOf(" #");
      if (hashIdx >= 0) val = val.slice(0, hashIdx).trim();
    }
    env[key] = val;
  }
  return env;
}

function getApiUrl() {
  return DEFAULT_API_URL;
}

function die(code, message, { extraHint } = {}) {
  const payload = { code, message, ...(extraHint ? { hint: extraHint } : {}) };
  console.error(JSON.stringify(payload, null, 2));
  process.exitCode = 2;
  throw new Error(message);
}

function getApiKey() {
  if (process.env.WIND_API_KEY) {
    console.log('环境')
    return process.env.WIND_API_KEY;
  }

  const localConfig = join(SKILL_DIR, 'config.json');
  if (existsSync(localConfig)) {
    try {
      const cfg = JSON.parse(readFileSync(localConfig, 'utf8'));
      if (cfg.wind_api_key) {
        console.log('本地配置')
        return cfg.wind_api_key;
      }
    } catch { }
  }

  const globalConfig = join(homedir(), '.wind-aimarket', 'config');
  if (existsSync(globalConfig)) {
    try {
      const env = parseDotenv(readFileSync(globalConfig, 'utf8'));
      if (env.WIND_API_KEY) {
        console.log('全局配置')
        return env.WIND_API_KEY;
      }
    } catch { }
  }

  die('KEY_MISSING', 'WIND_API_KEY 未配置', {
    extraHint:
      `① 获取 Key（建议先问用户是否同意打开浏览器）：\n` +
      `   $ node ${join(SKILL_DIR, 'scripts', 'cli.mjs')} open-portal\n` +
      `   或手动访问：${WIND_AIMARKET_PORTAL}（未登录通常会跳转登录页）\n\n` +
      `② 用 AskUserQuestion 让用户选 Key 存放位置（不要替用户挑默认）：\n` +
      `   A. 全局共享【推荐 — 所有 wind skill 共用】\n` +
      `   B. 仅当前 skill\n\n` +
      `③ 拿到用户选择后调：\n` +
      `   $ node ${join(SKILL_DIR, 'scripts', 'cli.mjs')} setup-key <KEY> --scope <global|skill>\n\n` +
      `④ 重试原 Wind 调用`,
  });
}

function buildHeaders(apiKey) {
  const headers = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}
function resubscribeBody({ taskId, contextId, params }) {
  return {
    jsonrpc: '2.0',
    method: 'tasks/resubscribe',
    params: {
      id: taskId || params?.params?.message?.taskId,
      contextId: contextId || params?.params?.message?.contextId,
    },
    id: randomUUID(),
  }
}
function buildBody(prompt) {
  return {
    "jsonrpc": "2.0",
    "method": "message/stream",
    "params": {
      "message": {
        "messageId": randomUUID(),
        "role": "user",
        "kind": "message",
        "parts": [
          {
            "kind": "text",
            "text": prompt
          },
          {
            "kind": "data",
            "data": {
              "chatMode": "12",
              "originalChatMode": "12",
              "switchMode": "complex",
              "timezone": "Asia/Shanghai"
            },
            "metadata": {
              "key": "Wind.WindSearch.ChatService.A2A",
              "version": "1.0.0"
            }
          }
        ],
        "contextId": randomUUID(),
        "taskId": randomUUID()
      }
    },
    "id": randomUUID()
  }
  return {
    jsonrpc: "2.0",
    method: "message/stream",
    params: {
      message: {
        messageId: randomUUID(),
        role: "user",
        kind: "message",
        parts: [
          {
            kind: "text",
            text: prompt,
          },
          {
            data: {},
            kind: "data",
            metadata: {},
          },
        ],
        contextId: randomUUID(),
        taskId: randomUUID(),
        referenceTaskIds: [],
      },
      metadata: {},
    },
    id: randomUUID(),
  };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/request.js --prompt <QUESTION>",
    "",
    "Env:",
    "  FINANCE_STREAM_API_URL",
    "  FINANCE_STREAM_API_KEY",
    "",
    "Config (optional):",
    `  ${join(SKILL_DIR, "config.json")}  (JSON: {\"finance_stream_api_key\":\"...\"})`,
    `  ${join(homedir(), ".finance-stream-fetch", "config")}  (dotenv: FINANCE_STREAM_API_KEY=...)`,
  ].join("\n");
}

export function parseSsePayload(payload) {
  return payload
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      if (!data) {
        return [];
      }

      try {
        return [JSON.parse(data)];
      } catch (error) {
        console.error("failed to parse SSE event:");
        console.error(block);
        console.error(error);
        return [];
      }
    });
}

export function extractAgentResultValues(events) {
  return events.flatMap((event) => {
    const artifact = event?.result?.artifact;
    if (event?.result?.kind !== "artifact-update" || artifact?.name !== "agentResult") {
      return [];
    }

    return (artifact.parts ?? []).flatMap((part) => {
      if (part?.kind !== "data") {
        return [];
      }

      const value = part?.data?.data;
      return value === undefined ? [] : [value];
    });
  });
}

export function formatEventOutput(event) {
  return JSON.stringify(event, null, 2);
}

export function formatValueOutput(value) {
  if (typeof value === "string") {
    return `agentResult.value: ${value}`;
  }

  return `agentResult.value: ${JSON.stringify(value, null, 2)}`;
}

function consumeSseText(state, text) {
  state.buffer += text;

  const blocks = state.buffer.split(/\r?\n\r?\n/);
  state.buffer = blocks.pop() ?? "";

  return parseSsePayload(blocks.join("\n\n"));
}

function printEvents(events) {
  for (const event of events) {
    if (
      event?.result?.kind !== "artifact-update" ||
      event?.result?.artifact?.name !== "agentResult"
    ) {
      continue;
    }

    console.log(formatEventOutput(event));
  }
}

function printAgentResultValues(values) {
  for (const value of values) {
    console.log(formatValueOutput(value));
  }
}

function emitParsedEvents(events) {
  logWindTrialQuotaIfPresent(events);
  printEvents(events);
  printAgentResultValues(extractAgentResultValues(events));
}

/** @returns {boolean} true 表示已命中体验限额，调用方应停止后续逻辑 */
function emitParsedEventsUnlessQuota(events) {
  try {
    emitParsedEvents(events);
    return false;
  } catch (e) {
    if (e instanceof WindTrialQuotaExceeded) {
      process.exitCode = 1;
      return true;
    }
    throw e;
  }
}

async function emitParsedEventsUnlessQuotaStreaming(reader, events) {
  try {
    emitParsedEvents(events);
    return false;
  } catch (e) {
    if (e instanceof WindTrialQuotaExceeded) {
      await reader.cancel().catch(() => { });
      process.exitCode = 1;
      return true;
    }
    throw e;
  }
}

/** 200 但非 text/event-stream：整包 JSON、HTML、或网关误标 Content-Type 的 SSE 文本 */
function consumeNonStreamBody(raw) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return;

  if (trimmed.includes("data:")) {
    const sseEvents = parseSsePayload(trimmed);
    if (sseEvents.length > 0) {
      if (emitParsedEventsUnlessQuota(sseEvents)) return;
      return;
    }
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      if (emitParsedEventsUnlessQuota(parsed)) return;
      if (parsed.some((e) => e && typeof e === "object" && e.error != null)) {
        process.exitCode = 1;
      }
      return;
    }
    if (parsed && typeof parsed === "object") {
      if (parsed.jsonrpc === "2.0" && parsed.error != null) {
        const KEY_MISSING_CODE = -32603;// key无效或过期了
        if (parsed.error.code == KEY_MISSING_CODE) {
          die('KEY_MISSING', 'WIND_API_KEY 未配置', {
            extraHint:
              `① 获取 Key（建议先问用户是否同意打开浏览器）：\n` +
              `   $ node ${join(SKILL_DIR, 'scripts', 'cli.mjs')} open-portal\n` +
              `   或手动访问：${WIND_AIMARKET_PORTAL}（未登录通常会跳转登录页）\n\n` +
              `② 用 AskUserQuestion 让用户选 Key 存放位置（不要替用户挑默认）：\n` +
              `   A. 全局共享【推荐 — 所有 wind skill 共用】\n` +
              `   B. 仅当前 skill\n\n` +
              `③ 拿到用户选择后调：\n` +
              `   $ node ${join(SKILL_DIR, 'scripts', 'cli.mjs')} setup-key <KEY> --scope <global|skill>\n\n` +
              `④ 重试原 Wind 调用`,
          })
        }
        process.exitCode = 1;
        return;
      }
      if (emitParsedEventsUnlessQuota([parsed])) return;
      return;
    }
  } catch {
    /* 非 JSON，按原文输出 */
  }

  console.log(trimmed);
}

async function drainSseStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = { buffer: "" };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const events = consumeSseText(state, chunk);
    if (await emitParsedEventsUnlessQuotaStreaming(reader, events)) return;
  }

  const remaining = decoder.decode();
  if (remaining) {
    const events = consumeSseText(state, remaining);
    if (await emitParsedEventsUnlessQuotaStreaming(reader, events)) return;
  }

  if (state.buffer.trim()) {
    const events = parseSsePayload(state.buffer);
    if (await emitParsedEventsUnlessQuotaStreaming(reader, events)) return;
  }
}

async function main() {
  const { prompt } = parseArgs(process.argv);
  if (!prompt || !prompt.trim()) {
    console.error("missing --prompt");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const url = getApiUrl();
  const apiKey = getApiKey();
  const headers = buildHeaders(apiKey);
  const body = buildBody(prompt);

  const MAX_RETRIES = 10;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * 1, 10000);
      console.error(`[reconnect] attempt ${attempt}/${MAX_RETRIES}, waiting ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const requestBody = attempt === 0 ? body : resubscribeBody({ params: body });

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (e) {
      console.error(`[network error] ${e.message}`);
      if (attempt < MAX_RETRIES) continue;
      console.error("max retries exceeded");
      process.exitCode = 1;
      return;
    }

    console.log("status:", response.status, response.statusText);
    console.log("headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("request failed:");
      console.error(errorText);
      if (response.status >= 500 && attempt < MAX_RETRIES) continue;
      process.exitCode = 1;
      return;
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const useSseReader =
      contentType.includes("text/event-stream") && response.body != null;

    if (useSseReader) {
      let streamError = null;
      try {
        await drainSseStream(response);
        return;
      } catch (e) {
        streamError = e;
      }

      console.error(`[stream error] ${streamError.message}`);
      if (attempt < MAX_RETRIES) continue;
      console.error("max retries exceeded");
      process.exitCode = 1;
      return;
    }

    let bodyText;
    try {
      bodyText = await response.text();
    } catch (e) {
      console.error(`[read body error] ${e.message}`);
      if (attempt < MAX_RETRIES) continue;
      console.error("max retries exceeded");
      process.exitCode = 1;
      return;
    }

    consumeNonStreamBody(bodyText);
    return;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("request error:");
    console.error(error);
    process.exitCode = 1;
  });
}

