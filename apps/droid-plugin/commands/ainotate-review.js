#!/usr/bin/env node

const { exitWithFailure, runAinotate } = require("../lib/run-ainotate");

const result = runAinotate(["review", ...process.argv.slice(2)]);

if (result.error || result.status !== 0) {
  exitWithFailure(result, "ainotate review");
}

const output = result.stdout.trim();
process.stdout.write(output ? `${output}\n` : "Review session closed without feedback.\n");
