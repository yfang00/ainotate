---
name: plannotator-review
description: Open Plannotator's browser-based code review UI for the current worktree or a pull request URL, then act on the feedback that comes back.
allowed-tools: Bash(plannotator-review:*), Bash(plannotator:*)
disable-model-invocation: true
---

# Plannotator Review

## Code review feedback

!`plannotator-review run review $ARGUMENTS`

## Your task

If the review above is `PLANNOTATOR_STILL_WAITING`, run `plannotator-review wait` and keep waiting; do not start another review. If it contains feedback or annotations, address them in the same conversation. If no changes were requested (an approval/LGTM-style result), acknowledge that review passed and continue.
