<p align="center">
  <img src=".github/assets/banner.webp" alt="Ainotate" width="640" />
</p>



<p align="center">
  <strong>Everything you need to annotate and stay in the loop with your agents</strong><br/>
  <strong>Markdown Review • Code Review • HTML Artifacts</strong><br/>
  <sub>Annotate plans, specs, markdown, and HTML before implementation. Review diffs and PRs. Send feedback to your agent.</sub>
</p>

<p align="center">
  <img src=".github/assets/icons/amp.svg" alt="Amp" title="Amp" height="28" />&nbsp;&nbsp;
  <img src=".github/assets/icons/claude.svg" alt="Claude Code" title="Claude Code" height="28" />&nbsp;&nbsp;
  <img src=".github/assets/icons/codex.png" alt="Codex" title="Codex" height="28" />&nbsp;&nbsp;
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/icons/copilot-dark.svg" />
    <img src=".github/assets/icons/copilot-light.svg" alt="Copilot CLI" title="Copilot CLI" height="28" />
  </picture>&nbsp;&nbsp;
  <img src=".github/assets/icons/droid.png" alt="Droid" title="Droid" height="28" />&nbsp;&nbsp;
  <img src=".github/assets/icons/gemini.png" alt="Gemini CLI" title="Gemini CLI" height="28" />&nbsp;&nbsp;
  <img src=".github/assets/icons/kiro.svg" alt="Kiro" title="Kiro" height="28" />&nbsp;&nbsp;
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/icons/opencode-dark.svg" />
    <img src=".github/assets/icons/opencode-light.svg" alt="OpenCode" title="OpenCode" height="28" />
  </picture>&nbsp;&nbsp;
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/icons/pi-dark.svg" />
    <img src=".github/assets/icons/pi-light.svg" alt="Pi" title="Pi" height="28" />
  </picture>
</p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=a_AT7cEN_9I">Watch the og demo</a> · <a href="https://ainotate.ai/docs/getting-started/installation/">Installation guide</a> · <a href="https://ainotate.ai/">Official site</a> · <a href="https://github.com/ainotate/effective-html">Visual HTML Skills</a>
</p>

# Ainotate

Ainotate is a local, browser-based review surface for AI coding agents: Claude Code, Codex, Copilot CLI, Gemini CLI, OpenCode, Kiro, Droid, Amp, and Pi. 

**It plugs directly into your agent** through its hooks and commands. When the agent proposes a plan, html, or finishes writing code, the work opens in your browser and you mark it up, comment, and send feedback directly to the agent for it to act on it.

<table>
<tr>
<td width="40%" valign="middle">

### Review documents, plans, and agent messages

Annotate plans, specs, messages, html, then send the feedback to your agent. 

<p><strong>Demo:</strong> <a href="https://youtu.be/XqFun9XCXPw">Plan review with Pi</a></p>

</td>
<td width="60%">

<img src=".github/assets/annotate.webp" alt="Annotate UI with inline annotations" width="100%" />

</td>
</tr>
<tr>
<td width="40%" valign="middle">

### Code Review

Review local changes or remote PRs. Comment on diffs, suggest code. Your comments go back to the agent. Works with git, jj, p4, GitHub, and GitLab.

</td>
<td width="60%">

<img src=".github/assets/review.webp" alt="Code review with file tree and side-by-side diff" width="100%" />

</td>
</tr>
</table>

<p align="center">
  <sub><strong>AI built in:</strong> ask AI about anything you're reviewing,<br/>or launch AI reviews that post comments to the diff.</sub>
</p>

## Annotate HTML Artifacts

<p align="center">
  <img src=".github/assets/html.webp" alt="Annotating a rendered HTML artifact" width="720" />
</p>

---

## Commands

<sub>On Codex, swap the slash commands for `!ainotate …` (e.g. `!ainotate review`) or the `$ainotate-*` skills.</sub>

### Annotate

```
/ainotate-annotate README.md                  # Local markdown file
/ainotate-annotate src/                       # Browse and annotate files in a folder
/ainotate-annotate https://docs.rs/…          # Fetch and annotate any URL
/ainotate-annotate report.html --render-html  # Render HTML as-is instead of converting
/ainotate-last                                # Annotate the agent's last message
```

### Code review

```
/ainotate-review                    # Review uncommitted changes
/ainotate-review <github-pr-url>    # Review a GitHub pull request
/ainotate-review <gitlab-mr-url>    # Review a GitLab merge request
```

### Plan mode

No command needed. Plan mode is wired in through each harness's hooks. Any time your agent creates a plan, the markdown review surface opens for you.

### CLI

```
ainotate sessions                   # List active Ainotate sessions
ainotate sessions --open 1          # Reopen a session in the browser
ainotate archive                    # Browse saved plan decisions read-only
ainotate-review run review          # Reuse one code-review tab for this agent session
ainotate-review wait                # Resume waiting after a bounded wait expires
```

The full macOS/Linux/WSL installer includes `ainotate-review`. It keeps one
fixed local URL per coding-agent session, replaces the server behind that URL
for each review, and lets the existing browser tab reload to the new artifact.

---

## Local-only fork

Remote sharing and paste uploads are disabled unconditionally in this fork.
Plans, diffs, annotations, and review feedback stay on the local Ainotate
server; `AINOTATE_SHARE` and the saved sharing setting cannot re-enable
uploads.


---

## Install

One installer covers almost every agent. It installs the `ainotate` binary, auto-detects your installed agents, and configures hooks, skills, and slash commands for each:

```bash
# macOS / Linux / WSL
curl -fsSL https://ainotate.ai/install.sh | bash
```

```powershell
# Windows PowerShell
irm https://ainotate.ai/install.ps1 | iex
```

Want just the binary and nothing else? Pass `--minimal` (or export `AINOTATE_MINIMAL=1`) to install only the `ainotate` binary to `~/.local/bin`, skipping every skill, hook, slash command, and per-agent config:

```bash
curl -fsSL https://ainotate.ai/install.sh | bash -s -- --minimal
```

Then finish the step for your agent:

| Agent | After the installer | Details |
|---|---|---|
| **Amp** | Copy [`ainotate.ts`](apps/amp-plugin/ainotate.ts) into `~/.config/amp/plugins/`, then `plugins: reload`. Workflows live in the command palette. | [README](apps/amp-plugin/README.md) |
| **Claude Code** | `/plugin marketplace add yfang00/ainotate`, then `/plugin install ainotate@ainotate`. Restart Claude Code. | [README](apps/hook/README.md) |
| **Codex** | Nothing. Plan review is enabled automatically via Codex's experimental `Stop` hook (macOS/Linux/WSL; Codex hooks are disabled on Windows). `$ainotate-review`, `$ainotate-annotate`, and `$ainotate-last` skills included. | [README](apps/codex/README.md) |
| **Copilot CLI** | `/plugin marketplace add yfang00/ainotate`, then `/plugin install ainotate-copilot@ainotate`. Restart. Plan review activates in plan mode (`Shift+Tab`). | [README](apps/copilot/README.md) |
| **Droid** | `droid plugin marketplace add https://github.com/yfang00/ainotate`, then `droid plugin install ainotate@ainotate`. Commands only, no plan interception yet. | [README](apps/droid-plugin/README.md) |
| **Gemini CLI** | Nothing. The hook, policy, and slash commands are configured automatically. Requires Gemini CLI 0.36.0+. | [README](apps/gemini/README.md) |
| **Kiro CLI** | Nothing. Skills and an example agent are installed automatically. Try `kiro-cli chat --agent ainotate`. | [README](apps/kiro-cli/README.md) |
| **OpenCode** | Add `"plugin": ["@ainotate/opencode@latest"]` to `opencode.json`. Restart OpenCode. | [README](apps/opencode-plugin/README.md) |
| **Pi** | Skip the installer. Just `pi install npm:@ainotate/pi-extension`. Start Pi with `--plan`, or toggle with `/ainotate`. | [README](apps/pi-extension/README.md) |

Full walkthroughs live in the [installation docs](https://ainotate.ai/docs/getting-started/installation/).

<details>
<summary>Claude Code: manual hook setup (without the plugin system)</summary>

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "ainotate",
            "timeout": 345600
          }
        ]
      }
    ]
  }
}
```

</details>

<details>
<summary>Pin a specific version</summary>

```bash
curl -fsSL https://ainotate.ai/install.sh | bash -s -- --version vX.Y.Z
```

```powershell
& ([scriptblock]::Create((irm https://ainotate.ai/install.ps1))) -Version vX.Y.Z
```

</details>

### Try it

The fastest way to see what Ainotate does is to invoke it yourself, right now, from your agent:

```
/ainotate-last                   # annotate the agent's last reply
/ainotate-review                 # review your current diff, PR-style
/ainotate-annotate report.html   # annotate any file, folder, or URL
```

(Slash commands in most agents; `$ainotate-*` skills in Codex, command palette in Amp.)

Plan review needs no command at all. The next time your agent proposes a plan, it opens in your browser automatically.

---

## How it works

### Plan review

```
Agent calls ExitPlanMode
  -> PermissionRequest hook fires
  -> Local server reads plan from hook input
  -> Browser opens with review UI
  -> You annotate and approve/deny
  -> Approve: agent proceeds
  -> Deny: structured feedback sent to agent
  -> Agent revises, plan diff shows what changed
```

### Code review

```
You run /ainotate-review
  -> git diff captures changes (or PR fetched by URL)
  -> Browser opens with diff viewer
  -> Annotate lines, stage/unstage files
  -> Send feedback: returned to agent session
  -> Approve: "LGTM" sent
```

### Document annotation

```
You run /ainotate-annotate <file, folder, or URL>
  -> Browser opens with the annotation UI
  -> No feedback: Approve ends the review with no changes requested
  -> Feedback added: Submit sends it to the agent session
  -> Reset clears pending feedback and keeps the review open
  -> Close ends the review without a decision
```

---

## Integrations

**VS Code**: Open plans in editor tabs, view diffs inline, add annotations from the editor gutter. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=backnotprop.ainotate-webview).

**Obsidian**: Auto-save approved plans to a vault with YAML frontmatter, tags from the plan title, and backlinks for graph connectivity. Configure in Ainotate's Settings panel.

**Bear**: Save plans as Bear notes with nested tags and project metadata.

**GitHub / GitLab**: Pass any PR or MR URL to `/ainotate-review` and review it with the full diff viewer, annotations, and file tree.

---

## Remote / SSH / devcontainer

Ainotate auto-detects SSH sessions and switches to a fixed port. For explicit control:

```bash
export AINOTATE_REMOTE=1
export AINOTATE_PORT=9999  # forward this port
```

VS Code devcontainers forward the port automatically (check the Ports tab). For raw SSH, add to `~/.ssh/config`:

```
Host your-server
    LocalForward 9999 localhost:9999
```

---

## Security

Every released binary ships with a SHA256 sidecar. [SLSA provenance](https://slsa.dev/) attestations are available from v0.17.2.

To verify on install:

```bash
curl -fsSL https://ainotate.ai/install.sh | bash -s -- --verify-attestation
```

Requires `gh` installed and authenticated. Can also be set persistently in `~/.ainotate/config.json`:

```json
{ "verifyAttestation": true }
```

See the [verification docs](https://ainotate.ai/docs/reference/verifying-your-install/) for details.

---

## Configuration

Settings are saved in cookies (not localStorage) because each hook invocation runs on a random port. You can also set options through environment variables or `~/.ainotate/config.json`.

| Variable | Description |
|---|---|
| `AINOTATE_REMOTE` | `1`/`true` for remote mode, `0`/`false` for local, unset for auto-detection (SSH, Tailscale, Herdr, containers) |
| `AINOTATE_PORT` | Fixed port (default: random locally, `19432` remote) |
| `AINOTATE_BROWSER` | Custom browser to open plans in |
| `AINOTATE_SHARE` | `disabled` to turn off URL sharing |
| `AINOTATE_SHARE_URL` | Custom base URL for share links (self-hosted portal) |
| `AINOTATE_PASTE_URL` | Base URL of the paste service API |
| `AINOTATE_ORIGIN` | Override agent detection: `claude-code`, `amp`, `droid`, `opencode`, `codex`, `copilot-cli`, `gemini-cli`, `kiro-cli`, `pi` |
| `AINOTATE_JINA` | `0`/`false` to disable Jina Reader for URL annotation |
| `JINA_API_KEY` | Jina Reader API key for higher rate limits |

---

## Development

```bash
bun install

bun run dev:hook       # Plan review server
bun run dev:review     # Code review editor
bun run dev:marketing  # Marketing site (ainotate.ai)
bun run dev:vscode     # VS Code extension (watch mode)
```

### Build

```bash
bun run build          # Main targets (hook + opencode)
bun run build:hook     # Single-file HTML for the hook server
bun run build:review   # Code review editor
bun run build:opencode # OpenCode plugin
bun run build:vscode   # VS Code extension
```

Build order matters. The hook build copies pre-built HTML from `apps/review/dist/`. If you change UI code in `packages/ui/`, `packages/editor/`, or `packages/review-editor/`, rebuild the review app first:

```bash
bun run --cwd apps/review build && bun run build:hook
```

Test the plugin locally:

```bash
claude --plugin-dir ./apps/hook
```

Full binary build:

```bash
bun run --cwd apps/review build && bun run build:hook && \
  bun build apps/hook/server/index.ts --compile --outfile ~/.local/bin/ainotate
```


---

## Attribution

Ainotate is a fork of and derived from [Plannotator](https://github.com/backnotprop/plannotator) by [backnotprop](https://github.com/backnotprop). The original work's copyright and license terms are retained in full (see below).

## License

Copyright 2025-2026 backnotprop

Dual-licensed under [Apache 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT) at your option.

Contributions are dual-licensed under the same terms unless you explicitly state otherwise.
