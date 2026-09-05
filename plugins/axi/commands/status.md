---
name: status
description: List every AXI CLI installed on this machine and whether it is actually working
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/axi-status.mjs*)
---

## Installed AXI tools

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/axi-status.mjs`

## Task

Report the table above to the user, grouped as: working, installed but not configured, and
failing.

Each tool's status line is what that tool printed about itself when run with no arguments,
so a "not configured" line already carries its own fix — quote that fix rather than
inventing one. Do not run the tools again to verify; this ran them.
