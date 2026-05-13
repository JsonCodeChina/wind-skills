import randomUUID from "./uuidv7.js";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_API_URL = "http://aliceexp.wind.com.cn/Weaver/ChatAgent";
const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url))); // .../finance-stream-fetch
const WIND_AIMARKET_PORTAL = "https://aimarket.wind.com.cn";

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
  if (process.env.WIND_API_KEY) return process.env.WIND_API_KEY;

  const localConfig = join(SKILL_DIR, 'config.json');
  if (existsSync(localConfig)) {
    try {
      const cfg = JSON.parse(readFileSync(localConfig, 'utf8'));
      if (cfg.wind_api_key) return cfg.wind_api_key;
    } catch { }
  }

  const globalConfig = join(homedir(), '.wind-aimarket', 'config');
  if (existsSync(globalConfig)) {
    try {
      const env = parseDotenv(readFileSync(globalConfig, 'utf8'));
      if (env.WIND_API_KEY) return env.WIND_API_KEY;
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
            "text": prompt,
          },
          {
            "data": {
              "chatMode": "0",
              "switchMode": "auto",
              "selectedSkillIds": [],
              "intentionModel": null,
              "files": [],
              "file": null,
              "fileIds": [],
              "index": randomUUID(),
              "questionIndex": 1,
              "coEditState": {},
              "hasCoEdit": "1",
              "questionType": "",
              "timezone": "Asia/Shanghai"
            },
            "kind": "data",
            "metadata": {
              "key": "Wind.WindSearch.ChatService.A2A",
              "version": "1.0.0"
            }
          }
        ],
        "contextId": randomUUID(),
        "taskId": randomUUID(),
        "referenceTaskIds": []
      },
      "metadata": {
        "agentCard": {
          "name": "{\"zh\":\"智能金融助理\",\"en\":\"alice chat\"}",
          "description": "{\"agentId\":\"6ba7b810-9dad-11d1-80b4-00c04fd430c8\",\"agentDescription\":{\"zh\":\"2023年诞生的智能金融助理，由万得（Wind）AI团队与金融专家团队联合开发，融合近30年金融领域知识及实时全球金融数据，为投资者提供全方位金融咨询与投资决策支持\",\"en\":\"Intelligent financial assistant launched in 2023, jointly developed by Wind AI team and financial experts, integrating 30 years of financial expertise and real-time global financial data to provide comprehensive financial consulting and investment decision support\"}}",
          "url": "https://114.80.154.45/AliceChat.Agent/",
          "version": "1.0.0",
          "capabilities": {
            "streaming": true,
            "pushNotifications": false,
            "stateTransitionHistory": false
          },
          "defaultInputModes": [
            "text/plain",
            "application/json"
          ],
          "defaultOutputModes": [
            "text/plain",
            "application/json"
          ],
          "skills": [
            {
              "id": "wind_deep_research",
              "description": "{\"cn\": \"深度研究专家，融合先进的信息收集、数据分析和推理能力，能够从海量多源数据中挖掘洞察，运用专业研究框架进行深入分析，为复杂问题提供全面、准确的研究报告和决策支持\", \"en\": \"Deep research expert that integrates advanced information gathering, data analysis and reasoning capabilities, capable of mining insights from massive multi-source data, applying professional research frameworks for in-depth analysis, and providing comprehensive and accurate research reports and decision support for complex problems\"}",
              "name": "{\"cn\": \"深度研究专家\", \"en\": \"Deep Research Expert\"}",
              "tags": [
                "研究",
                "research",
                "数据分析",
                "data-analysis",
                "信息收集",
                "information-gathering",
                "专业框架",
                "professional-framework",
                "金融",
                "finance"
              ],
              "inputModes": [
                "text/plain"
              ],
              "outputModes": [
                "text/plain",
                "application/json",
                "application/vnd.wind.agent.uistate-v1+json"
              ]
            },
            {
              "id": "wind_fact_checker",
              "description": "{\"cn\": \"专业事实核查专家，具备强大的信息验证，能够从多个权威来源验证信息准确性，识别虚假信息和误导性内容，运用专业核查方法论进行深度验证，为用户提供可靠的事实核查报告和真实性评估\", \"en\": \"Professional fact-checking expert with powerful information verification, able to verify information accuracy from multiple authoritative sources, identify false information and misleading content, apply professional fact-checking methodologies for deep verification, and provide reliable fact-checking reports and authenticity assessments for users\"}",
              "name": "{\"cn\": \"事实核查专家\", \"en\": \"Fact-Checking Expert\"}",
              "tags": [
                "事实核查",
                "fact-checking",
                "信息验证",
                "information-verification",
                "真实性评估",
                "authenticity-assessment",
                "虚假信息识别",
                "misinformation-detection",
                "专业核查",
                "professional-verification"
              ],
              "inputModes": [
                "text/plain"
              ],
              "outputModes": [
                "text/plain",
                "application/json",
                "application/vnd.wind.agent.uistate-v1+json"
              ]
            }
          ],
          "documentationUrl": "",
          "provider": {
            "name": "alice",
            "contact": ""
          },
          "security": [
            {
              "apiKey": []
            }
          ],
          "securitySchemes": {
            "apiKey": {
              "type": "",
              "name": "",
              "in": ""
            }
          },
          "supportsAuthenticatedExtendedCard": false
        },
        "activatedSkills": []
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
      const delay = Math.min(1000 * attempt, 10000);
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

    if (!response.body) {
      const text = await response.text();
      console.log(text);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state = { buffer: "" };

    let streamError = null;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const events = consumeSseText(state, text);
        printEvents(events);
        printAgentResultValues(extractAgentResultValues(events));
      }

      const remaining = decoder.decode();
      if (remaining) {
        const events = consumeSseText(state, remaining);
        printEvents(events);
        printAgentResultValues(extractAgentResultValues(events));
      }

      if (state.buffer.trim()) {
        const events = parseSsePayload(state.buffer);
        printEvents(events);
        printAgentResultValues(extractAgentResultValues(events));
      }

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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("request error:");
    console.error(error);
    process.exitCode = 1;
  });
}

