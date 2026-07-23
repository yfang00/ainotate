const HELP_FLAGS = new Set(["--help", "-h"]);

/** True when any token is a help flag (`--help` / `-h`). */
export function hasHelpFlag(args: string[]): boolean {
  return args.some((arg) => HELP_FLAGS.has(arg));
}

export function isTopLevelHelpInvocation(args: string[]): boolean {
  return args.length > 0 && HELP_FLAGS.has(args[0]);
}

export function isVersionInvocation(args: string[]): boolean {
  return args[0] === "--version" || args[0] === "-v";
}

declare const __CLI_VERSION__: string;

export function formatVersion(): string {
  return `ainotate ${typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "dev"}`;
}

export function isInteractiveNoArgInvocation(
  args: string[],
  stdinIsTTY: boolean | undefined,
): boolean {
  return args.length === 0 && stdinIsTTY === true;
}

export function formatTopLevelHelp(): string {
  return [
    "Usage:",
    "  ainotate --help",
    "  ainotate --version, -v",
    "  ainotate [--browser <name>]",
    "  ainotate review [--git | --gitbutler] [PR_URL]",
    "  ainotate annotate <file.md | file.txt | file.html | https://... | folder/>  [--markdown] [--no-jina] [--gate] [--json] [--hook]",
    "  ainotate annotate-last [--stdin] [--gate] [--json] [--hook]",
    "  ainotate last",
    "  ainotate archive",
    "  ainotate sessions",
    "",
    "Run 'ainotate <command> --help' for command-specific usage.",
    "",
    "Note:",
    "  running 'ainotate' without arguments is for hook integration and expects JSON on stdin",
  ].join("\n");
}

// Per-subcommand usage text. Keyed by the canonical subcommand token; aliases
// (e.g. `last` → `annotate-last`) are resolved in formatSubcommandHelp().
//
// These exist so an agent (or human) probing `ainotate <sub> --help` gets
// usage on stdout instead of accidentally launching the browser UI — running
// `review --help` used to fall through to local review mode and open a tab.
const SUBCOMMAND_HELP: Record<string, string> = {
  review: [
    "Usage:",
    "  ainotate review [--git | --gitbutler] [--local | --no-local] [PR_URL]",
    "",
    "Review local VCS changes or a GitHub/GitLab pull request in the browser.",
    "",
    "Options:",
    "  --git         Force git as the VCS (skip auto-detection)",
    "  --gitbutler   Force GitButler as the VCS (requires but 0.21.0+)",
    "  --local       For PR review, prepare a local checkout for full file access (default)",
    "  --no-local    For PR review, skip the local checkout (diff only)",
    "  PR_URL        GitHub PR or GitLab MR URL to review",
    "",
    "Examples:",
    "  ainotate review",
    "  ainotate review --git",
    "  ainotate review --gitbutler",
    "  ainotate review https://github.com/owner/repo/pull/123",
  ].join("\n"),
  annotate: [
    "Usage:",
    "  ainotate annotate <file.md | file.txt | file.html | https://... | folder/> [--markdown] [--no-jina] [--gate] [--json] [--hook]",
    "",
    "Open a markdown/text/HTML file, a URL, or a folder of documents in the annotation UI.",
    "",
    "Options:",
    "  --markdown    Convert HTML input to markdown instead of rendering it raw",
    "  --no-jina     Fetch URLs with fetch+Turndown instead of Jina Reader",
    "  --gate        Add an Approve button (review-gate UX)",
    "  --json        Emit a structured decision JSON on stdout",
    "  --hook        Emit hook-native JSON (block/pass) for PostToolUse/Stop hooks",
  ].join("\n"),
  "annotate-last": [
    "Usage:",
    "  ainotate annotate-last [--stdin] [--gate] [--json] [--hook]",
    "  ainotate last [--stdin] [--gate] [--json] [--hook]",
    "",
    "Annotate the last assistant message from the current agent session.",
    "",
    "Options:",
    "  --stdin       Read the message content from stdin instead of session logs",
    "  --gate        Add an Approve button (review-gate UX)",
    "  --json        Emit a structured decision JSON on stdout",
    "  --hook        Emit hook-native JSON (block/pass) for PostToolUse/Stop hooks",
  ].join("\n"),
  archive: [
    "Usage:",
    "  ainotate archive",
    "",
    "Open a read-only browser for saved plan decisions in ~/.ainotate/plans/.",
  ].join("\n"),
  sessions: [
    "Usage:",
    "  ainotate sessions [--open [N]] [--clean]",
    "",
    "List active Ainotate server sessions.",
    "",
    "Options:",
    "  --open [N]    Reopen session #N (default 1) in the browser",
    "  --clean       Remove stale session entries",
  ].join("\n"),
};

// Aliases share another subcommand's help text.
const SUBCOMMAND_HELP_ALIASES: Record<string, string> = {
  last: "annotate-last",
};

/**
 * Returns the canonical subcommand name when `args` is a `<sub> ... --help`
 * invocation for a user-facing subcommand, or null otherwise. Lets the CLI
 * print usage and exit before a subcommand branch can launch the UI.
 */
export function isSubcommandHelpInvocation(args: string[]): string | null {
  const sub = args[0];
  if (!sub) return null;
  const canonical = SUBCOMMAND_HELP_ALIASES[sub] ?? sub;
  if (!(canonical in SUBCOMMAND_HELP)) return null;
  return hasHelpFlag(args.slice(1)) ? canonical : null;
}

/** Usage text for a canonical subcommand (falls back to top-level help). */
export function formatSubcommandHelp(subcommand: string): string {
  return SUBCOMMAND_HELP[subcommand] ?? formatTopLevelHelp();
}

export function formatInteractiveNoArgClarification(): string {
  return [
    "ainotate (without arguments) is usually launched automatically by Claude Code hooks.",
    "It expects hook JSON on stdin.",
    "",
    "For interactive use, try:",
    "  ainotate review",
    "  ainotate annotate <file.md | file.txt | file.html | https://...>",
    "  ainotate last",
    "  ainotate archive",
    "  ainotate sessions",
    "",
    "Run 'ainotate --help' for top-level usage.",
  ].join("\n");
}
