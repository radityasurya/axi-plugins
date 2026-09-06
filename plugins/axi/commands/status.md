---
name: status
description: List every AXI CLI installed on this machine and whether it is actually working
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/axi-status.mjs*)
---

## Installed AXI tools

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/axi-status.mjs --toon`

## Task

Report the table above to the user, grouped by `state`: ready, unconfigured, failed.

Every tool is in the table, including the unconfigured ones — each row carries both the
`status` the tool printed about itself and the `fix` it suggested. Quote that `fix` verbatim
rather than inventing one; if it is `-` there is nothing to fix. Do not run the tools again
to verify, this ran them.
