#!/usr/bin/env node

const { emitAnnotateDecision, exitWithFailure, runAinotate } = require("../lib/run-ainotate");

const result = runAinotate(["annotate", ...process.argv.slice(2), "--json"]);

if (result.error || result.status !== 0) {
  exitWithFailure(result, "ainotate annotate");
}

emitAnnotateDecision(result.stdout, "Markdown Annotations");
