#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_RETELL_API_BASE = "https://api.retellai.com";
const RETELL_API_BASE = normalizeBaseUrl(process.env.RETELL_API_BASE || DEFAULT_RETELL_API_BASE);

function printHelp() {
  console.log(`Retell Flow CLI

Usage:
  retell-flow-cli.mjs validate --input <path|-> [--mode <create|update>]
  retell-flow-cli.mjs create --input <path|->
  retell-flow-cli.mjs update --conversation-flow-id <id> --input <path|-> [--version <n>]
  retell-flow-cli.mjs get --conversation-flow-id <id> [--version <n>]
  retell-flow-cli.mjs list [--limit <n>] [--pagination-key <key>] [--pagination-key-version <n>]
  retell-flow-cli.mjs delete --conversation-flow-id <id>

Environment:
  RETELL_API_KEY   Required for create, update, get, list, and delete
  RETELL_API_BASE  Optional, defaults to https://api.retellai.com
`);
}

function fail(message, code = 1) {
  console.error(`Error: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      fail(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }

  return { command, options };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readInput(inputPath) {
  if (!inputPath) {
    fail("Missing --input");
  }

  if (inputPath === "-") {
    const raw = await readStdin();
    if (!raw.trim()) {
      fail("No JSON was received on stdin");
    }
    return raw;
  }
  return fs.promises.readFile(inputPath, "utf8");
}

function parseJson(raw, sourceLabel) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Invalid JSON in ${sourceLabel}: ${message}`);
  }
}

function validateCreatePayload(payload) {
  const missing = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail("Payload must be a JSON object");
  }
  if (!payload.model_choice) missing.push("model_choice");
  if (!Array.isArray(payload.nodes)) missing.push("nodes");
  if (!payload.start_speaker) missing.push("start_speaker");
  if (missing.length > 0) {
    fail(`Create payload is missing required field(s): ${missing.join(", ")}`);
  }
}

function validateUpdatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail("Payload must be a JSON object");
  }
}

function getApiKey() {
  ensureLocalEnvLoaded();
  const value = process.env.RETELL_API_KEY?.trim() || process.env.PHONE_RETELL_API_KEY?.trim();
  if (!value) {
    fail("RETELL_API_KEY is not set");
  }
  return value;
}

function normalizeBaseUrl(value) {
  return String(value).replace(/\/+$/, "");
}

let envLoaded = false;

function parseEnvAssignment(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const exportTrimmed = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const match = exportTrimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return null;

  let [, key, rawValue] = match;
  rawValue = rawValue.trim();
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    rawValue = rawValue.slice(1, -1);
  }

  rawValue = rawValue.replace(/\\n/g, "\n");
  return { key, value: rawValue };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseEnvAssignment(line);
    if (!parsed) continue;
    if (process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

function ensureLocalEnvLoaded() {
  if (envLoaded) return;
  envLoaded = true;

  const searchRoots = [];
  let current = process.cwd();
  while (true) {
    searchRoots.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  for (const root of searchRoots) {
    loadEnvFile(path.join(root, ".env.local"));
    loadEnvFile(path.join(root, ".env.development.local"));
    loadEnvFile(path.join(root, ".env"));
    if (process.env.RETELL_API_KEY || process.env.PHONE_RETELL_API_KEY) {
      break;
    }
  }
}

async function retellRequest({ method, path, query, body }) {
  const url = new URL(`${RETELL_API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = response.status === 204 ? "" : await response.text();
  const parsed = text ? tryParseJson(text) : null;

  if (!response.ok) {
    const detail = parsed ? JSON.stringify(parsed, null, 2) : text || response.statusText;
    fail(`Retell API ${method} ${path} failed (${response.status}):\n${detail}`);
  }

  console.log(JSON.stringify(parsed ?? { ok: true, status: response.status }, null, 2));
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === "validate") {
    const raw = await readInput(options.input);
    const payload = parseJson(raw, options.input);
    const mode = String(options.mode || "create");
    if (mode === "update") {
      validateUpdatePayload(payload);
    } else if (mode === "create") {
      validateCreatePayload(payload);
    } else {
      fail("--mode must be create or update");
    }
    console.log(JSON.stringify({ ok: true, message: `Payload looks valid for ${mode}.` }, null, 2));
    return;
  }

  if (command === "create") {
    const raw = await readInput(options.input);
    const payload = parseJson(raw, options.input);
    validateCreatePayload(payload);
    await retellRequest({
      method: "POST",
      path: "/create-conversation-flow",
      body: payload,
    });
    return;
  }

  if (command === "update") {
    const flowId = options["conversation-flow-id"];
    if (!flowId) {
      fail("Missing --conversation-flow-id");
    }
    const raw = await readInput(options.input);
    const payload = parseJson(raw, options.input);
    validateUpdatePayload(payload);
    await retellRequest({
      method: "PATCH",
      path: `/update-conversation-flow/${encodeURIComponent(flowId)}`,
      query: { version: options.version },
      body: payload,
    });
    return;
  }

  if (command === "get") {
    const flowId = options["conversation-flow-id"];
    if (!flowId) {
      fail("Missing --conversation-flow-id");
    }
    await retellRequest({
      method: "GET",
      path: `/get-conversation-flow/${encodeURIComponent(flowId)}`,
      query: { version: options.version },
    });
    return;
  }

  if (command === "list") {
    const limit = options.limit ? Number.parseInt(String(options.limit), 10) : 20;
    if (Number.isNaN(limit) || limit < 1) {
      fail("--limit must be a positive integer");
    }
    await retellRequest({
      method: "GET",
      path: "/list-conversation-flows",
      query: {
        limit,
        pagination_key: options["pagination-key"] === true ? undefined : options["pagination-key"],
        pagination_key_version:
          options["pagination-key-version"] === true ? undefined : options["pagination-key-version"],
      },
    });
    return;
  }

  if (command === "delete") {
    const flowId = options["conversation-flow-id"];
    if (!flowId) {
      fail("Missing --conversation-flow-id");
    }
    await retellRequest({
      method: "DELETE",
      path: `/delete-conversation-flow/${encodeURIComponent(flowId)}`,
    });
    return;
  }

  fail(`Unknown command: ${command}`);
}

await main();
