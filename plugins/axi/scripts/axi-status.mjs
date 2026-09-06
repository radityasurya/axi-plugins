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
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);

// npx may have to download a package before it can answer.
const TIMEOUT_MS = Number(process.env.AXI_STATUS_TIMEOUT ?? 25_000);
const WIDTH = 78;

// --- Minimal TOON emitter -------------------------------------------------
// This script has no dependencies (a plugin ships no node_modules), and it
// emits exactly two shapes: scalar fields and one tabular array of strings.
// The quoting predicate below is SPEC.md §7.2 in full, because over-quoting is
// harmless while under-quoting makes an agent silently misread a cell.

const NUMERIC_LIKE = /^[+-]?[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/i;

export function quoteToon(value, delimiter = ",") {
  const text = String(value);
  const mustQuote =
    text === "" ||
    text !== text.trim() ||
    text === "true" ||
    text === "false" ||
    text === "null" ||
    NUMERIC_LIKE.test(text) ||
    /[:"\\[\]{}]/.test(text) ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f]/.test(text) ||
    text.includes(delimiter) ||
    text.startsWith("-") ||
    text.startsWith("#");
  if (!mustQuote) return text;
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

/** §9.3 tabular form: `key[N]{f1,f2}:` then one indented row per element. */
export function toonTable(key, fields, rows) {
  const header = `${key}[${rows.length}]{${fields.join(",")}}:`;
  return [header, ...rows.map((row) => `  ${fields.map((f) => quoteToon(row[f])).join(",")}`)].join("\n");
}

/** §9.1 inline primitive array. */
export function toonList(key, values) {
  return `${key}[${values.length}]: ${values.map((v) => quoteToon(v)).join(",")}`;
}

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

/**
 * Guarded so the TOON helpers above can be imported by tests without this
 * script spawning every installed AXI tool as a side effect.
 */
async function main() {
  const tools = await discover();

  if (tools.length === 0) {
    console.log("axi: 0 AXI tools installed");
    console.log(toonList("help", ["Run `/plugin marketplace add radityasurya/axi-plugins` to install some"]));
    return;
  }

  const results = await Promise.all(
    tools.map(async (tool) => ({
      ...tool,
      ...(tool.enabled === false ? { ok: false, lines: ["disabled"] } : await probe(tool)),
    })),
  );

  const working = results.filter((tool) => tool.ok).length;
  const unconfigured = results.filter((tool) => tool.ok && /\b(no|not)\b/i.test(tool.lines[0] ?? ""));

  console.log(`axi: ${results.length} installed, ${working} responding`);
  console.log(
    toonTable(
      "tools",
      ["name", "where", "state", "status"],
      results.map((tool) => ({
        name: tool.name,
        where: tool.sources.join("+") + (tool.version && tool.version !== "unknown" ? ` v${tool.version}` : ""),
        state: tool.ok ? "ok" : "failed",
        // The tool's own first line of live state — AXI §2 keeps this to the one
        // field that decides what to do next, not the tool's whole home view.
        status: tool.lines[0] ?? "-",
      })),
    ),
  );

  const others = (await installedPlugins())
    .map((plugin) => String(plugin.id))
    .filter((id) => !isTool(id.split("@")[0]));
  if (others.length) console.log(toonList("other_plugins", others));

  console.log(
    toonList("help", [
      ...(unconfigured.length
        ? [`Run \`npx -y ${unconfigured[0].name}\` for the exact fix it reports`]
        : []),
      "Run any tool with no arguments for its full live state",
      "Run `/plugin install <name>@axi-plugins` to add another",
    ]),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
