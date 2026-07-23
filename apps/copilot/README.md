# Ainotate for Copilot CLI

Interactive plan review, code review, and markdown annotation for GitHub Copilot CLI.

## Install

**Install the `ainotate` command:**

**macOS / Linux / WSL:**

```bash
curl -fsSL https://ainotate.ai/install.sh | bash
```

**Windows PowerShell:**

```powershell
irm https://ainotate.ai/install.ps1 | iex
```

**Then in Copilot CLI:**

```
/plugin marketplace add yfang00/ainotate
/plugin install ainotate-copilot@ainotate
```

Restart Copilot CLI after plugin install. Plan review activates automatically when you use plan mode (`Shift+Tab` to enter plan mode).

## How It Works

### Plan Mode Integration

When you use plan mode in Copilot CLI:

1. The agent writes `plan.md` to the session state directory
2. The agent calls `exit_plan_mode` to present the plan
3. The `preToolUse` hook intercepts this and opens the Ainotate review UI in your browser
4. You review the plan, optionally add annotations
5. **Approve** → the plan is accepted and the agent proceeds
6. **Deny** → the agent receives your feedback and revises the plan

### Available Commands

| Command | Description |
|---------|-------------|
| `/ainotate-review` | Open interactive code review for current changes or a PR URL |
| `/ainotate-annotate <file>` | Open interactive annotation UI for a markdown file |
| `/ainotate-last` | Annotate the last rendered assistant message |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AINOTATE_REMOTE` | Set to `1` / `true` for remote mode, `0` / `false` for local mode, or leave unset for SSH auto-detection. Uses a fixed port in remote mode; browser-opening behavior depends on the environment. |
| `AINOTATE_PORT` | Fixed port to use. Default: random locally, `19432` for remote sessions. |
| `AINOTATE_BROWSER` | Custom browser to open. macOS: app name or path. Linux/Windows: executable path. |
| `AINOTATE_SHARE` | Set to `disabled` to turn off URL sharing. |

## Limitations

- **Plan mode** requires the `ainotate` CLI to be installed and on PATH
- **`/ainotate-last`** parses `events.jsonl` from the Copilot CLI session state directory — format may change between Copilot CLI versions

## Links

- [Website](https://ainotate.ai)
- [GitHub](https://github.com/yfang00/ainotate)
- [Docs](https://ainotate.ai/docs/getting-started/installation/)
