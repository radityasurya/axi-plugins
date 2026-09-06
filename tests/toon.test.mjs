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
