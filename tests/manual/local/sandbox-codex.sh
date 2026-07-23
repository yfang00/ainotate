#!/bin/bash
# Sandbox script for testing Ainotate with Codex
#
# Usage:
#   ./sandbox-codex.sh [--keep] [--no-git]
#
# Options:
#   --keep    Don't clean up sandbox on exit (for debugging)
#   --no-git  Don't initialize git repo
#
# What it does:
#   1. Compiles the ainotate binary
#   2. Creates a temp directory with sample files
#   3. Launches Codex in the sandbox
#
# To test:
#   - Annotate last: !ainotate last
#   - Annotate file: !ainotate annotate README.md
#
# Prerequisites:
#   - Codex CLI installed (codex or npx codex)
#   - ainotate binary at ~/.local/bin/ainotate

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Parse CLI flags
KEEP_SANDBOX=false
NO_GIT=false
for arg in "$@"; do
  case $arg in
    --keep)
      KEEP_SANDBOX=true
      shift
      ;;
    --no-git)
      NO_GIT=true
      shift
      ;;
  esac
done

echo "=== Ainotate Codex Sandbox ==="
echo ""

# Build the ainotate binary
echo "Compiling ainotate binary..."
cd "$PROJECT_ROOT"
bun run build:hook > /dev/null 2>&1
bun run build:review > /dev/null 2>&1
bun build apps/hook/server/index.ts --compile --no-compile-autoload-bunfig --outfile ~/.local/bin/ainotate 2>&1
echo "Binary compiled to ~/.local/bin/ainotate"
echo ""

# Verify ainotate is in PATH
if ! command -v ainotate &>/dev/null; then
  echo "WARNING: ainotate not found in PATH"
  echo "Add ~/.local/bin to your PATH:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo ""
fi

# Create temp directory
SANDBOX_DIR=$(mktemp -d)
echo "Created sandbox: $SANDBOX_DIR"

# Cleanup on exit (unless --keep)
cleanup() {
  echo ""
  if [ "$KEEP_SANDBOX" = true ]; then
    echo "Keeping sandbox at: $SANDBOX_DIR"
    echo "To clean up manually: rm -rf $SANDBOX_DIR"
  else
    echo "Cleaning up sandbox..."
    rm -rf "$SANDBOX_DIR"
    echo "Done."
  fi
}
trap cleanup EXIT

# Initialize git repo (unless --no-git)
cd "$SANDBOX_DIR"
if [ "$NO_GIT" = false ]; then
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test User"
fi

# Create sample project
cat > README.md << 'EOF'
# Sample Project

This is a sandbox for testing Ainotate with Codex.

## Features
- Last message annotation via !ainotate last
- File annotation via !ainotate annotate <file.md>
EOF

mkdir -p src
cat > src/index.ts << 'EOF'
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet("World"));
EOF

# Commit initial files
if [ "$NO_GIT" = false ]; then
  git add -A
  git commit -q -m "Initial commit"
fi

echo ""
echo "=== Sandbox Ready ==="
echo ""
echo "Directory: $SANDBOX_DIR"
echo ""
echo "To test:"
echo "  1. Have a conversation with Codex first"
echo "  2. Annotate last: !ainotate last"
echo "  3. Annotate file: !ainotate annotate README.md"
echo ""
echo "Note: Codex injects CODEX_THREAD_ID into spawned processes."
echo "The ainotate binary detects this to find the correct rollout file."
echo ""
echo "Launching Codex..."
echo ""

# Launch Codex
cd "$SANDBOX_DIR"
codex
