#!/usr/bin/env node
// Report every AXI CLI installed on this machine, and its live status.
//
// The status of an AXI tool is whatever it prints when run with no arguments:
// AXI §8 requires that view to be live state, and §6 requires a missing
// credential to come back as data with a fix rather than a crash. So this
// script needs no per-tool knowledge — no table of env vars to drift out of
// date — it just runs each tool and repeats what the tool said about itself.
import { execFile } from "node:child_process";
import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

// npx may have to download a package before it can answer.
const TIMEOUT_MS = Number(process.env.AXI_STATUS_TIMEOUT ?? 25_000);
const WIDTH = 78;

// The design-principles skill is named `axi` but is not a CLI.
const NOT_A_TOOL = new Set(["axi"]);

const isTool = (name) => name.endsWith("-axi") && !NOT_A_TOOL.has(name);

function onPath(binary) {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    try {
      accessSync(join(dir, binary), constants.X_OK);
      return join(dir, binary);
    } catch {}
  }
  return undefined;
}

function dirsIn(path) {
  try {
    return readdirSync(path).filter((name) => statSync(join(path, name)).isDirectory());
  } catch {
    return [];
  }
}

let pluginCache;
async function installedPlugins() {
  if (pluginCache) return pluginCache;
  try {
    const { stdout } = await exec("claude", ["plugin", "list", "--json"], { timeout: 20_000 });
    pluginCache = JSON.parse(stdout);
  } catch {
    pluginCache = [];
  }
  return pluginCache;
}

/** Union of the places an AXI tool can be installed from. */
async function discover() {
  const found = new Map();
  const add = (name, source, extra = {}) => {
    const entry = found.get(name) ?? { name, sources: [], ...extra };
    if (!entry.sources.includes(source)) entry.sources.push(source);
    found.set(name, { ...entry, ...extra });
  };

  const plugins = await installedPlugins();
  for (const plugin of plugins) {
    const [name, marketplace] = String(plugin.id).split("@");
    if (isTool(name)) {
      add(name, `plugin:${marketplace}`, {
        version: plugin.version,
        enabled: plugin.enabled !== false,
      });
    }
  }

  for (const root of [join(homedir(), ".claude", "skills"), join(process.cwd(), ".claude", "skills")]) {
    for (const name of dirsIn(root)) if (isTool(name)) add(name, "skill");
  }

  for (const name of new Set([...found.keys()])) if (onPath(name)) add(name, "PATH");


  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The first lines that are actual state, not the AXI identity header. */
function summarize(stdout) {
  const lines = stdout
    .split("\n")
    .map((line) => line.trimEnd())
    // Drop the AXI identity header and any key with no value behind it.
    .filter((line) => line.trim() && !/^(bin|description):/.test(line) && !/^[\w[\]]+:\s*$/.test(line));
  if (lines.length === 0) return ["(no output)"];
  return lines.slice(0, 2).map((line) => (line.length > WIDTH ? `${line.slice(0, WIDTH - 1)}…` : line));
}

async function probe(tool) {
  const binary = onPath(tool.name);
  const [command, args] = binary ? [binary, []] : ["npx", ["-y", tool.name]];
  try {
    const { stdout } = await exec(command, args, { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, lines: summarize(stdout) };
  } catch (error) {
    if (error.killed || error.signal) {
      return { ok: false, lines: [`timed out after ${Math.round(TIMEOUT_MS / 1000)}s`] };
    }
    // An AXI tool reports a missing credential on stdout with exit 0; a non-zero
    // exit here is a real failure, and its stdout still carries the reason.
    const said = summarize(`${error.stdout ?? ""}`);
    return { ok: false, lines: said[0] === "(no output)" ? [firstLine(error.stderr, error.message)] : said };
  }
}

function firstLine(...candidates) {
  for (const candidate of candidates) {
    const line = String(candidate ?? "").split("\n").find((entry) => entry.trim());
    if (line) return line.trim().slice(0, WIDTH);
  }
  return "failed";
}

const tools = await discover();

if (tools.length === 0) {
  console.log("axi tools: none installed");
  console.log("Add some with `/plugin marketplace add radityasurya/axi-plugins`");
  process.exit(0);
}

const results = await Promise.all(
  tools.map(async (tool) => ({
    ...tool,
    ...(tool.enabled === false ? { ok: false, lines: ["disabled"] } : await probe(tool)),
  })),
);

const pad = Math.max(...results.map((tool) => tool.name.length));
const working = results.filter((tool) => tool.ok).length;

console.log(`axi tools: ${results.length} installed, ${working} responding`);
console.log("");
for (const tool of results) {
  const mark = tool.ok ? "ok  " : "FAIL";
  const version = tool.version && tool.version !== "unknown" ? ` v${tool.version}` : "";
  const where = tool.sources.join(" ") + version;
  console.log(`${mark} ${tool.name.padEnd(pad)}  ${where}`);
  for (const line of tool.lines) console.log(`${" ".repeat(pad + 7)}${line}`);
}

const others = (await installedPlugins())
  .map((plugin) => String(plugin.id))
  .filter((id) => !isTool(id.split("@")[0]));
if (others.length) {
  console.log("");
  console.log(`other plugins installed (${others.length}): ${others.join(", ")}`);
}
