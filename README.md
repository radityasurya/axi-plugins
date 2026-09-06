<h1 align="center">axi-plugins</h1>

<p align="center">
  <a href="https://axi.md"><img alt="AXI" src="https://img.shields.io/badge/built%20with-AXI-black?style=flat-square" /></a>
</p>

<h3 align="center">Every AXI CLI, installable as a Claude Code plugin.</h3>

A plugin marketplace that lists the [AXI](https://axi.md) command-line tools — GitHub, AWS,
Cloudflare, Coolify, OpenPanel, Chrome DevTools, and provider quotas — so an agent can
discover them by name instead of being told about them in a prompt.

## Install

**Claude Code:**

```
/plugin marketplace add radityasurya/axi-plugins
/plugin install cloudflare-axi@axi-plugins
```

`/plugin` with no arguments lists everything the marketplace offers.

**Pi:** Pi reads Claude marketplaces directly through its `pi-claude-marketplace` extension,
so the same repo works unchanged:

```
/claude:plugin marketplace add radityasurya/axi-plugins
/claude:plugin install cloudflare-axi@axi-plugins
```

## What's in it

| Plugin | Covers |
| --- | --- |
| `axi` | `/axi:status` — what is installed, and whether it is configured and responding |
| `gh-axi` | Issues, PRs, stacked PRs, workflow runs, releases, Projects, Actions secrets, gists |
| `aws-axi` | EC2, S3, IAM, Lambda, KMS, CloudWatch, SSM, Secrets Manager |
| `cloudflare-axi` | Zones, DNS, edge cache, Email Routing, bot protection |
| `namecheap-axi` | Domains, expiry, DNS host records, nameservers, registrar lock |
| `coolify-axi` | Applications, databases, services, servers, deployments |
| `openpanel-axi` | Analytics reads, project/client management, event tracking |
| `gsc-axi` | Search Console: performance, comparisons, URL inspection, sitemaps |
| `chrome-devtools-axi` | Navigate, click, fill, evaluate, console, network, screenshots |
| `quota-axi` | Remaining quota and pace across local agent providers |

Each plugin ships one skill: a short stub that points the agent at the tool's own
`npx -y <tool>` dashboard and `--help`. The CLI stays the source of truth, so a plugin
cannot go stale against a newer release of the tool it describes.

## Knowing what you have: `/axi:status`

```
/plugin install axi@axi-plugins
/axi:status
```

```
4 ready · 4 not configured · 0 failed

✔ coolify-axi          context: hireopz
✔ openpanel-axi        api: "https://openpanel.hireopz.com/api"
! aws-axi              status: not authenticated
                       → Run `aws sso login` to authenticate via SSO
! cloudflare-axi       zones: no Cloudflare API token in the environment
                       → Create a scoped token at https://dash.cloudflare.com/profile/api-tokens
```

Run it in a terminal and you get the view above. Piped — which is how the slash command
invokes it — you get TOON instead, with a `fix` column carrying each tool's own next step.
`--pretty` and `--toon` force either one.

It finds tools installed as plugins (from **any** marketplace, not just this one), as
skills, or simply on `PATH`, and reports each one's live state — as
[TOON](https://toonformat.dev/), like the tools it reports on.

There is no table of per-tool credentials in it to fall out of date. An AXI tool run with no
arguments prints its own live state, and reports a missing credential as data with the fix
attached — so the status of a tool is just what the tool says about itself. Adding a new AXI
CLI to your machine needs no change here.

## Why a plugin and not an MCP server

An MCP server loads its tool schemas into **every turn of every session**, whether or not
the conversation touches that tool. Seven of them is a standing tax on the context window.

A skill loads on demand, when the agent recognises a matching task, and the tool itself runs
as a subprocess that returns [TOON](https://toonformat.dev/) — roughly 40% fewer tokens than
the equivalent JSON. The standing cost of this marketplace is one line per plugin in the
skill index.

## How the entries resolve

Plugins point at the **published npm package** for each tool, so installing one gets the
same code `npx -y <tool>` would run, at its released version.

Note that the `github: owner/repo` source form clones over `git@github.com` and fails on a
machine with no SSH key. Where a git source is unavoidable, use the `url` form with an
explicit `https://` URL.

No skill files are copied into this repository. There is nothing here to keep in sync — each
tool ships its own `skills/<name>/SKILL.md`, and this marketplace only references it.

## Credits

`gh-axi`, `quota-axi`, and `chrome-devtools-axi` are by
[@kunchenguid](https://github.com/kunchenguid); `aws-axi` is by
[@bauti-defi](https://github.com/bauti-defi). This marketplace lists them; it does not
redistribute them.

## License

MIT
