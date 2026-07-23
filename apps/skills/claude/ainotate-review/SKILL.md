---
name: ainotate-review
description: Open Ainotate's browser-based code review UI for the current worktree or a pull request URL, then act on the feedback that comes back.
allowed-tools: Bash(ainotate-review:*), Bash(ainotate:*)
disable-model-invocation: true
---

# Ainotate Review

## Code review feedback

!`ainotate-review run review $ARGUMENTS`

## Your task

If the review above is `AINOTATE_STILL_WAITING`, run `ainotate-review wait` and keep waiting; do not start another review. If it contains feedback or annotations, address them in the same conversation. If no changes were requested (an approval/LGTM-style result), acknowledge that review passed and continue.
