#!/bin/bash
#
# Build Ainotate from THIS checkout and install it over whatever the release
# installer put on this machine.
#
# scripts/install.sh downloads a published binary; it never builds. So after
# changing UI or server code the only way to run your work in a real agent is
# to build and place the artifacts yourself — and there are two of them, not
# one. The compiled binary embeds the plan/review HTML, but the OpenCode plugin
# is installed as a SELF-CONTAINED COPY with its own bundled HTML under
# ~/.config/opencode/ainotate/. Rebuilding only the binary silently leaves
# OpenCode on the previous UI. This script does both and reports what it
# touched.
#
# Skills and slash commands are a third artifact, and they are checked out from
# this repo too. Editing a SKILL.md and rebuilding used to leave the machine
# running the previously INSTALLED copy with nothing to signal it was stale —
# which is how a binary and its skill ended up describing different output
# contracts. They are refreshed here, but only where this machine already has
# them: bootstrapping new agent wiring (hooks, config, first-time skill install)
# remains install.sh's job. Run install.sh first if this machine has never had
# Ainotate installed.
set -e

INSTALL_DIR="${AINOTATE_LOCAL_INSTALL_DIR:-$HOME/.local/bin}"
BINARY_ONLY=0
SKIP_BINARY=0
SKIP_SKILLS=0
KEEP_BACKUP=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
    cat <<'EOF'
Usage: scripts/install-local.sh [--binary-only] [--skip-binary] [--skip-skills]
                                [--install-dir <dir>] [--no-backup] [--help]

Builds the current checkout and installs it over the release install:
  1. apps/review        -> the code-review bundle
  2. build:hook         -> apps/hook/dist/*.html (plan + review, embedded)
  3. compiled binary    -> <install dir>/ainotate
  4. build:opencode     -> refreshes ~/.config/opencode/ainotate/ when OpenCode
                           is wired (its plugin carries its own copy of the UI)
  5. skills + commands  -> refreshes the installed copies under ~/.claude,
                           ~/.agents, ~/.kiro, ~/.gemini and OpenCode, for the
                           agents that already have them

Options:
  --binary-only      Skip the OpenCode plugin refresh.
  --skip-binary      Only refresh the OpenCode plugin copy.
  --skip-skills      Do not refresh installed skills and slash commands.
  --install-dir <d>  Where to place the binary (default: ~/.local/bin, or
                     $AINOTATE_LOCAL_INSTALL_DIR).
  --no-backup        Do not keep the previous binary as <name>.previous.
  -h, --help         Show this help and exit.

Requires bun. Build order matters: build:hook copies pre-built HTML from
apps/review/dist, so the review app is always built first.
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --binary-only)   BINARY_ONLY=1; shift ;;
        --skip-binary)   SKIP_BINARY=1; shift ;;
        --skip-skills)   SKIP_SKILLS=1; shift ;;
        --no-backup)     KEEP_BACKUP=0; shift ;;
        --install-dir)
            [ -n "${2:-}" ] || { echo "--install-dir requires a directory" >&2; exit 1; }
            INSTALL_DIR="$2"; shift 2 ;;
        -h|--help)       usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; echo "" >&2; usage >&2; exit 1 ;;
    esac
done

if [ "$BINARY_ONLY" = "1" ] && [ "$SKIP_BINARY" = "1" ]; then
    echo "--binary-only and --skip-binary are mutually exclusive" >&2
    exit 1
fi

command -v bun >/dev/null 2>&1 || { echo "bun is required to build from source" >&2; exit 1; }
[ -f "$REPO_ROOT/package.json" ] || { echo "Not an Ainotate checkout: $REPO_ROOT" >&2; exit 1; }

cd "$REPO_ROOT"

OCROOT="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
# Only refresh OpenCode when this machine actually has the plugin installed.
# A bare ~/.config/opencode from some other tool is not a reason to write here.
opencode_wired=0
if [ "$BINARY_ONLY" != "1" ] && [ -e "$OCROOT/plugin/ainotate.js" ]; then
    opencode_wired=1
fi

installed_binary=""
installed_opencode=""

if [ "$SKIP_BINARY" != "1" ]; then
    echo "Building review app..."
    bun run --cwd apps/review build >/dev/null

    echo "Building plan + review bundles..."
    bun run build:hook >/dev/null

    # Compile to a temp file first: a failed compile must never leave the
    # machine without a working ainotate.
    staged="$(mktemp -t ainotate-build.XXXXXX)"
    incoming=""
    trap 'rm -f "$staged" ${incoming:+"$incoming"}' EXIT
    echo "Compiling binary..."
    bun build apps/hook/server/index.ts --compile --outfile "$staged" >/dev/null

    chmod +x "$staged"
    "$staged" --version >/dev/null || { echo "Built binary failed to run; leaving the installed one in place" >&2; exit 1; }

    mkdir -p "$INSTALL_DIR"
    target="$INSTALL_DIR/ainotate"
    if [ "$KEEP_BACKUP" = "1" ] && [ -f "$target" ]; then
        cp "$target" "$target.previous"
    fi
    # Stage inside the install dir, then rename into place.
    #
    # NOT `cp "$staged" "$target"`: overwriting the file in place reuses its
    # inode, and on macOS that has been observed to leave the kernel SIGKILLing
    # the binary on exec — every invocation dies with exit 137 and no output,
    # which points nowhere near the cause. Renaming gives the new build its own
    # inode, is atomic (never a window with no ainotate on PATH), and cannot
    # fail cross-device because the staging file sits in the destination
    # directory rather than $TMPDIR.
    #
    # Treat that as mitigation, not a proven cure: the failure is intermittent
    # (it needs the old build to have been executed recently) and resisted
    # reduction to a small test case. Note also that `codesign -v` is NOT a
    # health check here — `bun build --compile` output fails verification
    # straight out of the build, untouched, and still runs. The run check below
    # is the check that actually means something.
    incoming="$target.incoming.$$"
    cp "$staged" "$incoming"
    chmod +x "$incoming"
    mv -f "$incoming" "$target"
    incoming=""

    # Verify the INSTALLED path, not just the staged copy above. The staged copy
    # always ran fine; the breakage only appeared once the binary was at its
    # final path, so checking it here turns a silent exit-137 surprise on the
    # user's next invocation into a loud failure during install. Re-signing is
    # the recovery that empirically brought a killed binary back.
    if ! "$target" --version >/dev/null 2>&1; then
        if command -v codesign >/dev/null 2>&1; then
            echo "Installed binary would not run — re-signing..." >&2
            codesign --force --sign - "$target" >/dev/null 2>&1 || true
        fi
        "$target" --version >/dev/null 2>&1 || {
            echo "Installed binary at $target will not run." >&2
            if [ -f "$target.previous" ]; then
                echo "The previous build is still at $target.previous — restore it with:" >&2
                echo "  mv \"$target.previous\" \"$target\"" >&2
            fi
            exit 1
        }
    fi
    installed_binary="$target"
fi

if [ "$opencode_wired" = "1" ]; then
    echo "Refreshing OpenCode plugin copy..."
    bun run build:opencode >/dev/null

    plug="$REPO_ROOT/apps/opencode-plugin"
    if [ -f "$plug/dist/index.js" ] && [ -f "$plug/dist/embedded.js" ] \
        && [ -f "$plug/ainotate.html" ] && [ -f "$plug/review-editor.html" ]; then
        dest="$OCROOT/ainotate"
        mkdir -p "$dest/dist" "$OCROOT/plugin"
        cp "$plug/dist/index.js" "$plug/dist/embedded.js" "$dest/dist/"
        cp "$plug/ainotate.html" "$plug/review-editor.html" "$dest/"
        # Mirrors install.sh: index.js loads embedded.js from its own dir and
        # the HTML from the parent, so the symlink must resolve into $dest and
        # never back into this checkout.
        ln -sfn "$dest/dist/index.js" "$OCROOT/plugin/ainotate.js"
        installed_opencode="$dest"
    else
        echo "OpenCode plugin build produced no artifacts; skipped" >&2
    fi
fi

refreshed_skills=""

# Replace an installed skill directory with this checkout's copy.
#
# Only touches a skill this machine ALREADY has, so a local build never
# bootstraps agent wiring that the user has not opted into — the same rule the
# OpenCode gate above follows. Uses install.sh's replace-don't-merge semantics
# (rm then cp, so `cp -r dir dest/dir` cannot nest) to keep a local install and
# a release install byte-identical in layout.
refresh_skill_dir() {
    src="$1"; dest_parent="$2"
    [ -d "$src" ] || return 0
    name="$(basename "$src")"
    [ -d "$dest_parent/$name" ] || return 0
    rm -rf "$dest_parent/$name"
    cp -r "$src" "$dest_parent/"
    refreshed_skills="$refreshed_skills $dest_parent/$name"
}

# Same rule for a single slash-command file.
refresh_command_file() {
    src="$1"; dest_dir="$2"
    [ -f "$src" ] || return 0
    [ -f "$dest_dir/$(basename "$src")" ] || return 0
    cp "$src" "$dest_dir/"
    refreshed_skills="$refreshed_skills $dest_dir/$(basename "$src")"
}

if [ "$SKIP_SKILLS" != "1" ]; then
    # Destinations mirror install.sh rather than being re-derived here, so the
    # two installers cannot drift apart on where things belong.
    for name in ainotate-review ainotate-annotate ainotate-last; do
        refresh_skill_dir "apps/skills/claude/$name" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills"
        refresh_skill_dir "apps/skills/core/$name" "$HOME/.agents/skills"
    done
    for name in ainotate-review ainotate-annotate; do
        refresh_skill_dir "apps/kiro-cli/skills/$name" "$HOME/.kiro/skills"
    done
    for f in apps/opencode-plugin/commands/*.md; do
        refresh_command_file "$f" "$OCROOT/commands"
    done
    for f in apps/gemini/commands/*.toml; do
        refresh_command_file "$f" "$HOME/.gemini/commands"
    done
fi

echo ""
echo "Installed from $REPO_ROOT"
[ -n "$installed_binary" ] && echo "  binary   $installed_binary"
[ -n "$installed_opencode" ] && echo "  opencode $installed_opencode"
if [ -n "$refreshed_skills" ]; then
    for s in $refreshed_skills; do
        echo "  skill    $s"
    done
fi
if [ -z "$installed_binary" ] && [ -z "$installed_opencode" ] && [ -z "$refreshed_skills" ]; then
    echo "  (nothing — every target was skipped)"
fi

# Report which agents pick this up, so a harness that needs its own copy is
# never assumed to be covered by the binary alone.
echo ""
echo "Harnesses on this machine:"
[ -d "$HOME/.claude/skills" ] && ls "$HOME/.claude/skills" 2>/dev/null | grep -q ainotate \
    && echo "  claude-code   uses the binary"
[ -d "$HOME/.agents/skills" ] && ls "$HOME/.agents/skills" 2>/dev/null | grep -q ainotate \
    && echo "  codex         uses the binary"
ls "$HOME/.gemini/commands" 2>/dev/null | grep -q ainotate \
    && echo "  gemini-cli    uses the binary"
[ -d "$HOME/.kiro/skills" ] && ls "$HOME/.kiro/skills" 2>/dev/null | grep -q ainotate \
    && echo "  kiro-cli      uses the binary"
[ "$opencode_wired" = "1" ] && echo "  opencode      uses its own copy (refreshed above)"
if [ -e "$OCROOT/plugin/ainotate.js" ] && [ "$BINARY_ONLY" = "1" ]; then
    echo "  opencode      HAS ITS OWN COPY AND WAS SKIPPED — it still runs the previous UI"
fi
exit 0
