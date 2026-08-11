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
# Agent wiring (skills, hooks, slash commands, config) is NOT touched — that is
# install.sh's job and it does not change between local builds. Run install.sh
# first if this machine has never had Ainotate installed.
set -e

INSTALL_DIR="${AINOTATE_LOCAL_INSTALL_DIR:-$HOME/.local/bin}"
BINARY_ONLY=0
SKIP_BINARY=0
KEEP_BACKUP=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
    cat <<'EOF'
Usage: scripts/install-local.sh [--binary-only] [--skip-binary]
                                [--install-dir <dir>] [--no-backup] [--help]

Builds the current checkout and installs it over the release install:
  1. apps/review        -> the code-review bundle
  2. build:hook         -> apps/hook/dist/*.html (plan + review, embedded)
  3. compiled binary    -> <install dir>/ainotate
  4. build:opencode     -> refreshes ~/.config/opencode/ainotate/ when OpenCode
                           is wired (its plugin carries its own copy of the UI)

Options:
  --binary-only      Skip the OpenCode plugin refresh.
  --skip-binary      Only refresh the OpenCode plugin copy.
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
    trap 'rm -f "$staged"' EXIT
    echo "Compiling binary..."
    bun build apps/hook/server/index.ts --compile --outfile "$staged" >/dev/null

    chmod +x "$staged"
    "$staged" --version >/dev/null || { echo "Built binary failed to run; leaving the installed one in place" >&2; exit 1; }

    mkdir -p "$INSTALL_DIR"
    target="$INSTALL_DIR/ainotate"
    if [ "$KEEP_BACKUP" = "1" ] && [ -f "$target" ]; then
        cp "$target" "$target.previous"
    fi
    # cp, not mv: mv across filesystems from $TMPDIR can fail late, and cp
    # preserves the destination inode for anything holding it open.
    cp "$staged" "$target"
    chmod +x "$target"
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

echo ""
echo "Installed from $REPO_ROOT"
[ -n "$installed_binary" ] && echo "  binary   $installed_binary"
[ -n "$installed_opencode" ] && echo "  opencode $installed_opencode"
if [ -z "$installed_binary" ] && [ -z "$installed_opencode" ]; then
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
