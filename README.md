<p align="center">
  <strong>Everything you need to annotate and stay in the loop with your agents</strong><br/>
  <strong>Plan Review • Code Review • Document Annotation • HTML Artifacts</strong><br/>
  <sub>Annotate plans, specs, markdown, diffs, and HTML. Send structured feedback directly to your AI agent.</sub>
</p>

<p align="center">
  <a href="https://ainotate.ai/docs/getting-started/installation/">Installation Guide</a> · <a href="https://ainotate.ai/">Official Site</a> · <a href="https://github.com/yfang00/ainotate">GitHub Repository</a>
</p>

# Ainotate

Ainotate is a local, browser-based review and annotation surface for AI coding agents: **Claude Code, Codex, Copilot CLI, Gemini CLI, OpenCode, Kiro CLI, Droid, Amp, and Pi**.

**It plugs directly into your agent** through native hooks, slash commands, and skills. Whenever your agent proposes a plan, renders an HTML artifact, or finishes writing code, Ainotate opens a visual review surface in your browser where you can highlight lines, leave comments, suggest edits, and send structured feedback straight back to the agent session.

---

## Key Features

### 📋 Plan Review & Interception
* **Hook Interception**: Hooks into `ExitPlanMode` (Claude Code) and experimental `Stop` / execution hooks (Codex, OpenCode, Copilot CLI, Gemini, Pi) to pause agent execution until you review the plan.
* **Approve or Request Changes**: One-click **Approve** lets the agent proceed immediately. **Deny / Feedback** compiles your inline notes into structured Markdown returned directly to the agent prompt.
* **Plan Version History**: View plan revisions side-by-side with raw and visual clean diff views as the agent refines its plan over multiple iterations.

### 🔍 Code Review & VCS Integration
* **PR-Style Diff Viewer**: Powered by `@pierre/diffs` with side-by-side and unified diff rendering, syntax highlighting, and inline comment threads.
* **`since-base` Smart Default**: Automatically computes `merge-base(base, HEAD)` vs working tree and untracked files—showing everything a PR would include if committed now.
* **Linear Commit History Rail**: View Git commit history as a linear `--first-parent` rail (`CommitsPanel`), opening individual commit diffs (`commit:<sha>`) with commit messages rendered in Markdown.
* **Multi-VCS Support**: Supports Git, GitButler (`--gitbutler` multi-branch workspace and stack views), Jujutsu (`jj`), Perforce (`p4`), and direct GitHub PR / GitLab MR URL reviews.

### 📝 Document & HTML Artifact Annotation
* **Markdown & Files**: Annotate local Markdown (`.md`, `.mdx`), plain text, or browse entire workspace folders (`/ainotate-annotate src/`) with an integrated live file browser.
* **HTML Rendering**: View and annotate rendered HTML artifacts (`.html`, `.htm`) in visual or raw mode.
* **URL Ingestion**: Fetch and annotate external web pages (`https://...`) via Jina Reader.
* **Rich Annotations**: Add inline redline highlights, text comments, image attachments, LaTeX math formulas, and GFM tables.

### 🌐 Tailscale & Remote Session Support
* **Automatic Remote Detection**: Automatically detects SSH (`SSH_TTY`, `SSH_CONNECTION`, `SSH_CLIENT`), Herdr multiplexer sessions (`HERDR_SESSION`), and container environments (`DEVCONTAINER`, `CODESPACES`, `GITPOD_WORKSPACE_ID`).
* **Tailscale IP Auto-Discovery**: When running on a host in a Tailnet, Ainotate automatically binds to `0.0.0.0` and prints clickable session URLs formatted with the host's active Tailscale IPv4 address (`http://100.x.y.z:19432`).
* **Dual-Page Real-Time Sync**: Open review URLs on your local desktop, remote terminal machine, or both. Draft comments and line highlights synchronize live across all active tabs (`/api/draft`).
* **Smart Auto-Close**: Submitting feedback from any page auto-closes all connected tabs after a 3-second countdown (with browser security fallbacks for manually opened tabs).

### 🤖 Ask AI Context Engine
* **Agent-Aware Context**: Ask AI questions about any changeset or plan being reviewed.
* **View-Aware Context Integration**: Context machine generates on-screen changeset preambles matching your active diff filter (uncommitted, branch, since-base, stacked PRs, whitespace toggles, GitButler workspace) directly into user messages.
* **Multi-Provider Backbone**: Dedicated SDK providers for Claude Agent SDK, Codex App-Server (JSON-RPC), OpenCode SDK, and Pi SDK.

---

## Commands

<sub>On Codex, swap slash commands for `!ainotate …` (e.g. `!ainotate review`) or `$ainotate-*` skills.</sub>

### Slash Commands
```bash
/ainotate-annotate README.md                  # Annotate a local markdown file
/ainotate-annotate src/                       # Browse and annotate files in a folder
/ainotate-annotate https://docs.rs/...         # Fetch and annotate any web page
/ainotate-annotate report.html --render-html  # Render raw HTML artifact as-is
/ainotate-last                                # Annotate the agent's last message
/ainotate-review                              # Review local uncommitted changes
/ainotate-review <github-pr-url>              # Review a GitHub pull request
/ainotate-review <gitlab-mr-url>              # Review a GitLab merge request
```

### CLI Utilities
```bash
ainotate review                     # Launch standalone code review UI
ainotate annotate <file|folder|url> # Launch standalone document annotator
ainotate sessions                   # List active Ainotate sessions
ainotate sessions --open 1          # Reopen an active session in browser
ainotate archive                    # Browse saved plan decisions read-only
```

---

## Installation

### Automatic Installer

One installer covers all supported agents. It installs the `ainotate` binary, auto-detects your installed coding agents, and configures hooks, skills, and slash commands:

```bash
# macOS / Linux / WSL
curl -fsSL https://ainotate.ai/install.sh | bash
```

```powershell
# Windows PowerShell
irm https://ainotate.ai/install.ps1 | iex
```

#### Minimal Binary-Only Install
To install **only** the `ainotate` binary to `~/.local/bin` without per-agent hooks or skills, pass `--minimal` (or export `AINOTATE_MINIMAL=1`):

```bash
curl -fsSL https://ainotate.ai/install.sh | bash -s -- --minimal
```

### Agent Integration Guide

| Agent | Setup Instructions | Reference |
|---|---|---|
| **Claude Code** | `/plugin marketplace add yfang00/ainotate`, then `/plugin install ainotate@ainotate`. Restart Claude Code. | [Claude Plugin Docs](apps/hook/README.md) |
| **OpenCode** | Add `"plugin": ["@ainotate/opencode@latest"]` to `opencode.json`. Restart OpenCode. | [OpenCode Plugin Docs](apps/opencode-plugin/README.md) |
| **Codex** | Auto-configured via Codex's `Stop` hook and `$ainotate-review`, `$ainotate-annotate`, `$ainotate-last` skills. Uses JSON-RPC over `codex app-server`. | [Codex Integration](apps/codex/README.md) |
| **Pi** | Run `pi install npm:@ainotate/pi-extension`. Launch Pi with `--plan` or toggle with `/ainotate`. | [Pi Extension](apps/pi-extension/README.md) |
| **Copilot CLI** | Run `/plugin marketplace add yfang00/ainotate` and `/plugin install ainotate-copilot@ainotate`. Activates in plan mode (`Shift+Tab`). | [Copilot Plugin](apps/copilot/README.md) |
| **Gemini CLI** | Auto-configured hooks, policy, and slash commands (requires Gemini CLI 0.36.0+). | [Gemini Plugin](apps/gemini/README.md) |
| **Kiro CLI** | Skills and agent template installed automatically (`kiro-cli chat --agent ainotate`). | [Kiro Integration](apps/kiro-cli/README.md) |
| **Amp** | Copy `ainotate.ts` into `~/.config/amp/plugins/` and reload plugins. Accessible via command palette. | [Amp Integration](apps/amp-plugin/README.md) |
| **Droid** | Run `droid plugin marketplace add https://github.com/yfang00/ainotate` and install `ainotate@ainotate`. | [Droid Plugin](apps/droid-plugin/README.md) |

---

## Integrations

* **VS Code Extension**: View plan reviews and code diffs inside VS Code editor tabs with gutter annotation markers. Installed via [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=backnotprop.ainotate-webview).
* **Obsidian**: Automatically save approved plans into an Obsidian vault with YAML frontmatter, title tags, and graph backlinks.
* **Bear & Octarine**: Save review notes directly into Bear or Octarine note apps.
* **GitHub & GitLab**: Input any PR/MR URL to load full multi-file diffs with file tree navigation and code comments.

---

## Environment Variables

Settings are saved in cookies (so each session port preserves your preferences) and can also be configured via environment variables or `~/.ainotate/config.json`:

| Variable | Description | Default |
|---|---|---|
| `AINOTATE_REMOTE` | Force remote mode (`1`/`true`) or local mode (`0`/`false`). Unset for auto-detection (SSH, Tailscale, Herdr, containers). | Auto-detect |
| `AINOTATE_PORT` | Fixed server port or port range (e.g. `19432` or `19432-19440`). | Random locally, `19432` remote |
| `AINOTATE_BROWSER` | Custom browser executable or app name to launch. | System default |
| `AINOTATE_ORIGIN` | Explicit agent-origin override (`claude-code`, `opencode`, `codex`, `pi`, `copilot-cli`, `gemini-cli`, `kiro-cli`, `amp`, `droid`). | Auto-detect |
| `AINOTATE_DATA_DIR` | Base data directory for plans, history, drafts, and config. | `~/.ainotate` |
| `AINOTATE_JINA` | Enable (`1`) or disable (`0`) Jina Reader for URL annotations. | `1` (enabled) |
| `JINA_API_KEY` | Optional Jina Reader API key for higher rate limits. | None |
| `AINOTATE_GLIMPSE` | Enable (`1`) or disable (`0`) Glimpse native app window frame. | `1` (enabled) |

---

## Development

```bash
bun install

bun run dev:hook       # Plan review server (dev mode)
bun run dev:review     # Code review UI (dev mode)
bun run dev:opencode   # OpenCode plugin
bun run dev:vscode     # VS Code extension (watch mode)
```

### Build & Test

```bash
bun run build          # Build all main targets (hook + opencode)
bun test               # Run all workspace unit tests
```

To build and compile a single local binary to `~/.local/bin/ainotate`:

```bash
bun run --cwd apps/review build && \
  bun run build:hook && \
  bun build apps/hook/server/index.ts --compile --outfile ~/.local/bin/ainotate
```

---

## Attribution & License

Ainotate is a fork of and derived from [Plannotator](https://github.com/backnotprop/plannotator) by [backnotprop](https://github.com/backnotprop). The original work's copyright and license terms are retained in full.

Copyright 2025-2026 backnotprop

Dual-licensed under [Apache 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT) at your option.
