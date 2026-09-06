import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { quoteToon, toonList, toonTable } from "../plugins/axi/scripts/axi-status.mjs";

// TOON SPEC.md §7.2. Over-quoting is harmless; under-quoting makes an agent
// misread a cell, so every branch of the predicate is pinned here.
test("§7.2 quotes exactly what the spec requires", () => {
  for (const value of [
    "",
    " leading",
    "trailing ",
    "true",
    "false",
    "null",
    "42",
    "-3.14",
    "05",
    "+1",
    "1e-6",
    "has:colon",
    'has"quote',
    "has\\backslash",
    "has[bracket]",
    "has{brace}",
    "has,comma",
    "-leading-hyphen",
    "#leading-hash",
  ]) {
    assert.ok(quoteToon(value).startsWith('"'), `${JSON.stringify(value)} must be quoted`);
  }

  // Internal spaces, unicode and emoji are safe unquoted (§7.2 closing note).
  for (const value of ["plain", "two words", "café", "🎉", "a.b_c"]) {
    assert.equal(quoteToon(value), value, `${JSON.stringify(value)} must stay bare`);
  }
});

test("§7.1 emits only the five permitted escapes", () => {
  assert.equal(quoteToon('say "hi"'), '"say \\"hi\\""');
  assert.equal(quoteToon("back\\slash"), '"back\\\\slash"');
  assert.equal(quoteToon("line\nbreak"), '"line\\nbreak"');
  assert.equal(quoteToon("tab\there"), '"tab\\there"');
});

test("§9.3 tabular header carries the count and field list", () => {
  const out = toonTable("tools", ["name", "state"], [
    { name: "gh-axi", state: "ok" },
    { name: "aws-axi", state: "failed: no auth" },
  ]);
  assert.deepEqual(out.split("\n"), [
    "tools[2]{name,state}:",
    "  gh-axi,ok",
    '  aws-axi,"failed: no auth"',
  ]);
});

test("§9.1 inline arrays declare their length", () => {
  assert.equal(toonList("help", ["do a thing", "do, another"]), 'help[2]: do a thing,"do, another"');
});

test("the marketplace manifest stays valid and installable", () => {
  const manifest = JSON.parse(readFileSync(new URL("../.claude-plugin/marketplace.json", import.meta.url)));
  assert.ok(manifest.name && manifest.owner?.name, "name and owner are required");
  assert.ok(manifest.plugins.length > 0);
  for (const plugin of manifest.plugins) {
    assert.ok(plugin.name, "every plugin needs a name");
    assert.ok(plugin.source, `${plugin.name} needs a source`);
    // The `github` shorthand clones over git@github.com and fails on any
    // machine without an SSH key — this bit us on openpanel-axi.
    assert.notEqual(plugin.source?.source, "github", `${plugin.name} must use url, not the github shorthand`);
  }
});

test("a timestamp-valued field is not a status", async () => {
  const { summarize } = await import("../plugins/axi/scripts/axi-status.mjs");
  // quota-axi leads with `generatedAt`, which says nothing about whether it works.
  const lines = summarize('generatedAt: "2026-09-06T01:15:12.642Z"\nquota[6]{provider,scope}:\n  claude,session');
  assert.match(lines[0], /^quota\[6\]/);
});

test("state separates a tool that is unconfigured from one that failed", async () => {
  const { classify } = await import("../plugins/axi/scripts/axi-status.mjs");
  assert.equal(classify({ ok: true, lines: ["context: hireopz"] }), "ready");
  assert.equal(classify({ ok: true, lines: ["zones: no Cloudflare API token in the environment"] }), "unconfigured");
  assert.equal(classify({ ok: true, lines: ["status: not authenticated"] }), "unconfigured");
  assert.equal(classify({ ok: false, lines: ["timed out after 25s"] }), "failed");
});

test("the fix column quotes the tool's own next step, unwrapped", async () => {
  const { fixFor } = await import("../plugins/axi/scripts/axi-status.mjs");

  // A TOON help array arrives flattened with commas; take the first suggestion.
  assert.equal(
    fixFor({ ok: true, lines: ["status: not authenticated", "help[3]: Run `aws sso login` to authenticate via SSO,Or run `aws configure`"] }),
    "Run `aws sso login` to authenticate via SSO",
  );
  // The source tool quoted its cell; that quoting is not ours to repeat.
  assert.equal(
    fixFor({ ok: true, lines: ["zones: no token", 'help[2]: "Create a scoped token at https://dash.cloudflare.com/profile/api-tokens"'] }),
    "Create a scoped token at https://dash.cloudflare.com/profile/api-tokens",
  );
  // A ready tool has nothing to fix.
  assert.equal(fixFor({ ok: true, lines: ["context: hireopz", "count: 19 total"] }), "-");
});
