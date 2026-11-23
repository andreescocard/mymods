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
| [**`context-bar`**](./context-bar) | Status line with the **model serving each request** and how full the **context window** is |

---

## 📊 context-bar

The two things that drive token spend are which model is answering and how much context each request carries. Both live in one line under the prompt:

```text
🔵 Sonnet 5.5 · 🟢 ctx ████░░░░░░░░░░░░░░░░ 22% · 44k / 200k
🟣 Opus 5.5   · 🟡 ctx █████████████░░░░░░░ 64% · 128k / 200k
⚪ Haiku 5.5  · 🔴 ctx █████████████████░░░ 86% · 172k / 200k
```

- **Model:** the bar reads the model from each main-loop request, not from your settings. With `"model": "opusplan"` (Opus in plan mode, Sonnet the rest of the time), it shows which one is actually answering.
- **Context:** 🟢 below 60%, 🟡 from 60%, 🔴 from 80%. Red is a good moment to `/compact` or start fresh.
- **Subagents:** they don't change the line. Only the main conversation counts.

> [!NOTE]
> Switching modes with Shift+Tab doesn't change the bar right away. It updates on the next message, because that's when `opusplan` picks the model.

### Pairs well with `opusplan`

```jsonc
// ~/.claude/settings.json
{ "model": "opusplan" }
```

Sonnet handles routine work by default, Opus takes over in plan mode, and the bar tells you which one you're paying for.

---

## 🚀 Install

```bash
claude plugin marketplace add andreescocard/mymods
claude plugin install context-bar@mymods --scope user
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
claude plugin validate ./context-bar   # what the engine will load or refuse
claude plugin test ./context-bar       # runs *.test.ts
```

When you edit a mod, it reloads at the end of the turn, or with the next session. Claude Code generates the `.claude-plugin/types/` folders, and they stay out of git.

---

<div align="center">
<sub>MIT · built with Claude Code</sub>
</div>
