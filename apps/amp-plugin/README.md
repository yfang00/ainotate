# Ainotate for Amp

This is a native Amp plugin for the manual Ainotate workflows:

- `Ainotate: Review changes`
- `Ainotate: Review changes or PR` (leave blank for local changes)
- `Ainotate: Annotate file`
- `Ainotate: Annotate last answer`

Amp commands live in the command palette, not as slash commands. This plugin does
not intercept Amp's planning flow.

## Install

Install the `ainotate` CLI first:

```bash
curl -fsSL https://ainotate.ai/install.sh | bash
```

Then install the Amp plugin:

```bash
mkdir -p ~/.config/amp/plugins
curl -fsSL https://raw.githubusercontent.com/backnotprop/ainotate/main/apps/amp-plugin/ainotate.ts \
  -o ~/.config/amp/plugins/ainotate.ts
```

Restart Amp or run `plugins: reload` from the command palette.

For project-local installation, copy the plugin to:

```text
.amp/plugins/ainotate.ts
```

## Local Development

From a Ainotate checkout:

```bash
mkdir -p .amp/plugins
ln -sf ../../apps/amp-plugin/ainotate.ts .amp/plugins/ainotate.ts
export AINOTATE_AMP_USE_SOURCE=1
export AINOTATE_CWD="$PWD"
```

Run `plugins: reload` in Amp. When the plugin is loaded from this repository, it
runs the checkout's source entrypoint instead of a global `ainotate` binary.
You can also point directly at a source entry:

```bash
export AINOTATE_AMP_SOURCE_ENTRY=/path/to/ainotate/apps/hook/server/index.ts
```
