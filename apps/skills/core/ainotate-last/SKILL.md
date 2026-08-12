---
name: ainotate-last
description: Open Ainotate on the latest rendered assistant message and use the returned annotations to revise that message or continue.
disable-model-invocation: true
---

# Ainotate Last

Use this skill when the user wants to annotate the latest assistant response in Ainotate.

Do not send a commentary/status message before running the command. The command
targets the latest rendered assistant response, so a preamble can mistakenly become the
thing being annotated.

Run:

```bash
ainotate last
```

Behavior:

1. Launch the command with Bash.
2. Wait for the annotation session to finish.
3. If feedback is returned, incorporate it into the follow-up response.
4. If the output is `Annotation session closed without feedback.` (or empty, on
   older builds), the user looked and had no notes. Mention that briefly and
   continue. That is a completed session — do not relaunch Ainotate.

Run the command yourself rather than telling the user to invoke shell syntax manually.
