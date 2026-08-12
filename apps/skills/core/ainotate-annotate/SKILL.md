---
name: ainotate-annotate
description: Open Ainotate's annotation UI for a markdown file, HTML file, URL, or folder and then respond to the returned annotations.
disable-model-invocation: true
---

# Ainotate Annotate

Use this skill when the user wants to annotate a document in Ainotate instead of reviewing it inline in chat.

Run:

```bash
ainotate annotate <path-or-url>
```

Behavior:

1. Launch the command with Bash.
2. Wait for the browser review to finish.
3. If annotations are returned, address them directly.
4. If the output is `Annotation session closed without feedback.` (or empty, on
   older builds), the user looked and had no notes. Say so briefly and continue.
   That is a completed session — do not relaunch Ainotate.

Do not ask the user to paste a shell command into the chat. Run the command yourself.
