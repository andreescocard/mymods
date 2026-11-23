<div align="center">

# 🧩 mymods

**Small, global mods for [Claude Code](https://claude.com/claude-code)**
that keep what you're spending in plain sight

![Claude Code](https://img.shields.io/badge/Claude_Code-mods-D97757?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-hooks-3178C6?style=flat-square&logo=typescript&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square)

</div>

---

## ✨ Mods

| Mod | What it does |
| --- | --- |
| [**`context-bar`**](./context-bar) | Status line with the **model serving each request**, the **context fill**, the **session cost** and the **git branch**, plus context warnings and a spend ledger |
| [**`output-budget`**](./output-budget) | Keeps **big outputs out of the context**: long-file `Read`s, unlimited `Grep`, huge MCP results |
| [**`guards`**](./guards) | Rules the harness enforces: **no secrets or data dumps read**, **ask before git commit/push/merge/tag**, **ask before any MCP tool** |

---

## 📊 context-bar

The two things that drive token spend are which model is answering and how much context each request carries. Both live in one line under the prompt:

```text
🔵 Sonnet 5.5 · 🟢 ctx ████░░░░░░░░░░░░░░░░ 22% · 44k / 200k
🟣 Opus 5.5   · 🟡 ctx █████████████░░░░░░░ 64% · 128k / 200k · $3.41 · ⎇ main
⚪ Haiku 5.5  · 🔴 ctx █████████████████░░░ 86% · 172k / 200k
```

- **Model:** the bar reads the model from each main-loop request, not from your settings. With `"model": "opusplan"` (Opus in plan mode, Sonnet the rest of the time), it shows which one is actually answering.
- **Context:** 🟢 below 60%, 🟡 from 60%, 🔴 from 80%. Red is a good moment to `/compact` or start fresh.
- **Cost and branch:** the session's estimated cost (an estimate, not the bill; `~` means some model had no known price) and the current git branch, refreshed after every turn.
- **Warnings:** a toast the first time the context passes 60% (`/compact` soon) and 80% (finish the step, then `/compact` or hand off). They re-arm if a `/compact` drops the fill.
- **Subagents:** they don't change the line. Only the main conversation counts.

### Ledger

When a session ends, one row (project, models used, cost, peak context) is appended to `~/.claude/ledger/YYYY-MM.jsonl`. Nothing leaves your machine.

```text
/ledger        # last 7 days
/ledger 30     # last 30 days
```

Shows total spend, the top projects and the split by model, so you can see where the money goes.

> [!NOTE]
> Switching modes with Shift+Tab doesn't change the bar right away. It updates on the next message, because that's when `opusplan` picks the model.

### Pairs well with `opusplan`

```jsonc
// ~/.claude/settings.json
{ "model": "opusplan" }
```

Sonnet handles routine work by default, Opus takes over in plan mode, and the bar tells you which one you're paying for.

---

## ✂️ output-budget

Context is the expensive part of every request. This mod stops three common ways of filling it:

| Case | What happens |
| --- | --- |
| `Read` of a file over **600 lines** with no `offset`/`limit` | Refused once, with a hint to `Grep` or read a range. Repeat the same `Read` and it goes through. |
| `Grep` with `head_limit: 0` (unlimited) | Rewritten to **300** lines/entries. |
| MCP tool result over **20,000 chars** | Text is cut there and a marker says how much was omitted. |

Shell output is left alone on purpose: output-compressing proxies like RTK already compress it. Images, PDFs and notebooks are skipped.

Change the limits in `~/.claude/output-budget.json` or `<project>/.claude/output-budget.json` (project wins):

```json
{ "readMaxLines": 600, "grepMaxLines": 300, "mcpMaxChars": 20000 }
```

---

## 🛡️ guards

Rules written in a `CLAUDE.md` depend on the model remembering them. These run as hooks, so they hold every time and cost zero tokens.

| Rule | What happens |
| --- | --- |
| **secret-guard** | `Read`, `Edit`, `Grep`, `Glob`, `Bash` and `PowerShell` calls that touch `.env*`, `*.pem`, `*.key`, `credentials*`, `.npmrc`, `serviceAccount*.json`, SSH keys and similar are **denied**. So is dumping the environment (`env`, `printenv`, bare `export`/`set`, `Get-ChildItem Env:`). |
| **dump-guard** | Data dumps (`*.sql`, `*.dump`, `*.bak`, a `backup/` or `dumps/` folder) are denied, except commands that only count or name (`ls`, `wc -l`, `grep -c`, `... \| wc -l`). |
| **commit-gate** | `git commit`, `push`, `merge` and `tag` (also through `rtk git ...`) stop for a permission prompt. Your yes is the authorization. |
| **mcp-confirm** | Every `mcp__*` tool asks first, unless you allowlisted it. |

Every denial tells the model what to do instead (reference `$VAR`, or ask you to run it with `! <command>`).

### Configure

Defaults ship in the mod. Two optional files add to them, in this order:

1. `~/.claude/guards.json` (yours, not in any repo)
2. `<project>/.claude/guards.json`

```jsonc
{
  "secretGlobs": ["config.php"],              // extra secret files
  "dumpGlobs": ["*.mysql"],                   // extra dump files
  "dumpDirs": ["references"],                 // folders that hold extracts
  "gitAsk": ["rebase"],                       // more git subcommands to confirm
  "mcpAllow": ["mcp__obsidian__*"],           // MCP tools that skip the prompt
  "countCommands": ["md5sum"],                // global file only
  "disable": ["mcp"]                          // global file only: "git" | "mcp"
}
```

Lists only ever grow, so a file can add protection but never remove it. A project file can add secrets and allow MCP tools, but it can't turn a rule off.

> [!WARNING]
> Only keep `.claude/guards.json` files you trust. A repository you clone can allowlist its own MCP tools. `Grep` without a `path` or `glob` can't know which files it will match, so rely on `.gitignore` there.

---

## 🚀 Install

```bash
claude plugin marketplace add andreescocard/mymods
claude plugin install context-bar@mymods --scope user
claude plugin install guards@mymods --scope user
claude plugin install output-budget@mymods --scope user
```

Use `--scope project` to enable it for a single repo instead. Start a new session to load it.

---

## 🛠️ Development

```text
.claude-plugin/marketplace.json   # lists the mods in this repo
<mod>/
├── .claude-plugin/plugin.json    # name, version, description
├── hooks/hooks.json              # { "modules": ["./register.ts"] }
└── hooks/register.ts             # export const register: Register = (on) => { ... }
```

```bash
claude plugin validate ./guards        # what the engine will load or refuse
claude plugin test ./context-bar       # runs the mod's *.test.ts
bun test guards/tests                  # guards' pure rule tests
```

When you edit a mod, it reloads at the end of the turn, or with the next session. Claude Code generates the `.claude-plugin/types/` folders, and they stay out of git.

---

<div align="center">
<sub>MIT · built with Claude Code</sub>
</div>
