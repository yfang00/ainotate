---
name: plannotator-review
description: Open Plannotator's browser-based code review UI for the current worktree or a pull request URL, then act on the feedback that comes back.
disable-model-invocation: true
---

# Plannotator Review

Use this skill when the user wants to review current code changes in Plannotator instead of reading a diff inline.

Run:

```bash
plannotator-review run review [optional-pr-url]
```

Behavior:

1. Launch the command with Bash. If `plannotator-review` is unavailable, fall back to `plannotator review [optional-pr-url]`.
2. If it returns `PLANNOTATOR_STILL_WAITING`, run `plannotator-review wait` again. Do not start another review: the existing browser tab and server session must be preserved.
3. If it returns feedback or annotations, address them in the same conversation.
4. If it returns an approval/LGTM-style message, acknowledge that review passed and continue.

Do not ask the user to copy shell commands into chat. Run the command yourself.
