# Ainotate Kiro CLI Integration

Source package for Ainotate's Kiro CLI support. These files are consumed by the main installer
(`scripts/install.sh`) — there is **no separate Kiro installer**. A Kiro user installs with the same
one-liner as everyone else.

## Contents

- `skills/` — Kiro-specific skill packages (`ainotate-review`, `ainotate-annotate`),
  each baking `AINOTATE_ORIGIN=kiro-cli` into its command.
  <!-- NOTE: The canonical, single-sourced core skills live in `apps/skills/core/`. These Kiro
       copies are intentionally independent (they hardcode AINOTATE_ORIGIN=kiro-cli) and are
       exempt from single-sourcing — do not replace them with the core copies. -->

- `agents/ainotate.json` — an example Kiro custom agent that exposes the Ainotate skills via
  `skill://` resources and a `ainotate`-scoped `shell` tool.

## How it installs

`scripts/install.sh` auto-detects Kiro (if `~/.kiro` exists or `kiro-cli` is on PATH — the same
convention used for Codex and Gemini) and installs:

- the 2 Kiro-specific skills above → `~/.kiro/skills`
- the example agent `agents/ainotate.json` → `~/.kiro/agents/ainotate.json` (an existing file
  is never overwritten)

```bash
curl -fsSL https://ainotate.ai/install.sh | bash
```

## Use the Ainotate agent

The installed agent wires both skills via `skill://` resources and, in its prompt, documents
which skill to use for which task (review, annotate). Launch
it:

```bash
kiro-cli chat --agent ainotate
```

Or add the same `skill://~/.kiro/skills/ainotate-*/SKILL.md` resources to one of your own agents.

## Schema note

`agents/ainotate.json` is a conservative example. If Kiro changes its custom-agent schema, adapt
the installed copy at `~/.kiro/agents/ainotate.json`.
