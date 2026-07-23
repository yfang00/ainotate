# Ainotate for Droid

Ainotate's Droid plugin ships the manual slash-command workflow only:

- `/ainotate-review [PR_URL]` (no args reviews local changes)
- `/ainotate-annotate <file|folder|url>`
- `/ainotate-last`

It does not attempt plan-mode interception or host-level planning integration.

## Install

Install the `ainotate` CLI first:

```bash
curl -fsSL https://ainotate.ai/install.sh | bash
```

Then add the marketplace and install the plugin:

```bash
droid plugin marketplace add https://github.com/backnotprop/ainotate
droid plugin install ainotate@ainotate
```

For local development:

```bash
cd /path/to/ainotate
droid plugin marketplace add "$PWD"
droid plugin install ainotate@ainotate
```

## Notes

- The plugin expects `ainotate` on `PATH`.
- Review and annotate flows still open the Ainotate browser UI and return the result to the Droid session.
- The command wrappers set `AINOTATE_ORIGIN=droid` so the UI can label the host correctly.
