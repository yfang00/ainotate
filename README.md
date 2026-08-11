<h2 align="center">Everything You Need To Annotate And Stay In The Loop With Your Agents</h2>

<p align="center">
  <sub>Annotate plans, specs, markdown, diffs, and HTML. Send structured feedback directly to your AI agent.</sub>
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

## Commands & Workflow

### 1. How to Run Ainotate from your Coding Harness

* **Automatic Plan Interception**: No command needed. Whenever your agent enters plan mode or proposes a plan, Ainotate automatically intercepts execution and opens the plan review surface.
* **In-Chat Slash Commands**:
  ```bash
  /ainotate-review                              # Review local git diff / uncommitted changes
  /ainotate-annotate README.md                  # Annotate a local markdown file or spec
  /ainotate-annotate src/                       # Browse and annotate files in a folder
  /ainotate-annotate https://docs.rs/...         # Fetch and annotate any web documentation URL
  /ainotate-annotate report.html --render-html  # Render raw HTML artifact visually
  /ainotate-last                                # Annotate the agent's last response
  /ainotate-review <github-pr-url>              # Review a GitHub PR directly in Ainotate
  ```
* **Codex**: Use `!ainotate review`, `!ainotate annotate <file>`, or invocation skills (`$ainotate-review`, `$ainotate-annotate`, `$ainotate-last`).
* **Amp**: Trigger commands from Amp's Command Palette (`ainotate`).
* **Terminal CLI**:
  ```bash
  ainotate review                     # Launch standalone code review UI
  ainotate annotate <file|folder|url> # Launch standalone document annotator
  ainotate sessions                   # List active Ainotate sessions
  ainotate sessions --open 1          # Reopen an active session in browser
  ainotate archive                    # Browse saved plan decisions read-only
  ```

---

### 2. How to Make and Submit Feedback on the Review Page

1. **Open the Review Page**:  
   When invoked, Ainotate starts a local server and prints a clickable ready link to `stderr` (e.g., `http://100.x.y.z:19432` on Tailnet or `http://localhost:19432`). Click the link or let your browser open it automatically.

2. **Add Annotations & Comments**:
   * **Inline Highlighting**: Highlight any text or line in Markdown or HTML to add a redline annotation and type your comment.
   * **Diff Line Comments**: Click diff line numbers in Code Review to add line notes or code suggestions.
   * **Global Notes**: Type general feedback or attach images in the bottom/sidebar feedback composer.
   * **Live Sync**: Annotations auto-save (`/api/draft`) and sync live across multiple open browser tabs.

3. **Submit or Approve**:
   * **Approve**: Click **Approve** (or "LGTM") if no changes are required. The agent receives approval and resumes work immediately.
   * **Submit Feedback / Deny**: Click **Submit Feedback** (or **Deny**). All highlights, line notes, and comments are compiled into structured Markdown and sent directly back into your active agent conversation session.

4. **Auto-Close & Resume**:  
   Upon submission, the page displays a 3-second auto-close countdown. Click **Close Tab Now** (or press <kbd>⌘W</kbd> / <kbd>Ctrl+W</kbd>) to close the tab and return to your agent terminal.

---

## Installation

### Automatic Installer

One installer gets you the `ainotate` binary and wires up every agent it can configure directly — **Claude Code, Codex, OpenCode, Gemini CLI, and Kiro CLI** — by auto-detecting which are installed and writing their hooks, skills, and slash commands. Copilot CLI, Droid, Amp, Pi, and the VS Code extension install through their own marketplaces or a manual copy; see the per-agent table below.

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

#### Installer Options

| Flag | Description |
|---|---|
| `--version <tag>` | Install a specific release (`vX.Y.Z` or `X.Y.Z`) instead of the latest. |
| `--minimal` / `--no-minimal` | Install only the binary, or force a full install when `AINOTATE_MINIMAL` is set. Aliased `--binary-only`. |
| `--model-invocable <list>` | Comma-separated skills the model may call on its own (e.g. `ainotate-review,ainotate-annotate`), or `none`. Skills are user-invoked only by default. |
| `--verify-attestation` | Require SLSA build-provenance verification via `gh attestation verify`; fails the install if it does not pass. |
| `--skip-attestation` | Force-skip provenance verification even when enabled by env var or config. |
| `--non-interactive` | Never prompt, even in a terminal. Uses flags, then saved preferences, then defaults. |
| `--reconfigure` | Re-run the guided install questions and overwrite the saved answers. |

Run `install.sh --help` for the full text. The first terminal run asks which extra skills to install and which may be model-invocable, then saves the answers under the data directory and reuses them silently; piped and CI runs never prompt.

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
| `AINOTATE_GLIMPSE_WIDTH` / `_HEIGHT` | Size of the Glimpse native window, in pixels. | `1280` / `900` |
| `AINOTATE_SHARE` | Set to `disabled` to turn off URL sharing entirely. | Enabled |
| `AINOTATE_SHARE_URL` | Base URL for share links (self-hosted portal). | `https://share.ainotate.ai` |
| `AINOTATE_ANNOTATE_HISTORY` | Enable (`1`) or disable (`0`) per-file version history in annotate mode. Disabling keeps annotate sessions stateless — no copies of annotated files are written — and the version diff becomes unavailable. | `1` (enabled) |
| `AINOTATE_AGENT_TERMINAL_REMOTE` | Enable (`1`) the annotate-mode agent terminal while remote mode is active. Off by default because remote mode binds beyond localhost. | `0` (off) |
| `AINOTATE_FILE_BROWSER_MAX_FILES` | Cap on files inspected by file discovery and returned by the file browser. | `5000` |

**Installer-only variables** — read by `install.sh` / `install.ps1` / `install.cmd`, not by the runtime binary:

| Variable | Description | Default |
|---|---|---|
| `AINOTATE_MINIMAL` | Install only the `ainotate` binary, skipping the sem sidecar, agent-terminal runtime, and every per-agent integration. Same as `--minimal`. | `0` (full install) |
| `AINOTATE_VERIFY_ATTESTATION` | Run `gh attestation verify` on every install. Requires `gh` installed and authenticated. Same as `--verify-attestation`. | `0` (off) |
| `AINOTATE_SKIP_SEM_INSTALL` | Skip the optional `sem` semantic-diff sidecar used by code review. | `0` (install it) |
| `AINOTATE_SKIP_AGENT_TERMINAL_INSTALL` | Skip the managed Node/WebTUI runtime used by the annotate-mode agent terminal. | `0` (install it) |

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

Some tests need a DOM and are skipped by default. CI runs them in a separate
pass; reproduce it locally with `DOM_TESTS=1 bun test <files>` (see the
`Run UI seam-contract + DOM tests` step in `.github/workflows/test.yml` for the
current list).

### Running Your Local Build in Your Agents

`install.sh` downloads a published release — it never builds. To run the code in
your checkout inside a real agent, use:

```bash
./scripts/install-local.sh
```

This builds the review app, then the plan/review bundles, compiles the binary
over `~/.local/bin/ainotate` (keeping the previous one as `ainotate.previous`),
and refreshes the OpenCode plugin copy when OpenCode is wired. It prints which
harnesses on your machine pick the build up. Agent wiring — skills, hooks, slash
commands — is left alone; that is `install.sh`'s job and it does not change
between local builds.

> **The binary is not the only artifact.** Claude Code, Codex, Gemini CLI, and
> Kiro CLI all shell out to `~/.local/bin/ainotate`, so rebuilding it is enough
> for them. The **OpenCode plugin is a self-contained copy** with its own
> bundled HTML under `~/.config/opencode/ainotate/` — rebuild only the binary
> and OpenCode silently keeps serving the previous UI. `install-local.sh`
> handles both; the raw sequence below does not.

Equivalent by hand, if you want the individual steps:

```bash
bun run --cwd apps/review build && \
  bun run build:hook && \
  bun build apps/hook/server/index.ts --compile --outfile ~/.local/bin/ainotate
# then, only if OpenCode is wired on this machine:
bun run build:opencode   # and copy dist/{index,embedded}.js + *.html into
                         # ~/.config/opencode/ainotate/ (see install-local.sh)
```

Build order matters: `build:hook` copies pre-built HTML from `apps/review/dist`,
so the review app must be built first or you ship stale review UI.

---

## Attribution & License

Ainotate is a fork of and derived from [Plannotator](https://github.com/backnotprop/plannotator) by [backnotprop](https://github.com/backnotprop). The original work's copyright and license terms are retained in full.

Copyright 2025-2026 backnotprop

Dual-licensed under [Apache 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT) at your option.
