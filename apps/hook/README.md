# Ainotate Claude Code Plugin

This directory contains the Claude Code plugin configuration for Ainotate.

## Prerequisites

Install the `ainotate` command so Claude Code can use it:

**macOS / Linux / WSL:**
```bash
curl -fsSL https://ainotate.ai/install.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://ainotate.ai/install.ps1 | iex
```

**Windows CMD:**
```cmd
curl -fsSL https://ainotate.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

Released binaries ship with SHA256 sidecars and [SLSA build provenance](https://slsa.dev/) attestations from v0.17.2 onwards. See the [installation docs](https://ainotate.ai/docs/getting-started/installation/) for version pinning and the [verification docs](https://ainotate.ai/docs/reference/verifying-your-install/) for verification commands.

---

[Plugin Installation](#plugin-installation) · [Manual Installation (Hooks)](#manual-installation-hooks) · [Obsidian Integration](#obsidian-integration)  

---

## Plugin Installation

In Claude Code:

```
/plugin marketplace add yfang00/ainotate
/plugin install ainotate@ainotate
```

**Important:** Restart Claude Code after installing the plugin for the hooks to take effect.

## Manual Installation (Hooks)

If you prefer not to use the plugin system, add this to your `~/.claude/settings.json`:

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

## How It Works

When Claude Code calls `ExitPlanMode`, this hook intercepts and:

1. Opens Ainotate UI in your browser
2. Lets you annotate the plan visually
3. Approve → Claude proceeds with implementation
4. Request changes → Your annotations are sent back to Claude
5. On resubmission → Plan Diff shows what changed since the last version

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AINOTATE_REMOTE` | Set to `1` / `true` for remote mode, `0` / `false` for local mode, or leave unset for SSH auto-detection. Uses a fixed port in remote mode; browser-opening behavior depends on the environment. |
| `AINOTATE_PORT` | Fixed port to use. Default: random locally, `19432` for remote sessions. |
| `AINOTATE_BROWSER` | Custom browser to open plans in. macOS: app name or path. Linux/Windows: executable path. |
| `AINOTATE_SHARE_URL` | Custom share portal URL for self-hosting. Default: `https://share.ainotate.ai`. |

## Remote / Devcontainer Usage

When running Claude Code in a remote environment (SSH, devcontainer, WSL), set `AINOTATE_REMOTE=1` (or `true`) and these environment variables:

```bash
export AINOTATE_REMOTE=1
export AINOTATE_PORT=9999  # Choose a port you'll forward
```

This tells Ainotate to:
- Use a fixed port instead of a random one (so you can set up port forwarding)
- Use remote-friendly port/browser handling for forwarded environments
- Print the URL to the terminal for you to access

**Port forwarding in VS Code devcontainers:** The port should be automatically forwarded. Check the "Ports" tab.

**SSH port forwarding:** Add to your `~/.ssh/config`:
```
Host your-server
    LocalForward 9999 localhost:9999
```

## Slash Commands

Ainotate's slash commands are installed as Claude Code skills in `~/.claude/skills` by the install script (the canonical source is `apps/skills/core/`). Claude Code skills are user-invocable by directory name, so these three work like slash commands inside your session:

| Command | Description |
|---------|-------------|
| `/ainotate-review [--git \| --gitbutler]` | Open code review UI for current changes or a GitHub PR; optionally force the Git or GitButler provider |
| `/ainotate-annotate <file.md \| file.html \| https://... \| folder/>` | Annotate a file, URL, or folder |
| `/ainotate-last` | Annotate the agent's last message |

## Obsidian Integration

Approved plans can be automatically saved to your Obsidian vault.

**Setup:**
1. Open Settings (gear icon) in Ainotate
2. Enable "Obsidian Integration"
3. Select your vault from the dropdown (auto-detected) or enter the path manually
4. Set folder name (default: `ainotate`)

**What gets saved:**
- Plans saved with human-readable filenames: `Title - Jan 2, 2026 2-30pm.md`
- YAML frontmatter with `created`, `source`, and `tags`
- Tags extracted automatically from the plan title and code languages
- Backlink to `[[Ainotate Plans]]` for graph connectivity

**Example saved file:**
```markdown
---
created: 2026-01-02T14:30:00.000Z
source: ainotate
tags: [plan, authentication, typescript, sql]
---

[[Ainotate Plans]]

# Implementation Plan: User Authentication
...
```

<img width="1190" height="730" alt="image" src="https://github.com/user-attachments/assets/1f0876a0-8ace-4bcf-b0d6-4bbb07613b25" />
