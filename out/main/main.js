"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const readline = require("readline");
const os = require("os");
const Parser = require("web-tree-sitter");
const chokidar = require("chokidar");
const simpleGit = require("simple-git");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const readline__namespace = /* @__PURE__ */ _interopNamespaceDefault(readline);
const os__namespace = /* @__PURE__ */ _interopNamespaceDefault(os);
function resolveProjectPath(encoded) {
  if (!encoded.startsWith("-")) return encoded.replace(/-/g, "/");
  const rest = encoded.slice(1);
  return tryResolve("/", rest) ?? "/" + rest.replace(/-/g, "/");
}
function tryResolve(base, remaining) {
  if (!remaining) return base;
  let searchFrom = 0;
  while (true) {
    const dashIdx = remaining.indexOf("-", searchFrom);
    const segment = dashIdx === -1 ? remaining : remaining.slice(0, dashIdx);
    if (!segment) {
      searchFrom = dashIdx + 1;
      if (dashIdx === -1) break;
      continue;
    }
    const candidate = path__namespace.join(base, segment);
    if (fs__namespace.existsSync(candidate)) {
      if (dashIdx === -1) return candidate;
      const deeper = tryResolve(candidate, remaining.slice(dashIdx + 1));
      if (deeper !== null) return deeper;
    }
    if (dashIdx === -1) break;
    searchFrom = dashIdx + 1;
  }
  return null;
}
function listProjects() {
  const claudeDir = path__namespace.join(os__namespace.homedir(), ".claude", "projects");
  if (!fs__namespace.existsSync(claudeDir)) return [];
  return fs__namespace.readdirSync(claudeDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => {
    const projectPath = resolveProjectPath(e.name);
    return { encodedName: e.name, projectPath, displayName: projectPath };
  });
}
function listSessions(encodedName) {
  const claudeDir = path__namespace.join(os__namespace.homedir(), ".claude", "projects", encodedName);
  if (!fs__namespace.existsSync(claudeDir)) return [];
  return fs__namespace.readdirSync(claudeDir).filter((f) => f.endsWith(".jsonl")).map((f) => {
    const filePath = path__namespace.join(claudeDir, f);
    const stat = fs__namespace.statSync(filePath);
    return { sessionId: f.replace(".jsonl", ""), filePath, mtime: stat.mtimeMs };
  }).sort((a, b) => b.mtime - a.mtime);
}
function inferActionType(toolName, input) {
  switch (toolName) {
    case "Read":
      return "read";
    case "Write": {
      const content = input["content"];
      return content !== void 0 && content.length === 0 ? "deleted" : "created";
    }
    case "Edit":
    case "MultiEdit":
      return "edited";
    case "Bash": {
      const cmd = input["command"] ?? "";
      if (/\brm\b/.test(cmd)) return "deleted";
      if (/\bmv\b/.test(cmd)) return "edited";
      if (/\bmkdir\b|\btouch\b/.test(cmd)) return "created";
      if (/\bcat\b/.test(cmd)) return "read";
      return "executed";
    }
    case "Glob":
    case "Grep":
    case "LS":
      return "searched";
    case "Agent":
      return "spawned";
    default:
      return "executed";
  }
}
function extractFilePath(toolName, input) {
  if (input["file_path"]) return input["file_path"];
  if (toolName === "LS" && input["path"]) return input["path"];
  return void 0;
}
async function parseSession(filePath) {
  const sessionId = path__namespace.basename(filePath, ".jsonl");
  const actions = [];
  const markers = [];
  const entries = [];
  const rl = readline__namespace.createInterface({
    input: fs__namespace.createReadStream(filePath),
    crlfDelay: Infinity
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
    }
  }
  for (const e of entries) {
    if (e.type === "summary" && e.timestamp) {
      const summaryText = e.summary ?? (Array.isArray(e.message?.content) ? e.message.content.filter((b) => b["type"] === "text").map((b) => b["text"]).join(" ") : typeof e.message?.content === "string" ? e.message.content : "");
      markers.push({
        id: e.uuid ?? `summary-${e.timestamp}`,
        type: "compaction",
        timestamp: e.timestamp,
        details: summaryText.slice(0, 120) || void 0
      });
    }
  }
  const relevant = entries.filter((e) => e.type === "user" || e.type === "assistant");
  const toolResults = /* @__PURE__ */ new Map();
  for (const e of relevant) {
    if (e.type !== "user") continue;
    const content = e.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block["type"] === "tool_result") {
        const id = block["tool_use_id"];
        const result = block["content"];
        toolResults.set(id, typeof result === "string" ? result : JSON.stringify(result));
      }
    }
  }
  const exchanges = [];
  let pendingUserMsg = null;
  let pendingAssistantToolCalls = [];
  let pendingAssistantText = "";
  let pendingAssistantModel;
  let pendingAssistantUsage;
  let pendingAssistantId = "";
  let pendingAssistantTs = "";
  function flushExchange() {
    if (!pendingUserMsg) return;
    const assistantMsg = {
      id: pendingAssistantId || pendingUserMsg.id + "-assistant",
      role: "assistant",
      timestamp: pendingAssistantTs || pendingUserMsg.timestamp,
      textContent: pendingAssistantText.trim(),
      toolCalls: pendingAssistantToolCalls,
      model: pendingAssistantModel,
      tokenUsage: pendingAssistantUsage
    };
    const exchangeActions = pendingAssistantToolCalls.map((tc) => {
      const fp = extractFilePath(tc.toolName, tc.input);
      const action = {
        id: tc.id,
        sessionId,
        timestamp: pendingUserMsg.timestamp,
        type: inferActionType(tc.toolName, tc.input),
        filePath: fp,
        toolName: tc.toolName,
        input: tc.input
      };
      return action;
    });
    actions.push(...exchangeActions);
    const affectedNodes = Array.from(
      new Set(exchangeActions.map((a) => a.filePath).filter((p) => !!p))
    );
    exchanges.push({
      id: pendingUserMsg.id,
      userMessage: pendingUserMsg,
      assistantMessage: assistantMsg,
      actions: exchangeActions,
      affectedNodes
    });
    pendingUserMsg = null;
    pendingAssistantToolCalls = [];
    pendingAssistantText = "";
    pendingAssistantModel = void 0;
    pendingAssistantUsage = void 0;
    pendingAssistantId = "";
    pendingAssistantTs = "";
  }
  for (const e of relevant) {
    const content = e.message?.content;
    const ts = e.timestamp ?? "";
    if (e.type === "user") {
      if (typeof content === "string" && content.trim()) {
        flushExchange();
        pendingUserMsg = {
          id: e.uuid ?? "",
          role: "user",
          timestamp: ts,
          textContent: content.trim(),
          toolCalls: []
        };
      }
    } else if (e.type === "assistant" && Array.isArray(content)) {
      for (const block of content) {
        if (block["type"] === "text") {
          pendingAssistantText += block["text"] ?? "";
          if (!pendingAssistantId) pendingAssistantId = e.uuid ?? "";
          if (!pendingAssistantTs) pendingAssistantTs = ts;
        } else if (block["type"] === "tool_use") {
          const toolName = block["name"];
          const input = block["input"] ?? {};
          const id = block["id"];
          const tc = {
            id,
            toolName,
            input,
            result: toolResults.get(id),
            affectedFiles: extractFilePath(toolName, input) ? [extractFilePath(toolName, input)] : []
          };
          pendingAssistantToolCalls.push(tc);
          if (!pendingAssistantId) pendingAssistantId = e.uuid ?? "";
          if (!pendingAssistantTs) pendingAssistantTs = ts;
        }
      }
      if (e.message?.model) pendingAssistantModel = e.message.model;
      if (e.message?.usage) {
        const u = e.message.usage;
        pendingAssistantUsage = {
          input: u["input_tokens"] ?? 0,
          output: u["output_tokens"] ?? 0,
          cacheRead: u["cache_read_input_tokens"] ?? void 0,
          cacheWrite: u["cache_creation_input_tokens"] ?? void 0
        };
      }
    }
  }
  flushExchange();
  for (let i = 1; i < exchanges.length; i++) {
    const prevModel = exchanges[i - 1].assistantMessage.model;
    const curModel = exchanges[i].assistantMessage.model;
    if (prevModel && curModel && prevModel !== curModel) {
      markers.push({
        id: `model-switch-${i}`,
        type: "model_switch",
        timestamp: exchanges[i].userMessage.timestamp,
        details: `${prevModel} → ${curModel}`
      });
    }
  }
  markers.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { actions, exchanges, markers, sessionId };
}
let parserReady = false;
let initPromise = null;
async function ensureInit() {
  if (parserReady) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const wasmBase = path__namespace.dirname(require.resolve("web-tree-sitter"));
    await Parser.init({ locateFile: () => path__namespace.join(wasmBase, "tree-sitter.wasm") });
    parserReady = true;
  })();
  return initPromise;
}
const languageCache = /* @__PURE__ */ new Map();
async function getLanguage$1(lang) {
  if (languageCache.has(lang)) return languageCache.get(lang);
  const wasmDir = path__namespace.join(
    path__namespace.dirname(require.resolve("tree-sitter-wasms/package.json")),
    "out"
  );
  const nameMap = {
    python: "python",
    typescript: "typescript",
    javascript: "javascript",
    rust: "rust",
    c: "c",
    cpp: "cpp"
  };
  const wasmName = nameMap[lang];
  if (!wasmName) return null;
  const wasmPath = path__namespace.join(wasmDir, `tree-sitter-${wasmName}.wasm`);
  if (!fs__namespace.existsSync(wasmPath)) return null;
  try {
    const language = await Parser.Language.load(wasmPath);
    languageCache.set(lang, language);
    return language;
  } catch {
    return null;
  }
}
function nodeName(node) {
  for (const child of node.children) {
    if (child.type === "identifier" || child.type === "name" || child.type === "type_identifier") {
      return child.text;
    }
  }
  return node.text.split(/\s|\(/)[0].slice(0, 40);
}
function walk(node, ctx, lang) {
  const type = node.type;
  let pushed = null;
  if (lang === "python") {
    if (type === "class_definition") {
      const name = nodeName(node);
      const id = `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: "class", startLine: node.startPosition.row, endLine: node.endPosition.row };
      ctx.symbols.push(pushed);
    } else if (type === "function_definition" || type === "decorated_definition") {
      const target = type === "decorated_definition" ? node.children.find((c) => c.type === "function_definition" || c.type === "async_function_definition") : node;
      if (target) {
        const name = nodeName(target);
        const id = ctx.currentClass ? `${ctx.currentClass}.${name}` : `${ctx.fileId}::${name}`;
        const kind = ctx.currentClass ? "method" : "function";
        pushed = { id, name, kind, startLine: node.startPosition.row, endLine: node.endPosition.row, parent: ctx.currentClass };
        ctx.symbols.push(pushed);
      }
    }
  }
  if (lang === "typescript" || lang === "javascript") {
    if (type === "class_declaration" || type === "abstract_class_declaration") {
      const name = nodeName(node);
      const id = `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: "class", startLine: node.startPosition.row, endLine: node.endPosition.row };
      ctx.symbols.push(pushed);
    } else if (type === "interface_declaration") {
      const name = nodeName(node);
      const id = `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: "interface", startLine: node.startPosition.row, endLine: node.endPosition.row };
      ctx.symbols.push(pushed);
    } else if (type === "type_alias_declaration") {
      const name = nodeName(node);
      const id = `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: "type", startLine: node.startPosition.row, endLine: node.endPosition.row };
      ctx.symbols.push(pushed);
    } else if (type === "enum_declaration") {
      const name = nodeName(node);
      const id = `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: "enum", startLine: node.startPosition.row, endLine: node.endPosition.row };
      ctx.symbols.push(pushed);
    } else if (type === "function_declaration" || type === "generator_function_declaration") {
      const name = nodeName(node);
      const id = ctx.currentClass ? `${ctx.currentClass}.${name}` : `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: ctx.currentClass ? "method" : "function", startLine: node.startPosition.row, endLine: node.endPosition.row, parent: ctx.currentClass };
      ctx.symbols.push(pushed);
    } else if (type === "method_definition") {
      const name = nodeName(node);
      const id = ctx.currentClass ? `${ctx.currentClass}.${name}` : `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: "method", startLine: node.startPosition.row, endLine: node.endPosition.row, parent: ctx.currentClass };
      ctx.symbols.push(pushed);
    } else if (type === "lexical_declaration" || type === "variable_declaration") {
      for (const decl of node.children.filter((c) => c.type === "variable_declarator")) {
        const val = decl.children.find((c) => c.type === "arrow_function" || c.type === "function");
        if (val) {
          const name = decl.children[0]?.text ?? "";
          if (name) {
            const id = `${ctx.fileId}::${name}`;
            pushed = { id, name, kind: "function", startLine: node.startPosition.row, endLine: node.endPosition.row };
            ctx.symbols.push(pushed);
          }
        }
      }
    }
  }
  if (lang === "rust") {
    if (type === "struct_item") {
      const name = nodeName(node);
      const id = `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: "struct", startLine: node.startPosition.row, endLine: node.endPosition.row };
      ctx.symbols.push(pushed);
    } else if (type === "enum_item") {
      const name = nodeName(node);
      const id = `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: "enum", startLine: node.startPosition.row, endLine: node.endPosition.row };
      ctx.symbols.push(pushed);
    } else if (type === "trait_item") {
      const name = nodeName(node);
      const id = `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: "interface", startLine: node.startPosition.row, endLine: node.endPosition.row };
      ctx.symbols.push(pushed);
    } else if (type === "type_item") {
      const name = nodeName(node);
      const id = `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: "type", startLine: node.startPosition.row, endLine: node.endPosition.row };
      ctx.symbols.push(pushed);
    } else if (type === "function_item") {
      const name = nodeName(node);
      const id = ctx.currentClass ? `${ctx.currentClass}.${name}` : `${ctx.fileId}::${name}`;
      pushed = { id, name, kind: ctx.currentClass ? "method" : "function", startLine: node.startPosition.row, endLine: node.endPosition.row, parent: ctx.currentClass };
      ctx.symbols.push(pushed);
    }
  }
  if (lang === "c" || lang === "cpp") {
    if (type === "struct_specifier" || type === "class_specifier") {
      const name = nodeName(node);
      if (name && name !== "{") {
        const id = `${ctx.fileId}::${name}`;
        const kind = type === "class_specifier" ? "class" : "struct";
        pushed = { id, name, kind, startLine: node.startPosition.row, endLine: node.endPosition.row };
        ctx.symbols.push(pushed);
      }
    } else if (type === "enum_specifier") {
      const name = nodeName(node);
      if (name && name !== "{") {
        const id = `${ctx.fileId}::${name}`;
        pushed = { id, name, kind: "enum", startLine: node.startPosition.row, endLine: node.endPosition.row };
        ctx.symbols.push(pushed);
      }
    } else if (type === "function_definition") {
      const declarator = node.children.find((c) => c.type.includes("declarator"));
      const funcDeclarator = declarator?.children.find((c) => c.type === "function_declarator");
      const nameNode = funcDeclarator?.children[0];
      const name = nameNode?.text ?? "";
      if (name) {
        const id = ctx.currentClass ? `${ctx.currentClass}.${name}` : `${ctx.fileId}::${name}`;
        pushed = { id, name, kind: ctx.currentClass ? "method" : "function", startLine: node.startPosition.row, endLine: node.endPosition.row, parent: ctx.currentClass };
        ctx.symbols.push(pushed);
      }
    }
  }
  const prevClass = ctx.currentClass;
  if (pushed && (pushed.kind === "class" || pushed.kind === "struct" || pushed.kind === "interface")) {
    ctx.currentClass = pushed.id;
  }
  for (const child of node.children) {
    walk(child, ctx, lang);
  }
  ctx.currentClass = prevClass;
}
const symbolCache = /* @__PURE__ */ new Map();
async function extractSymbols(absPath, language) {
  try {
    const stat = fs__namespace.statSync(absPath);
    const cached = symbolCache.get(absPath);
    if (cached && cached.mtime === stat.mtimeMs) return cached.symbols;
    await ensureInit();
    const lang = await getLanguage$1(language);
    if (!lang) return [];
    const parser = new Parser();
    parser.setLanguage(lang);
    const src = fs__namespace.readFileSync(absPath, "utf8");
    if (src.length > 5e5) return [];
    const tree = parser.parse(src);
    const ctx = { fileId: absPath, symbols: [] };
    walk(tree.rootNode, ctx, language);
    symbolCache.set(absPath, { mtime: stat.mtimeMs, symbols: ctx.symbols });
    return ctx.symbols;
  } catch {
    return [];
  }
}
const EXCLUDE = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "__pycache__",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  ".venv",
  "venv"
]);
const LANG_MAP = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  h: "c",
  hpp: "cpp",
  go: "go",
  rb: "ruby",
  java: "java",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  toml: "toml",
  sh: "shell",
  css: "css",
  scss: "css",
  html: "html"
};
const PARSEABLE = /* @__PURE__ */ new Set(["typescript", "javascript", "python", "rust", "c", "cpp"]);
function getLanguage(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? LANG_MAP[ext] : void 0;
}
async function scanCodebase(projectPath) {
  if (!fs__namespace.existsSync(projectPath)) return [];
  const nodes = [];
  const rootName = path__namespace.basename(projectPath);
  const rootNode = {
    id: "",
    type: "directory",
    name: rootName,
    path: "",
    children: []
  };
  nodes.push(rootNode);
  const filePaths = [];
  function walkSync(absPath, relPath, parentId) {
    let entries;
    try {
      entries = fs__namespace.readdirSync(absPath, { withFileTypes: true });
    } catch {
      return;
    }
    const children = [];
    for (const entry of entries) {
      if (EXCLUDE.has(entry.name) || entry.name.startsWith(".")) continue;
      const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      const childAbs = path__namespace.join(absPath, entry.name);
      if (entry.isDirectory()) {
        const dirNode = {
          id: childRel,
          type: "directory",
          name: entry.name,
          path: childRel,
          parent: parentId,
          children: []
        };
        nodes.push(dirNode);
        children.push(childRel);
        walkSync(childAbs, childRel, childRel);
      } else if (entry.isFile()) {
        const language = getLanguage(entry.name);
        const fileNode = {
          id: childRel,
          type: "file",
          name: entry.name,
          path: childRel,
          parent: parentId,
          children: [],
          language
        };
        nodes.push(fileNode);
        children.push(childRel);
        if (language && PARSEABLE.has(language)) {
          filePaths.push({ relPath: childRel, absPath: childAbs, language });
        }
      }
    }
    if (parentId !== void 0) {
      const parentNode = nodes.find((n) => n.id === parentId);
      if (parentNode) parentNode.children.push(...children);
    }
  }
  walkSync(projectPath, "", "");
  const CONCURRENCY = 8;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  async function processFile(info) {
    let symbols;
    try {
      symbols = await extractSymbols(info.absPath, info.language);
    } catch {
      return;
    }
    if (symbols.length === 0) return;
    const fileNode = nodeMap.get(info.relPath);
    if (!fileNode) return;
    const symNodeMap = /* @__PURE__ */ new Map();
    for (const sym of symbols) {
      const nodeId = `${info.relPath}::${sym.id.slice(info.absPath.length + 2)}`;
      const parentNodeId = sym.parent ? `${info.relPath}::${sym.parent.slice(info.absPath.length + 2)}` : void 0;
      const symNode = {
        id: nodeId,
        type: sym.kind,
        name: sym.name,
        path: info.relPath,
        parent: parentNodeId ?? info.relPath,
        children: [],
        language: info.language,
        startLine: sym.startLine,
        endLine: sym.endLine
      };
      nodes.push(symNode);
      nodeMap.set(nodeId, symNode);
      symNodeMap.set(sym.id, symNode);
      if (parentNodeId) {
        const parentSym = symNodeMap.get(sym.parent);
        if (parentSym) {
          parentSym.children.push(nodeId);
        } else {
          fileNode.children.push(nodeId);
        }
      } else {
        fileNode.children.push(nodeId);
      }
    }
  }
  for (let i = 0; i < filePaths.length; i += CONCURRENCY) {
    await Promise.all(filePaths.slice(i, i + CONCURRENCY).map(processFile));
  }
  return nodes;
}
const fileOffsets = /* @__PURE__ */ new Map();
async function tailNewLines(filePath) {
  const offset = fileOffsets.get(filePath) ?? 0;
  const stat = fs__namespace.statSync(filePath);
  if (stat.size <= offset) return [];
  const buf = Buffer.alloc(stat.size - offset);
  const fd = fs__namespace.openSync(filePath, "r");
  fs__namespace.readSync(fd, buf, 0, buf.length, offset);
  fs__namespace.closeSync(fd);
  fileOffsets.set(filePath, stat.size);
  return buf.toString("utf8").split("\n").filter((l) => l.trim());
}
function sendToRenderer(channel, data) {
  electron.BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  });
}
function startSessionWatcher() {
  const claudeDir = path__namespace.join(os__namespace.homedir(), ".claude", "projects");
  if (!fs__namespace.existsSync(claudeDir)) return () => {
  };
  const watcher = chokidar.watch(`${claudeDir}/**/*.jsonl`, {
    persistent: true,
    ignoreInitial: true,
    // don't fire for existing files on startup
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  });
  watcher.on("add", async (filePath) => {
    try {
      const stat = fs__namespace.statSync(filePath);
      fileOffsets.set(filePath, stat.size);
      const result = await parseSession(filePath);
      sendToRenderer("session:new", { filePath, ...result });
    } catch {
    }
  });
  watcher.on("change", async (filePath) => {
    try {
      const newLines = await tailNewLines(filePath);
      if (newLines.length === 0) return;
      const result = await parseSession(filePath);
      sendToRenderer("session:update", { filePath, ...result });
    } catch {
    }
  });
  return () => watcher.close();
}
function isGitRepo(projectPath) {
  return fs__namespace.existsSync(path__namespace.join(projectPath, ".git"));
}
async function getGitLog(projectPath) {
  if (!isGitRepo(projectPath)) return [];
  try {
    const git = simpleGit(projectPath);
    const rawOutput = await git.raw([
      "log",
      "--max-count=200",
      "--name-only",
      "--pretty=format:COMMIT|%H|%h|%aI|%an|%s"
    ]);
    return parseGitLog(rawOutput);
  } catch {
    return [];
  }
}
function parseGitLog(raw) {
  const commits = [];
  let current = null;
  for (const line of raw.split("\n")) {
    if (line.startsWith("COMMIT|")) {
      if (current) commits.push(current);
      const parts = line.split("|");
      current = {
        hash: parts[1] ?? "",
        shortHash: parts[2] ?? "",
        date: parts[3] ?? "",
        author: parts[4] ?? "",
        message: parts.slice(5).join("|"),
        changedFiles: []
      };
    } else if (current && line.trim() && !line.startsWith("COMMIT")) {
      current.changedFiles.push(line.trim());
    }
  }
  if (current) commits.push(current);
  return commits;
}
async function getGitDiff(projectPath, commitHash) {
  if (!isGitRepo(projectPath)) return { commitHash, unified: "" };
  try {
    const git = simpleGit(projectPath);
    const unified = await git.raw(["show", "--unified=3", "--no-color", commitHash]);
    return { commitHash, unified };
  } catch {
    return { commitHash, unified: "" };
  }
}
function makeInlineDiff(oldStr, newStr, filePath) {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const header = [`--- a/${filePath}`, `+++ b/${filePath}`];
  const hunks = computeHunks(oldLines, newLines);
  return [header.join("\n"), ...hunks].join("\n");
}
function computeHunks(oldLines, newLines) {
  const CONTEXT = 3;
  const ops = buildOps(oldLines, newLines);
  const result = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].kind === "equal") {
      i++;
      continue;
    }
    const start = i;
    let end = i;
    while (end < ops.length && ops[end].kind !== "equal") end++;
    const ctxBefore = Math.max(0, start - CONTEXT);
    const ctxAfter = Math.min(ops.length, end + CONTEXT);
    const hunkOps = ops.slice(ctxBefore, ctxAfter);
    const oldStart = ops.slice(0, ctxBefore).filter((o) => o.kind !== "insert").length + 1;
    const newStart = ops.slice(0, ctxBefore).filter((o) => o.kind !== "delete").length + 1;
    const oldCount = hunkOps.filter((o) => o.kind !== "insert").length;
    const newCount = hunkOps.filter((o) => o.kind !== "delete").length;
    result.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const op of hunkOps) {
      const prefix = op.kind === "equal" ? " " : op.kind === "delete" ? "-" : "+";
      result.push(`${prefix}${op.text}`);
    }
    i = ctxAfter;
  }
  return result;
}
function buildOps(oldL, newL) {
  const lcs = computeLCS(oldL, newL);
  const ops = [];
  let oi = 0, ni = 0, li = 0;
  while (li < lcs.length) {
    while (oi < oldL.length && oldL[oi] !== lcs[li]) {
      ops.push({ kind: "delete", text: oldL[oi++] });
    }
    while (ni < newL.length && newL[ni] !== lcs[li]) {
      ops.push({ kind: "insert", text: newL[ni++] });
    }
    ops.push({ kind: "equal", text: lcs[li++] });
    oi++;
    ni++;
  }
  while (oi < oldL.length) ops.push({ kind: "delete", text: oldL[oi++] });
  while (ni < newL.length) ops.push({ kind: "insert", text: newL[ni++] });
  return ops;
}
function computeLCS(a, b) {
  const al = a.slice(0, 300), bl = b.slice(0, 300);
  const m = al.length, n = bl.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i2 = 1; i2 <= m; i2++) {
    for (let j2 = 1; j2 <= n; j2++) {
      dp[i2][j2] = al[i2 - 1] === bl[j2 - 1] ? dp[i2 - 1][j2 - 1] + 1 : Math.max(dp[i2 - 1][j2], dp[i2][j2 - 1]);
    }
  }
  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (al[i - 1] === bl[j - 1]) {
      result.unshift(al[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return result;
}
let headWatcher = null;
function startGitWatcher(projectPath) {
  stopGitWatcher();
  if (!isGitRepo(projectPath)) return () => {
  };
  const headPath = path__namespace.join(projectPath, ".git", "HEAD");
  headWatcher = chokidar.watch(headPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
  });
  headWatcher.on("change", async () => {
    const commits = await getGitLog(projectPath);
    electron.BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send("git:head-changed", commits);
    });
  });
  return stopGitWatcher;
}
function stopGitWatcher() {
  headWatcher?.close();
  headWatcher = null;
}
const TS_JS_IMPORT_RE = /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
const TS_JS_REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const PY_FROM_RE = /^from\s+(\.+[\w./]*)\s+import/gm;
const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const PY_EXTENSIONS = [".py"];
function resolveRelativeImport(sourceFile, importPath, projectPath, knownFiles) {
  const sourceDir = path.dirname(path.join(projectPath, sourceFile));
  const base = path.resolve(sourceDir, importPath);
  const basePath = path.relative(projectPath, base);
  if (knownFiles.has(basePath)) return basePath;
  const allExts = [...TS_EXTENSIONS, ...PY_EXTENSIONS];
  for (const ext of allExts) {
    const candidate = basePath + ext;
    if (knownFiles.has(candidate)) return candidate;
  }
  for (const ext of TS_EXTENSIONS) {
    const candidate = basePath + "/index" + ext;
    if (knownFiles.has(candidate)) return candidate;
  }
  return null;
}
function parseTsJsImports(sourceFile, content, projectPath, knownFiles) {
  const edges = [];
  const patterns = [TS_JS_IMPORT_RE, TS_JS_REQUIRE_RE];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const importPath = m[1];
      if (!importPath) continue;
      if (importPath.startsWith(".")) {
        const target = resolveRelativeImport(sourceFile, importPath, projectPath, knownFiles);
        if (target && target !== sourceFile) {
          edges.push({ source: sourceFile, target });
        }
      }
    }
  }
  return edges;
}
function parsePyImports(sourceFile, content, projectPath, knownFiles) {
  const edges = [];
  const sourceDir = path.dirname(path.join(projectPath, sourceFile));
  PY_FROM_RE.lastIndex = 0;
  let m;
  while ((m = PY_FROM_RE.exec(content)) !== null) {
    const mod = m[1];
    if (!mod) continue;
    const dots = mod.match(/^\.+/)?.[0].length ?? 0;
    if (dots === 0) continue;
    const modPart = mod.slice(dots).replace(/\./g, "/");
    let base = sourceDir;
    for (let i = 1; i < dots; i++) base = path.dirname(base);
    const importPath = modPart ? path.join(base, modPart) : base;
    const relPath = path.relative(projectPath, importPath);
    const candidates = [
      relPath + ".py",
      relPath + "/__init__.py"
    ];
    for (const candidate of candidates) {
      if (knownFiles.has(candidate) && candidate !== sourceFile) {
        edges.push({ source: sourceFile, target: candidate });
        break;
      }
    }
  }
  return edges;
}
function scanDeps(projectPath, filePaths) {
  const knownFiles = new Set(filePaths);
  const allEdges = [];
  const seen = /* @__PURE__ */ new Set();
  for (const relPath of filePaths) {
    const ext = path.extname(relPath);
    const isTsJs = TS_EXTENSIONS.includes(ext);
    const isPy = PY_EXTENSIONS.includes(ext);
    if (!isTsJs && !isPy) continue;
    let content;
    try {
      content = fs.readFileSync(path.join(projectPath, relPath), "utf8");
    } catch {
      continue;
    }
    const edges = isTsJs ? parseTsJsImports(relPath, content, projectPath, knownFiles) : parsePyImports(relPath, content, projectPath, knownFiles);
    for (const edge of edges) {
      const key = `${edge.source}→${edge.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        allEdges.push(edge);
      }
    }
  }
  return allEdges;
}
async function exportMarkdown(projectPath, sessionPath, exchanges) {
  const win = electron.BrowserWindow.getAllWindows()[0];
  const { canceled, filePath } = await electron.dialog.showSaveDialog(win, {
    title: "Export Session as Markdown",
    defaultPath: "session-export.md",
    filters: [{ name: "Markdown", extensions: ["md"] }]
  });
  if (canceled || !filePath) return { success: false };
  const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const lines = [
    "# Session Export",
    "",
    `**Project:** ${projectPath}`,
    `**Session:** ${sessionPath}`,
    `**Date:** ${date}`,
    "",
    "---",
    ""
  ];
  for (const ex of exchanges) {
    lines.push(`## Exchange ${ex.index + 1}`);
    lines.push("");
    lines.push(`**User:** ${ex.userText}`);
    lines.push("");
    lines.push(`**Assistant:** ${ex.assistantText}`);
    lines.push("");
    if (ex.actions.length > 0) {
      lines.push("**Actions:**");
      for (const a of ex.actions) {
        lines.push(`- ${a.toolName}${a.filePath ? `: ${a.filePath}` : ""}`);
      }
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  return { success: true, filePath };
}
async function captureScreenshot() {
  const win = electron.BrowserWindow.getAllWindows()[0];
  if (!win) return { success: false };
  const image = await win.webContents.capturePage();
  const { canceled, filePath } = await electron.dialog.showSaveDialog(win, {
    title: "Save Screenshot",
    defaultPath: "claude-vertex-screenshot.png",
    filters: [{ name: "PNG Image", extensions: ["png"] }]
  });
  if (canceled || !filePath) return { success: false };
  fs.writeFileSync(filePath, image.toPNG());
  return { success: true, filePath };
}
const isDev = process.env["NODE_ENV"] === "development";
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function registerIpcHandlers() {
  electron.ipcMain.handle("projects:list", () => listProjects());
  electron.ipcMain.handle(
    "session:list",
    (_event, encodedName) => listSessions(encodedName)
  );
  electron.ipcMain.handle("session:load", async (_event, filePath) => {
    return await parseSession(filePath);
  });
  electron.ipcMain.handle(
    "codebase:scan",
    (_event, projectPath) => scanCodebase(projectPath)
  );
  electron.ipcMain.handle(
    "git:log",
    (_event, projectPath) => getGitLog(projectPath)
  );
  electron.ipcMain.handle(
    "git:diff",
    (_event, projectPath, commitHash) => getGitDiff(projectPath, commitHash)
  );
  electron.ipcMain.handle("git:inline-diff", (_event, oldStr, newStr, filePath) => makeInlineDiff(oldStr, newStr, filePath));
  electron.ipcMain.handle("git:watch", (_event, projectPath) => {
    startGitWatcher(projectPath);
  });
  electron.ipcMain.handle(
    "dep:scan",
    (_event, projectPath, filePaths) => scanDeps(projectPath, filePaths)
  );
  electron.ipcMain.handle("export:markdown", (_event, projectPath, sessionPath, exchanges) => exportMarkdown(projectPath, sessionPath, exchanges));
  electron.ipcMain.handle("export:screenshot", () => captureScreenshot());
}
electron.app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  startSessionWatcher();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
