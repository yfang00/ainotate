#!/bin/bash
set -e

REPO="yfang00/ainotate"
SEM_REPO="Ataraxy-Labs/sem"
SEM_VERSION="v0.8.0"
INSTALL_DIR="$HOME/.local/bin"

# First ainotate release that carries SLSA build-provenance attestations.
# Releases before this tag were cut before release.yml added the
# `actions/attest-build-provenance` step, so `gh attestation verify` will
# fail with "no attestations found" for them regardless of authenticity.
# When provenance verification is enabled (via flag, env var, or
# ~/.ainotate/config.json), the installer compares the resolved tag
# against this constant and fails fast with a clear message instead of
# downloading a binary, running SHA256, and then hitting a cryptic gh
# failure. Bumped once at the first attested release via the release skill.
MIN_ATTESTED_VERSION="v0.17.2"

# Compare two vMAJOR.MINOR.PATCH tags. Returns 0 (success) if $1 >= $2.
# Uses `sort -V` (version sort) which handles minor/patch width correctly
# unlike plain lexicographic comparison (e.g. v0.9.0 vs v0.10.0).
version_ge() {
    [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" = "$1" ]
}

VERSION="latest"
# Tracks whether a version was explicitly set via --version or positional.
# Used to reject mixing --version <tag> with a stray positional token,
# which would otherwise silently overwrite the earlier value and 404.
VERSION_EXPLICIT=0
# Three-layer opt-in for SLSA build-provenance verification.
# Precedence: CLI flag > env var > ~/.ainotate/config.json > default (off).
# -1 = flag not set yet (fall through to lower layers); 0 = disable; 1 = enable.
VERIFY_ATTESTATION_FLAG=-1
# Guided-install answers. Precedence: CLI flags > wizard (terminal, first run
# or --reconfigure) > saved prefs from a previous run > defaults (nothing
# model-invocable). Empty string = not set by a flag.
MODEL_INVOCABLE_FLAG=""
NON_INTERACTIVE=0
RECONFIGURE=0
# Binary-only mode. Installs just the ainotate binary (to $INSTALL_DIR) and
# no persistent state elsewhere — no sem sidecar, no agent-terminal runtime, no
# skills, hooks, slash commands, or per-agent config (Claude, Codex, OpenCode,
# Gemini, Kiro). Set by --minimal (1) / --no-minimal (0); -1 = neither flag
# given (fall through to the AINOTATE_MINIMAL env var). Resolved after arg
# parsing so a flag overrides the env var in either direction.
MINIMAL_FLAG=-1

usage() {
    cat <<'USAGE'
Usage: install.sh [--version <tag>] [--verify-attestation | --skip-attestation]
                  [--model-invocable <list>|none]
                  [--minimal | --no-minimal] [--non-interactive]
                  [--reconfigure] [--help]
       install.sh <tag>

Options:
  --version <tag>        Install a specific version (e.g. vX.Y.Z or X.Y.Z;
                         see https://github.com/yfang00/ainotate/releases).
                         Defaults to the latest GitHub release.
  --verify-attestation   Require SLSA build-provenance verification via
                         `gh attestation verify`. Fails the install if gh is
                         not available or the check does not pass.
  --skip-attestation     Force-skip provenance verification even if enabled
                         via env var or ~/.ainotate/config.json.
  --model-invocable <l>  Comma-separated skill names to make model-invocable
                         (e.g. ainotate-review,ainotate-annotate), or
                         "none". Skills are user-invoked-only by default.
  --minimal              Install only the ainotate binary (aliased
                         --binary-only). Skips the sem semantic-diff sidecar,
                         the agent-terminal runtime, and every per-agent
                         integration (skills, hooks, slash commands, and config
                         for Claude, Codex, OpenCode, Gemini, and Kiro). No
                         persistent state is written outside $HOME/.local/bin
                         (a temp download file is still used and removed). Also
                         enabled by exporting AINOTATE_MINIMAL=1.
  --no-minimal           Force a full install even when AINOTATE_MINIMAL is
                         set in the environment.
  --non-interactive      Never prompt, even in a terminal. Uses flags, then
                         saved answers from a previous run, then the defaults
                         (nothing model-invocable).
  --reconfigure          Re-open the guided questions even if answers were
                         saved by a previous run.
  -h, --help             Show this help and exit.

This installer downloads a published release; it never builds. To run the code
in a local checkout inside your agents, use scripts/install-local.sh instead.

Guided install: when run in a terminal for the first time (or with
--reconfigure), the installer asks whether to install the extra skills and
whether any skills should be callable by the model. Answers are saved to
<data dir>/install-prefs and
reused silently on re-runs. Piped/CI runs (no terminal) never prompt and
keep the defaults.

Provenance verification is off by default. Enable it by any of:
  - passing --verify-attestation
  - exporting AINOTATE_VERIFY_ATTESTATION=1
  - setting { "verifyAttestation": true } in ~/.ainotate/config.json

The optional semantic-diff sidecar (the 'sem' binary, used by code review) is
installed after Ainotate itself. Skip it by exporting
AINOTATE_SKIP_SEM_INSTALL=1. Its download is time-bounded, so a slow network
never blocks an otherwise-complete install.

The optional annotate agent terminal runtime is installed after Ainotate
itself. Skip it by exporting AINOTATE_SKIP_AGENT_TERMINAL_INSTALL=1. If
Node/npm is unavailable, Ainotate still installs and annotate mode works
without the integrated terminal.

Examples:
  curl -fsSL https://ainotate.ai/install.sh | bash
  curl -fsSL https://ainotate.ai/install.sh | bash -s -- --version vX.Y.Z
  curl -fsSL https://ainotate.ai/install.sh | bash -s -- --model-invocable none
  bash install.sh vX.Y.Z
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --version)
            if [ -z "${2:-}" ]; then
                echo "--version requires an argument" >&2
                usage >&2
                exit 1
            fi
            case "$2" in
                -*)
                    echo "--version requires a tag value, got flag: $2" >&2
                    usage >&2
                    exit 1
                    ;;
            esac
            VERSION="$2"
            VERSION_EXPLICIT=1
            shift 2
            ;;
        --version=*)
            value="${1#--version=}"
            if [ -z "$value" ]; then
                echo "--version requires an argument" >&2
                usage >&2
                exit 1
            fi
            case "$value" in
                -*)
                    echo "--version requires a tag value, got flag: $value" >&2
                    usage >&2
                    exit 1
                    ;;
            esac
            VERSION="$value"
            VERSION_EXPLICIT=1
            shift
            ;;
        --verify-attestation)
            if [ "$VERIFY_ATTESTATION_FLAG" = "0" ]; then
                echo "--verify-attestation and --skip-attestation are mutually exclusive" >&2
                usage >&2
                exit 1
            fi
            VERIFY_ATTESTATION_FLAG=1
            shift
            ;;
        --skip-attestation)
            if [ "$VERIFY_ATTESTATION_FLAG" = "1" ]; then
                echo "--skip-attestation and --verify-attestation are mutually exclusive" >&2
                usage >&2
                exit 1
            fi
            VERIFY_ATTESTATION_FLAG=0
            shift
            ;;
        --model-invocable)
            if [ -z "${2:-}" ]; then
                echo "--model-invocable requires a comma-separated skill list or 'none'" >&2
                usage >&2
                exit 1
            fi
            MODEL_INVOCABLE_FLAG="$2"
            shift 2
            ;;
        --model-invocable=*)
            MODEL_INVOCABLE_FLAG="${1#--model-invocable=}"
            if [ -z "$MODEL_INVOCABLE_FLAG" ]; then
                echo "--model-invocable requires a comma-separated skill list or 'none'" >&2
                usage >&2
                exit 1
            fi
            shift
            ;;
        --non-interactive|--yes)
            NON_INTERACTIVE=1
            shift
            ;;
        --reconfigure)
            RECONFIGURE=1
            shift
            ;;
        --minimal|--binary-only)
            if [ "$MINIMAL_FLAG" = "0" ]; then
                echo "--minimal and --no-minimal are mutually exclusive" >&2
                usage >&2
                exit 1
            fi
            MINIMAL_FLAG=1
            shift
            ;;
        --no-minimal)
            if [ "$MINIMAL_FLAG" = "1" ]; then
                echo "--no-minimal and --minimal are mutually exclusive" >&2
                usage >&2
                exit 1
            fi
            MINIMAL_FLAG=0
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -*)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
        *)
            # Positional form: install.sh vX.Y.Z (matches install.cmd interface).
            # Reject if --version was already passed — silent overwrite is worse
            # than a clean usage error.
            if [ "$VERSION_EXPLICIT" -eq 1 ]; then
                echo "Unexpected positional argument: $1 (version already set)" >&2
                usage >&2
                exit 1
            fi
            VERSION="$1"
            VERSION_EXPLICIT=1
            shift
            ;;
    esac
done

# Resolve binary-only mode. Precedence: --minimal / --no-minimal flag >
# AINOTATE_MINIMAL env var > default (off). The env var lets `curl ... | bash`
# runs opt in without a flag, matching how AINOTATE_SKIP_SEM_INSTALL et al.
# work; --no-minimal lets a flag override an env var that enables it.
minimal=0
case "${AINOTATE_MINIMAL:-}" in
    1|true|yes|TRUE|YES|True|Yes) minimal=1 ;;
esac
if [ "$MINIMAL_FLAG" -ne -1 ]; then
    minimal="$MINIMAL_FLAG"
fi

case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)      echo "Unsupported OS. For Windows, run: irm https://ainotate.ai/install.ps1 | iex" >&2; exit 1 ;;
esac

case "$(uname -m)" in
    x86_64|amd64)   arch="x64" ;;
    arm64|aarch64)  arch="arm64" ;;
    *)              echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

platform="${os}-${arch}"
binary_name="ainotate-${platform}"

# Clean up old Windows install locations (for users running bash on Windows)
if [ -n "$USERPROFILE" ]; then
    # Running on Windows (Git Bash, MSYS, etc.) - clean up old locations
    rm -f "$USERPROFILE/.local/bin/ainotate" "$USERPROFILE/.local/bin/ainotate.exe" 2>/dev/null || true
    rm -f "$LOCALAPPDATA/ainotate/ainotate.exe" 2>/dev/null || true
    echo "Cleaned up old Windows install locations"
fi

if [ "$VERSION" = "latest" ]; then
    echo "Fetching latest version..."
    latest_tag=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)

    if [ -z "$latest_tag" ]; then
        echo "Failed to fetch latest version" >&2
        exit 1
    fi
else
    # Normalize: auto-prefix v if missing (matches install.cmd behaviour)
    case "$VERSION" in
        v*) latest_tag="$VERSION" ;;
        *)  latest_tag="v$VERSION" ;;
    esac
fi

echo "Installing ainotate ${latest_tag}..."

# Resolve SLSA build-provenance verification opt-in BEFORE the download so we
# can fail fast without wasting bandwidth if the requested tag predates
# provenance support. The three layers (config file, env var, CLI flag) are
# all cheap to check — no reason to defer this past the arg parse.
#
# Precedence: CLI flag > env var > ~/.ainotate/config.json > default (off).
verify_attestation=0

# Layer 3: config file (lowest precedence of the opt-in sources).
# Crude grep against a flat boolean — AinotateConfig has no nested
# verifyAttestation, so false positives are not a concern.
# Resolve the data directory, expanding ~ the same way the runtime does.
_raw_dir="${AINOTATE_DATA_DIR:-}"
case "$_raw_dir" in
    "")      _config_dir="$HOME/.ainotate" ;;
    "~")     _config_dir="$HOME" ;;
    "~/"*)   _config_dir="$HOME/${_raw_dir#\~/}" ;;
    *)       _config_dir="$_raw_dir" ;;
esac
if [ -f "$_config_dir/config.json" ]; then
    if grep -q '"verifyAttestation"[[:space:]]*:[[:space:]]*true' "$_config_dir/config.json" 2>/dev/null; then
        verify_attestation=1
    fi
fi

# Layer 2: env var (overrides config file).
case "${AINOTATE_VERIFY_ATTESTATION:-}" in
    1|true|yes|TRUE|YES|True|Yes) verify_attestation=1 ;;
    0|false|no|FALSE|NO|False|No) verify_attestation=0 ;;
esac

# Layer 1: CLI flag (overrides everything).
if [ "$VERIFY_ATTESTATION_FLAG" -ne -1 ]; then
    verify_attestation="$VERIFY_ATTESTATION_FLAG"
fi

# Pre-flight: if verification is requested, reject tags older than the first
# attested release before we download anything. This catches both explicit
# `--version <old-tag>` and implicit `latest`-resolves-to-old-tag cases with
# a clean, actionable error — no cryptic `gh: no attestations found` after
# a wasted download.
if [ "$verify_attestation" -eq 1 ]; then
    if ! version_ge "$latest_tag" "$MIN_ATTESTED_VERSION"; then
        echo "Provenance verification was requested, but ${latest_tag} predates" >&2
        echo "ainotate's attestation support. The first release carrying signed" >&2
        echo "build provenance is ${MIN_ATTESTED_VERSION}. Options:" >&2
        echo "  - Pin to ${MIN_ATTESTED_VERSION} or later: --version ${MIN_ATTESTED_VERSION}" >&2
        echo "  - Install without provenance verification: --skip-attestation" >&2
        echo "  - Or unset AINOTATE_VERIFY_ATTESTATION / remove verifyAttestation" >&2
        echo "    from ~/.ainotate/config.json" >&2
        exit 1
    fi
fi

binary_url="https://github.com/${REPO}/releases/download/${latest_tag}/${binary_name}"
checksum_url="${binary_url}.sha256"

mkdir -p "$INSTALL_DIR"

tmp_file=$(mktemp)
curl -fsSL -o "$tmp_file" "$binary_url"

expected_checksum=$(curl -fsSL "$checksum_url" | cut -d' ' -f1)

if [ "$(uname -s)" = "Darwin" ]; then
    actual_checksum=$(shasum -a 256 "$tmp_file" | cut -d' ' -f1)
else
    actual_checksum=$(sha256sum "$tmp_file" | cut -d' ' -f1)
fi

if [ "$actual_checksum" != "$expected_checksum" ]; then
    echo "Checksum verification failed!" >&2
    rm -f "$tmp_file"
    exit 1
fi

if [ "$verify_attestation" -eq 1 ]; then
    # $verify_attestation was resolved before the download; MIN_ATTESTED_VERSION
    # pre-flight already ran and rejected old tags. At this point we know
    # the tag is attested and gh should find a bundle.
    if command -v gh >/dev/null 2>&1; then
        # Capture combined output so we can surface gh's actual error message
        # (auth, network, missing attestation, etc.) on failure instead of a
        # generic "verification failed" with no diagnostic detail.
        # Constrain verification to the exact tag + signing workflow — not
        # just "built by somewhere in this repo". --source-ref pins the
        # git ref the attestation was produced from; --signer-workflow pins
        # the workflow file that signed it. Together they prevent accepting
        # a misattached asset or an attestation from an unrelated workflow.
        if gh_output=$(gh attestation verify "$tmp_file" \
            --repo "$REPO" \
            --source-ref "refs/tags/${latest_tag}" \
            --signer-workflow "yfang00/ainotate/.github/workflows/release.yml" 2>&1); then
            echo "✓ verified build provenance (SLSA)"
        else
            echo "$gh_output" >&2
            echo "Attestation verification failed!" >&2
            echo "The binary's SHA256 matched, but no valid signed provenance was found" >&2
            echo "for ${REPO}. Refusing to install." >&2
            rm -f "$tmp_file"
            exit 1
        fi
    else
        echo "verifyAttestation is enabled but gh CLI was not found." >&2
        echo "Install https://cli.github.com (and run 'gh auth login')," >&2
        echo "or unset AINOTATE_VERIFY_ATTESTATION / remove verifyAttestation from" >&2
        echo "~/.ainotate/config.json / pass --skip-attestation." >&2
        rm -f "$tmp_file"
        exit 1
    fi
else
    echo "SHA256 verified. For build provenance verification, see"
    echo "https://ainotate.ai/docs/getting-started/installation/#verifying-your-install"
fi

# Remove old binary first (handles Windows .exe and locked file issues)
rm -f "$INSTALL_DIR/ainotate" "$INSTALL_DIR/ainotate.exe" 2>/dev/null || true

mv "$tmp_file" "$INSTALL_DIR/ainotate"
chmod +x "$INSTALL_DIR/ainotate"

echo ""
echo "ainotate ${latest_tag} installed to ${INSTALL_DIR}/ainotate"

# Print the PATH-setup hint if $INSTALL_DIR isn't already on PATH. Extracted so
# both the normal flow and the --minimal early exit below can reuse it.
print_path_advice() {
    if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
        echo ""
        echo "${INSTALL_DIR} is not in your PATH. Add it with:"
        echo ""

        case "$SHELL" in
            */zsh)  shell_config="~/.zshrc" ;;
            */bash) shell_config="~/.bashrc" ;;
            *)      shell_config="your shell config" ;;
        esac

        echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ${shell_config}"
        echo "  source ${shell_config}"
    fi
}

# Binary-only mode stops here: the binary is installed, so print PATH advice and
# exit before any sidecar download, agent integration, skill checkout, config
# write, cache clear, or cleanup migration runs. No persistent state is written
# outside $INSTALL_DIR (the temp download file was already cleaned up above; the
# config dir may have been read, never written). See the MINIMAL_FLAG /
# AINOTATE_MINIMAL resolution near the top.
if [ "$minimal" -eq 1 ]; then
    print_path_advice
    echo ""
    echo "Minimal install complete — only the ainotate binary was installed."
    echo "No skills, hooks, agent integrations, or config files were written."
    exit 0
fi

sem_asset_for_platform() {
    case "$platform" in
        darwin-arm64) echo "sem-darwin-arm64.tar.gz" ;;
        linux-arm64)  echo "sem-linux-arm64.tar.gz" ;;
        linux-x64)    echo "sem-linux-x86_64.tar.gz" ;;
        *)            return 1 ;;
    esac
}

install_sem_sidecar() {
    case "${AINOTATE_SKIP_SEM_INSTALL:-}" in
        1|true|yes|TRUE|YES|True|Yes)
            echo "Skipping semantic diff sidecar install (AINOTATE_SKIP_SEM_INSTALL is set)"
            return 0
            ;;
    esac

    sem_asset="$(sem_asset_for_platform 2>/dev/null || true)"
    if [ -z "$sem_asset" ]; then
        echo "Skipping semantic diff sidecar install (sem does not publish ${platform})"
        return 0
    fi

    sem_dir="${_config_dir}/vendor/sem/${SEM_VERSION}"
    sem_bin="${sem_dir}/sem"
    if [ -x "$sem_bin" ] && "$sem_bin" --version 2>/dev/null | grep -q '^sem '; then
        echo "Semantic diff sidecar already installed at ${sem_bin}"
        return 0
    fi

    tmp_sem_dir="$(mktemp -d)"
    sem_archive="${tmp_sem_dir}/${sem_asset}"
    sem_checksums="${tmp_sem_dir}/checksums.txt"
    sem_base_url="https://github.com/${SEM_REPO}/releases/download/${SEM_VERSION}"

    # Bounded so a slow/hung download of this optional sidecar can't wedge an
    # install where ainotate itself already landed. On timeout curl fails and
    # we skip gracefully. Opt out entirely with AINOTATE_SKIP_SEM_INSTALL=1.
    if ! curl -fsSL --connect-timeout 10 --max-time 120 -o "$sem_archive" "${sem_base_url}/${sem_asset}"; then
        echo "Skipping semantic diff sidecar install (download failed)"
        rm -rf "$tmp_sem_dir"
        return 0
    fi
    if ! curl -fsSL --connect-timeout 10 --max-time 60 -o "$sem_checksums" "${sem_base_url}/checksums.txt"; then
        echo "Skipping semantic diff sidecar install (checksum download failed)"
        rm -rf "$tmp_sem_dir"
        return 0
    fi

    expected_sem_checksum="$(awk -v name="$sem_asset" '$2 == name { print $1 }' "$sem_checksums")"
    if [ -z "$expected_sem_checksum" ]; then
        echo "Skipping semantic diff sidecar install (checksum missing for ${sem_asset})"
        rm -rf "$tmp_sem_dir"
        return 0
    fi

    if [ "$(uname -s)" = "Darwin" ]; then
        actual_sem_checksum="$(shasum -a 256 "$sem_archive" | cut -d' ' -f1)"
    else
        actual_sem_checksum="$(sha256sum "$sem_archive" | cut -d' ' -f1)"
    fi

    if [ "$actual_sem_checksum" != "$expected_sem_checksum" ]; then
        echo "Skipping semantic diff sidecar install (checksum mismatch)"
        rm -rf "$tmp_sem_dir"
        return 0
    fi

    if ! tar -xzf "$sem_archive" -C "$tmp_sem_dir"; then
        echo "Skipping semantic diff sidecar install (extract failed)"
        rm -rf "$tmp_sem_dir"
        return 0
    fi

    extracted_sem="$(find "$tmp_sem_dir" -type f -name sem -print -quit)"
    if [ -z "$extracted_sem" ]; then
        echo "Skipping semantic diff sidecar install (binary missing from archive)"
        rm -rf "$tmp_sem_dir"
        return 0
    fi

    if ! mkdir -p "$sem_dir"; then
        echo "Skipping semantic diff sidecar install (directory creation failed)"
        rm -rf "$tmp_sem_dir"
        return 0
    fi
    if ! cp "$extracted_sem" "$sem_bin"; then
        echo "Skipping semantic diff sidecar install (copy failed)"
        rm -rf "$tmp_sem_dir"
        return 0
    fi
    if ! chmod +x "$sem_bin"; then
        echo "Skipping semantic diff sidecar install (chmod failed)"
        rm -f "$sem_bin"
        rm -rf "$tmp_sem_dir"
        return 0
    fi
    rm -rf "$tmp_sem_dir"
    echo "Semantic diff sidecar installed to ${sem_bin}"
}

install_agent_terminal_runtime() {
    case "${AINOTATE_SKIP_AGENT_TERMINAL_INSTALL:-}" in
        1|true|yes|TRUE|YES|True|Yes)
            echo "Skipping agent terminal runtime install (AINOTATE_SKIP_AGENT_TERMINAL_INSTALL is set)"
            return 0
            ;;
    esac

    if ! "$INSTALL_DIR/ainotate" install-runtime agent-terminal; then
        echo "Skipping agent terminal runtime install (ainotate install-runtime failed)"
    fi
}

install_sem_sidecar
install_agent_terminal_runtime

print_path_advice

# --- Codex CLI / Desktop app support (only if Codex is installed or configured) ---
# Codex stores config and state under $CODEX_HOME when set, falling back to
# ~/.codex (https://developers.openai.com/codex/config-advanced).
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"

codex_home_has_user_config() {
    [ -d "$CODEX_DIR" ] || return 1
    [ -n "$(find "$CODEX_DIR" -mindepth 1 -maxdepth 1 ! -name skills ! -name .DS_Store -print -quit 2>/dev/null)" ]
}

codex_available=0
if command -v codex >/dev/null 2>&1 || codex_home_has_user_config; then
    codex_available=1
fi

kiro_available=0
if command -v kiro-cli >/dev/null 2>&1 || [ -d "$HOME/.kiro" ]; then
    kiro_available=1
fi

if [ "$codex_available" -eq 1 ]; then
    CODEX_CONFIG="$CODEX_DIR/config.toml"
    CODEX_HOOKS="$CODEX_DIR/hooks.json"
    AINOTATE_BIN="${INSTALL_DIR}/ainotate"
    codex_hook_configured=0

    mkdir -p "$CODEX_DIR"

    enable_codex_hooks_config() {
        if [ ! -f "$CODEX_CONFIG" ]; then
            cat > "$CODEX_CONFIG" << 'CODEX_CONFIG_EOF'
[features]
hooks = true
CODEX_CONFIG_EOF
            echo "Created Codex config at ${CODEX_CONFIG}"
            return 0
        fi

        if grep -Eq '^[[:space:]]*features[[:space:]]*=' "$CODEX_CONFIG"; then
            echo ""
            echo "Codex config uses inline features in ${CODEX_CONFIG}; leaving it unchanged."
            echo "Add this manually to enable Ainotate plan review:"
            echo ""
            echo "  [features]"
            echo "  hooks = true"
            return 1
        fi

        tmp_config="$(mktemp)"
        if awk '
            function is_table(line) {
                return line ~ /^[[:space:]]*\[[^]]+\][[:space:]]*$/
            }
            BEGIN {
                in_features = 0
                saw_features = 0
                saw_hook = 0
            }
            {
                if (is_table($0)) {
                    if (in_features && !saw_hook) {
                        print "hooks = true"
                        saw_hook = 1
                    }
                    in_features = ($0 ~ /^[[:space:]]*\[features\][[:space:]]*$/)
                    if (in_features) saw_features = 1
                }

                if (in_features && $0 ~ /^[[:space:]]*(codex_hooks|hooks)[[:space:]]*=/) {
                    print "hooks = true"
                    saw_hook = 1
                    next
                }

                print
            }
            END {
                if (saw_features && in_features && !saw_hook) {
                    print "hooks = true"
                } else if (!saw_features) {
                    print ""
                    print "[features]"
                    print "hooks = true"
                }
            }
        ' "$CODEX_CONFIG" > "$tmp_config"; then
            mv "$tmp_config" "$CODEX_CONFIG"
            echo "Enabled Codex hooks in ${CODEX_CONFIG}"
            return 0
        fi

        rm -f "$tmp_config"
        echo "Could not update ${CODEX_CONFIG}; add hooks manually." >&2
        return 1
    }

    if [ ! -f "$CODEX_HOOKS" ]; then
        cat > "$CODEX_HOOKS" << CODEX_HOOKS_EOF
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${AINOTATE_BIN}",
            "timeout": 345600
          }
        ]
      }
    ]
  }
}
CODEX_HOOKS_EOF
        echo "Created Codex hooks at ${CODEX_HOOKS}"
        codex_hook_configured=1
    elif command -v node >/dev/null 2>&1; then
        if codex_merge_result=$(node - "$CODEX_HOOKS" "$AINOTATE_BIN" <<'NODE'
const fs = require("fs");
const path = require("path");
const [hooksPath, command] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
config.hooks ||= {};
const stopHooks = Array.isArray(config.hooks.Stop) ? config.hooks.Stop : [];
let updated = false;
let foundCustomAinotateHook = false;

function isManagedAinotateCommand(value) {
  const current = value.trim();
  if (current === "ainotate" || current === command) return true;
  return current.startsWith("/") && path.posix.basename(current) === "ainotate";
}

for (const entry of stopHooks) {
  const hooks = Array.isArray(entry?.hooks) ? entry.hooks : [];
  for (const hook of hooks) {
    if (hook?.type !== "command" || typeof hook.command !== "string") continue;

    if (isManagedAinotateCommand(hook.command)) {
      hook.command = command;
      hook.timeout = 345600;
      updated = true;
    } else if (hook.command.includes("ainotate")) {
      foundCustomAinotateHook = true;
    }
  }
}
if (!updated && !foundCustomAinotateHook) {
  stopHooks.push({
    hooks: [
      {
        type: "command",
        command,
        timeout: 345600,
      },
    ],
  });
}
config.hooks.Stop = stopHooks;
if (updated || !foundCustomAinotateHook) {
  fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2) + "\n");
}
process.stdout.write(updated ? "updated" : foundCustomAinotateHook ? "custom" : "added");
NODE
        ); then
            case "$codex_merge_result" in
                custom)
                    echo "Existing custom Codex Ainotate hook found at ${CODEX_HOOKS}; left it unchanged."
                    ;;
                added)
                    echo "Added Codex hooks at ${CODEX_HOOKS}"
                    ;;
                *)
                    echo "Updated Codex hooks at ${CODEX_HOOKS}"
                    ;;
            esac
            codex_hook_configured=1
        else
            echo ""
            echo "Codex hooks file already exists at ${CODEX_HOOKS}, but it could not be merged automatically."
            echo "Leaving Codex hook support unchanged. Add or update this Stop hook manually:"
            echo ""
            echo "  command: ${AINOTATE_BIN}"
            echo "  timeout: 345600"
        fi
    else
        echo ""
        echo "Codex hooks file already exists at ${CODEX_HOOKS}, but node was not found to merge it safely."
        echo "Leaving Codex hook support unchanged. Add or update this Stop hook manually:"
        echo ""
        echo "  command: ${AINOTATE_BIN}"
        echo "  timeout: 345600"
    fi

    if [ "$codex_hook_configured" -eq 1 ]; then
        enable_codex_hooks_config || true
    fi
fi

# Validate plugin hooks.json if plugin is already installed
PLUGIN_HOOKS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/marketplaces/ainotate/apps/hook/hooks/hooks.json"
if [ -f "$PLUGIN_HOOKS" ]; then
    cat > "$PLUGIN_HOOKS" << 'HOOKS_EOF'
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "ainotate",
            "timeout": 345600
          }
        ]
      }
    ]
  }
}
HOOKS_EOF
    echo "Updated plugin hooks at ${PLUGIN_HOOKS}"
fi

# Clear any cached OpenCode plugin to force fresh download on next run
rm -rf "$HOME/.cache/opencode/node_modules/@ainotate" "$HOME/.cache/opencode/packages/@ainotate" "$HOME/.bun/install/cache/@ainotate" 2>/dev/null || true

# Clear Pi jiti cache to force fresh download on next run
rm -rf /tmp/jiti 2>/dev/null || true

update_pi_extension_if_present() {
    if ! command -v pi &>/dev/null; then
        return 0
    fi

    echo "Updating Pi extension..."
    if pi install npm:@ainotate/pi-extension; then
        echo "Pi extension updated."
    else
        echo "Skipping Pi extension update (pi install failed)"
    fi
}

# --- Aggressive cleanup of skills/commands we no longer manage ---
# Echo each removal; ignore missing entries.

# NOTE: legacy Claude command cleanup happens AFTER the skill install below —
# a command file is only removed once its replacement skill is on disk, so a
# failed or skipped skill install never leaves users with neither.

# NOTE: Codex stale-skill cleanup happens AFTER the skill install below —
# the core skills are only removed from the Codex home once their replacement
# exists in ~/.agents/skills, so an old pinned tag never strips Codex users
# of working skills without a successor.
STALE_CODEX_SKILLS_DIR="$CODEX_DIR/skills"

# Old installers (pre core/extra split) ran `cp -r apps/skills/*` against a
# new-layout tag and could leave junk `core`/`extra` directory copies in the
# Claude skills scope. Never valid skill names — always safe to remove.
for junk in core extra; do
    if [ -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/$junk" ]; then
        rm -rf "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/$junk"
        echo "Removed stale layout directory ~/.claude/skills/$junk (left by an older installer)"
    fi
done

# The compound/setup-goal/visual-explainer skills were removed. Purge any
# previously-installed copies ONCE per machine — recorded in the migrations
# ledger under the Ainotate data dir — so upgrades clean them up.
CLAUDE_SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills"
AGENTS_SKILLS_DIR="$HOME/.agents/skills"
MIGRATIONS_DIR="$_config_dir/migrations"
EXTRAS_MIGRATION="$MIGRATIONS_DIR/2026-06-extras-default-install-removed"
if [ ! -f "$EXTRAS_MIGRATION" ]; then
    for scope in "$CLAUDE_SKILLS_DIR" "$AGENTS_SKILLS_DIR"; do
        for skill in ainotate-compound ainotate-setup-goal ainotate-visual-explainer; do
            if [ -d "$scope/$skill" ]; then
                rm -rf "$scope/$skill"
                echo "Removed obsolete Ainotate skill from ${scope}/$skill"
            fi
        done
    done
    mkdir -p "$MIGRATIONS_DIR"
    : > "$EXTRAS_MIGRATION"
fi

# --- Guided install (interactive terminals only) ---
# One question: make any skills callable by the model? Answer persists to
# $PREFS_FILE and is reused silently on re-runs. --reconfigure re-opens the
# wizard; --non-interactive forces silence; piped CI runs without a terminal
# never prompt. CLI flags win over everything.
PREFS_FILE="$_config_dir/install-prefs"
CORE_SKILL_NAMES="ainotate-review ainotate-annotate ainotate-last"

saved_invocable=""
if [ -f "$PREFS_FILE" ]; then
    saved_invocable=$(sed -n 's/^model_invocable=//p' "$PREFS_FILE" | head -1)
fi

# A wizard needs a real human at the keyboard. Piped installs (curl | bash)
# still have a terminal at /dev/tty even though stdin is the pipe; CI and
# scripts do not. Some automated contexts (docker run -t, devcontainer and
# provisioner shells) DO expose an openable /dev/tty with nobody behind it —
# opening /dev/tty succeeds, yet a read would block forever. The per-prompt
# timeout below (see PROMPT_TIMEOUT / ask_yes_no) handles that: a mis-detected
# terminal falls through to the safe non-interactive default
# (model-invocable=none) instead of wedging. We deliberately do NOT
# gate on $CI here — an exported CI var must not silently suppress an explicit
# --reconfigure or --model-invocable in an otherwise interactive shell.
can_prompt=0
if [ "$NON_INTERACTIVE" -eq 0 ] && { : < /dev/tty; } 2>/dev/null; then
    can_prompt=1
fi

# Bound every interactive read so an unattended-but-open /dev/tty auto-takes
# the default rather than hanging. Set AINOTATE_PROMPT_TIMEOUT=0 to wait
# indefinitely (restores the old unbounded behavior); non-numeric falls to 30.
PROMPT_TIMEOUT="${AINOTATE_PROMPT_TIMEOUT:-30}"
case "$PROMPT_TIMEOUT" in
    ''|*[!0-9]*) PROMPT_TIMEOUT=30 ;;
esac

run_wizard=0
if [ "$can_prompt" -eq 1 ]; then
    if [ "$RECONFIGURE" -eq 1 ] || [ ! -f "$PREFS_FILE" ]; then
        run_wizard=1
    fi
fi

# Ask a y/n question on the terminal. $1 prompt, $2 default (yes/no).
ask_yes_no() {
    local prompt="$1" default="$2" answer suffix rc
    suffix="[y/N]"
    [ "$default" = "yes" ] && suffix="[Y/n]"
    printf '%s %s ' "$prompt" "$suffix" > /dev/tty
    # Bounded read so an unattended-but-open /dev/tty (e.g. docker run -t with
    # no human) can't hang the install. Distinguish a human pressing Enter
    # (read succeeds with an empty answer -> use the prompt's $default) from a
    # timeout/EOF with nobody there (read fails -> use the SAFE "no", never the
    # default). Otherwise a prompt whose default is "yes" could
    # silently install software on an unattended terminal.
    # Keep the read in a tested context (`|| rc=$?`) so the read itself never
    # trips `set -e` (active at the top of this script), without relying on the
    # subtle rule that -e is suppressed inside a function called in a tested
    # context. ask_yes_no still returns non-zero on timeout/EOF to signal "no
    # human", so every caller consumes it with `|| wizard_timed_out=1`.
    rc=0
    if [ "$PROMPT_TIMEOUT" -gt 0 ]; then
        IFS= read -r -t "$PROMPT_TIMEOUT" answer < /dev/tty || rc=$?
    else
        IFS= read -r answer < /dev/tty || rc=$?
    fi
    if [ "$rc" -ne 0 ]; then
        printf '\n' > /dev/tty
        echo "no"
        return 1
    fi
    case "$answer" in
        y|Y|yes|YES|Yes) echo "yes" ;;
        n|N|no|NO|No)    echo "no" ;;
        *)               echo "$default" ;;
    esac
}

# Space-toggle checkbox over the skill names in $1 (space-separated), with
# the names in $2 (comma-separated) preselected. Echoes the chosen names as
# a comma list, or "none". Up/down (or j/k) moves, space toggles, enter
# confirms. All I/O goes to /dev/tty so piped stdout is unaffected.
select_skills_checkbox() {
    local names=($1) pre=",$2," idx=0 count key seq i mark cursor
    count=${#names[@]}
    local sel=()
    for ((i = 0; i < count; i++)); do
        case "$pre" in
            *",${names[$i]},"*) sel[i]=1 ;;
            *)                  sel[i]=0 ;;
        esac
    done
    printf 'Space toggles, enter confirms, up/down or j/k moves:\n' > /dev/tty
    while true; do
        for ((i = 0; i < count; i++)); do
            mark=" "; [ "${sel[$i]}" -eq 1 ] && mark="x"
            cursor="  "; [ "$i" -eq "$idx" ] && cursor="> "
            printf '%s[%s] %s\033[K\n' "$cursor" "$mark" "${names[$i]}" > /dev/tty
        done
        IFS= read -rsn1 key < /dev/tty || key=""
        if [ -z "$key" ]; then
            break # enter
        fi
        case "$key" in
            " ") sel[idx]=$((1 - sel[idx])) ;;
            j)   [ "$idx" -lt $((count - 1)) ] && idx=$((idx + 1)) ;;
            k)   [ "$idx" -gt 0 ] && idx=$((idx - 1)) ;;
            $'\x1b')
                seq=""
                IFS= read -rsn2 -t 1 seq < /dev/tty || seq=""
                case "$seq" in
                    '[A') [ "$idx" -gt 0 ] && idx=$((idx - 1)) ;;
                    '[B') [ "$idx" -lt $((count - 1)) ] && idx=$((idx + 1)) ;;
                esac
                ;;
        esac
        printf '\033[%dA' "$count" > /dev/tty
    done
    local out=""
    for ((i = 0; i < count; i++)); do
        if [ "${sel[$i]}" -eq 1 ]; then
            [ -n "$out" ] && out="$out,"
            out="$out${names[$i]}"
        fi
    done
    echo "${out:-none}"
}

invocable_choice=""
# Set if any wizard prompt times out / hits EOF (no human answered). A run whose
# answers are synthetic timeout fallbacks must not be persisted as install-prefs.
wizard_timed_out=0

if [ "$run_wizard" -eq 1 ]; then
    {
        echo ""
        echo "=========================================="
        echo "  AINOTATE GUIDED INSTALL"
        echo "=========================================="
        echo ""
    } > /dev/tty
    invocable_list="$CORE_SKILL_NAMES"
    if [ -n "$MODEL_INVOCABLE_FLAG" ]; then
        # Flag already answered this question — don't ask and then ignore.
        invocable_choice="$MODEL_INVOCABLE_FLAG"
    else
        want_invocable=$(ask_yes_no "Make any skills callable by the model (instead of user-invoked only)?" "no") || wizard_timed_out=1
        if [ "$want_invocable" = "yes" ]; then
            invocable_choice=$(select_skills_checkbox "$invocable_list" "$saved_invocable")
        else
            invocable_choice="none"
        fi
    fi
fi

# Flags override the wizard and saved answers; otherwise saved, then defaults.
[ -n "$MODEL_INVOCABLE_FLAG" ] && invocable_choice="$MODEL_INVOCABLE_FLAG"
[ -z "$invocable_choice" ] && invocable_choice="${saved_invocable:-none}"

# Persist only when the wizard ran with real answers, or a flag set something.
# Silent re-runs must not clobber saved answers with defaults, and a wizard that
# timed out to synthetic fallbacks (unattended /dev/tty) must not become sticky
# prefs that suppress the wizard on a later genuine interactive install.
if [ "$wizard_timed_out" -eq 0 ] && { [ "$run_wizard" -eq 1 ] || [ -n "$MODEL_INVOCABLE_FLAG" ]; }; then
    mkdir -p "$_config_dir"
    {
        echo "model_invocable=$invocable_choice"
    } > "$PREFS_FILE"
fi

# Install skills and slash commands from a sparse checkout (requires git).
# Hard requirement: without git we cannot install the /ainotate-* skills,
# so fail loudly instead of leaving a partial install. Hook/config writing
# above has already run by this point; the Pi update and Gemini config below
# are skipped on failure and complete when the user re-runs the installer.
if ! command -v git &>/dev/null; then
    echo "Error: git is required to install Ainotate's skills and slash commands." >&2
    echo "Install git, then run this installer again." >&2
    exit 1
fi

KIRO_SKILLS_DIR="$HOME/.kiro/skills"
OPENCODE_COMMANDS_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/commands"
GEMINI_COMMANDS_DIR="$HOME/.gemini/commands"
skills_tmp=$(mktemp -d)

copy_skill_if_present() {
    local source_dir="$1"
    local target_dir="$2"

    if [ -d "$source_dir" ]; then
        # Remove any existing copy first so re-runs replace rather than
        # nest (cp -r dir dest/dir would otherwise create dest/dir/dir).
        rm -rf "$target_dir/$(basename "$source_dir")"
        cp -r "$source_dir" "$target_dir/"
    fi
}

# Copy every command file in a directory if the source dir exists.
# Used for OpenCode (.md stubs) and Gemini (.toml) commands, both of
# which are checked out from the repo rather than generated by heredocs.
copy_commands_if_present() {
    local source_dir="$1"
    local target_dir="$2"

    if [ -d "$source_dir" ] && [ -n "$(ls -A "$source_dir" 2>/dev/null)" ]; then
        mkdir -p "$target_dir"
        cp "$source_dir"/* "$target_dir/"
    fi
}

# Wrap the cd-bearing block in a subshell so any `cd` is scoped to
# the subshell and can't leave the parent script with a dangling CWD.
# Previous version chained `cd` inside an `&&` condition, and if
# sparse-checkout failed the else branch ran without restoring the
# directory — then `rm -rf "$skills_tmp"` below executed while the
# shell's CWD was still inside the directory being deleted. No
# production failure (subsequent code uses absolute paths) but
# structurally incorrect. install.ps1 and install.cmd use
# Push-Location/pushd for the same logic; a subshell is bash's
# equivalent — the parent shell's CWD is inherited in, and any
# cd inside the subshell disappears when the subshell exits.
checkout_failed=0
(
    set -e
    cd "$skills_tmp"
    git clone --depth 1 --filter=blob:none --sparse \
        "https://github.com/${REPO}.git" --branch "$latest_tag" repo 2>/dev/null
    cd repo
    git sparse-checkout set apps/skills apps/kiro-cli apps/opencode-plugin/commands apps/gemini/commands bin/ainotate-review 2>/dev/null

    # Session-aware launcher for one persistent browser tab per coding-agent
    # session. The helper is Unix/WSL-only; PowerShell/cmd keep using the main
    # binary directly.
    if [ -f "bin/ainotate-review" ]; then
        cp "bin/ainotate-review" "$INSTALL_DIR/ainotate-review"
        chmod +x "$INSTALL_DIR/ainotate-review"
        echo "Installed review-session helper to ${INSTALL_DIR}/ainotate-review"
    else
        echo "Tag ${latest_tag} predates the review-session helper — skipping helper install"
    fi

    # Core skills -> Claude Code (also serve as /ainotate-* slash commands)
    # and the official OpenAI shared-agent path. SOFT guard: a tag pinned
    # via --version may predate the core/extra layout — skip core skills
    # but keep installing the command files below (matches install.ps1 and
    # install.cmd, which guard each block independently).
    # Claude Code and Codex consume different skill bodies. Claude Code reads
    # the apps/skills/claude/* copies, which use dynamic-context injection
    # (`!`ainotate … $ARGUMENTS``) + allowed-tools so /ainotate-* run the
    # binary directly with no permission prompt — matching the old slash
    # commands. Codex (the OpenAI shared-agent path) reads apps/skills/core/*,
    # whose prose bodies the model follows via its own shell; the `!`…``
    # injection is a Claude-Code-only extension, so the two are sourced
    # separately rather than sharing one body.
    if [ -d "apps/skills/claude" ] && [ -n "$(ls -A apps/skills/claude 2>/dev/null)" ]; then
        mkdir -p "$CLAUDE_SKILLS_DIR"
        copy_skill_if_present apps/skills/claude/ainotate-review "$CLAUDE_SKILLS_DIR"
        copy_skill_if_present apps/skills/claude/ainotate-annotate "$CLAUDE_SKILLS_DIR"
        copy_skill_if_present apps/skills/claude/ainotate-last "$CLAUDE_SKILLS_DIR"
        echo "Installed Claude Code skills to ${CLAUDE_SKILLS_DIR}/"
    else
        echo "Tag ${latest_tag} predates the per-agent skill layout — skipping Claude Code skill install"
    fi
    if [ -d "apps/skills/core" ] && [ -n "$(ls -A apps/skills/core 2>/dev/null)" ]; then
        mkdir -p "$AGENTS_SKILLS_DIR"
        copy_skill_if_present apps/skills/core/ainotate-review "$AGENTS_SKILLS_DIR"
        copy_skill_if_present apps/skills/core/ainotate-annotate "$AGENTS_SKILLS_DIR"
        copy_skill_if_present apps/skills/core/ainotate-last "$AGENTS_SKILLS_DIR"
        echo "Installed shared agent skills to ${AGENTS_SKILLS_DIR}/"
    else
        echo "Tag ${latest_tag} predates the core/extra skill layout — skipping shared agent skill install"
    fi

    # OpenCode slash command stubs (the plugin intercepts execution) —
    # always installed when the checkout provides them. Guard the echo on
    # the same condition as the copy so old pinned tags don't report a
    # success that never happened (ps1/cmd already gate this way).
    if [ -d "apps/opencode-plugin/commands" ] && [ -n "$(ls -A apps/opencode-plugin/commands 2>/dev/null)" ]; then
        copy_commands_if_present apps/opencode-plugin/commands "$OPENCODE_COMMANDS_DIR"
        echo "Installed OpenCode commands to ${OPENCODE_COMMANDS_DIR}/"
    fi

    # Gemini native TOML commands — only when Gemini is present.
    if [ -d "$HOME/.gemini" ] && [ -d "apps/gemini/commands" ] && [ -n "$(ls -A apps/gemini/commands 2>/dev/null)" ]; then
        copy_commands_if_present apps/gemini/commands "$GEMINI_COMMANDS_DIR"
        echo "Installed Gemini commands to ${GEMINI_COMMANDS_DIR}/"
    fi

    if [ "$kiro_available" -eq 1 ] && [ -d "apps/kiro-cli/skills" ] && [ -n "$(ls -A apps/kiro-cli/skills 2>/dev/null)" ]; then
        mkdir -p "$KIRO_SKILLS_DIR"
        # Kiro-specific skills (origin baked in) come from apps/kiro-cli/skills.
        copy_skill_if_present apps/kiro-cli/skills/ainotate-review "$KIRO_SKILLS_DIR"
        copy_skill_if_present apps/kiro-cli/skills/ainotate-annotate "$KIRO_SKILLS_DIR"
        # Ainotate custom agent — don't clobber a user's existing one.
        if [ ! -f "$HOME/.kiro/agents/ainotate.json" ] && [ -f "apps/kiro-cli/agents/ainotate.json" ]; then
            mkdir -p "$HOME/.kiro/agents"
            cp apps/kiro-cli/agents/ainotate.json "$HOME/.kiro/agents/ainotate.json"
        fi
        echo "Installed Kiro skills to ${KIRO_SKILLS_DIR}/ and agent to ~/.kiro/agents/ainotate.json"
    fi
) || checkout_failed=1

rm -rf "$skills_tmp"

if [ "${checkout_failed:-0}" -eq 1 ]; then
    echo "Error: unable to fetch ${REPO} at ${latest_tag} (network or git error)." >&2
    echo "Something went wrong — run the installer again." >&2
    exit 1
fi

# Claude Code commands are deprecated in favor of skills. Remove a legacy
# command file only once its replacement skill is actually on disk — running
# AFTER the install above guarantees a failed or skipped skill install never
# leaves users with neither the command nor the skill.
CLAUDE_COMMANDS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/commands"
for cmd in ainotate-review ainotate-annotate ainotate-last; do
    if [ -d "$CLAUDE_SKILLS_DIR/$cmd" ] && [ -f "$CLAUDE_COMMANDS_DIR/$cmd.md" ]; then
        rm -f "$CLAUDE_COMMANDS_DIR/$cmd.md"
        echo "Removed legacy Claude command ${CLAUDE_COMMANDS_DIR}/$cmd.md (replaced by the $cmd skill)"
    fi
done

# ainotate-archive no longer ships as a skill. Remove any stale installed
# copy from every skill scope so upgraders don't keep a dead skill around.
for scope in "$CLAUDE_SKILLS_DIR" "$AGENTS_SKILLS_DIR" "$KIRO_SKILLS_DIR"; do
    if [ -d "$scope/ainotate-archive" ]; then
        rm -rf "$scope/ainotate-archive"
        echo "Removed stale ainotate-archive skill from ${scope}/ainotate-archive"
    fi
done
# The /ainotate-archive OpenCode command was removed too — sweep the stub
# (only npm-plugin-postinstall users ever had it written here).
if [ -f "$OPENCODE_COMMANDS_DIR/ainotate-archive.md" ]; then
    rm -f "$OPENCODE_COMMANDS_DIR/ainotate-archive.md"
    echo "Removed stale ainotate-archive command from ${OPENCODE_COMMANDS_DIR}/"
fi

# Codex no longer hosts core skills (they now live in ~/.agents/skills).
# Core skills are removed only once their replacement exists.
for skill in ainotate-review ainotate-annotate ainotate-last; do
    if [ -d "$STALE_CODEX_SKILLS_DIR/$skill" ]; then
        case "$skill" in
            ainotate-review|ainotate-annotate|ainotate-last)
                [ -d "$AGENTS_SKILLS_DIR/$skill" ] || continue
                ;;
        esac
        rm -rf "$STALE_CODEX_SKILLS_DIR/$skill"
        echo "Removed Ainotate skill from ${STALE_CODEX_SKILLS_DIR}/$skill"
    fi
done

# Apply the saved model-invocation choices. Installed skill copies always
# arrive locked (disable-model-invocation: true in SKILL.md); for each chosen
# skill we unlock the INSTALLED copy by removing that line, and flip the Codex
# sidecar's allow_implicit_invocation to match. Re-applied on every run
# because installs replace the skill folders wholesale. Source files in the
# repo never change.
if [ -n "$invocable_choice" ] && [ "$invocable_choice" != "none" ]; then
    for skill in $(echo "$invocable_choice" | tr ',' ' '); do
        for scope in "$CLAUDE_SKILLS_DIR" "$AGENTS_SKILLS_DIR"; do
            skill_md="$scope/$skill/SKILL.md"
            if [ -f "$skill_md" ] && grep -q '^disable-model-invocation: true$' "$skill_md"; then
                grep -v '^disable-model-invocation: true$' "$skill_md" > "$skill_md.tmp" && mv "$skill_md.tmp" "$skill_md"
                echo "Enabled model invocation: ${scope}/${skill}"
            fi
            sidecar="$scope/$skill/agents/openai.yaml"
            if [ -f "$sidecar" ] && grep -q 'allow_implicit_invocation: false' "$sidecar"; then
                sed 's/allow_implicit_invocation: false/allow_implicit_invocation: true/' "$sidecar" > "$sidecar.tmp" && mv "$sidecar.tmp" "$sidecar"
            fi
        done
    done
fi

# Update Pi extension if pi is installed. The pi-extension no longer bundles
# skills; Pi keeps its extension commands and the ainotate_submit_plan tool.
update_pi_extension_if_present

# --- Gemini CLI support (only if Gemini is installed) ---
if [ -d "$HOME/.gemini" ]; then
    # Install policy file
    GEMINI_POLICIES_DIR="$HOME/.gemini/policies"
    mkdir -p "$GEMINI_POLICIES_DIR"
    cat > "$GEMINI_POLICIES_DIR/ainotate.toml" << 'GEMINI_POLICY_EOF'
# Ainotate policy for Gemini CLI
# Allows exit_plan_mode without TUI confirmation so the browser UI is the sole gate.
[[rule]]
toolName = "exit_plan_mode"
decision = "allow"
priority = 100
GEMINI_POLICY_EOF
    echo "Installed Gemini policy to ${GEMINI_POLICIES_DIR}/ainotate.toml"

    # Configure hook in settings.json
    GEMINI_SETTINGS="$HOME/.gemini/settings.json"
    AINOTATE_HOOK='{"matcher":"exit_plan_mode","hooks":[{"type":"command","command":"ainotate","timeout":345600}]}'

    if [ -f "$GEMINI_SETTINGS" ]; then
        if ! grep -q '"ainotate"' "$GEMINI_SETTINGS" 2>/dev/null; then
            # Merge hook into existing settings.json using node (ships with Gemini CLI)
            if command -v node &>/dev/null; then
                node -e "
                  const fs = require('fs');
                  const settings = JSON.parse(fs.readFileSync('$GEMINI_SETTINGS', 'utf8'));
                  if (!settings.hooks) settings.hooks = {};
                  if (!settings.hooks.BeforeTool) settings.hooks.BeforeTool = [];
                  settings.hooks.BeforeTool.push($AINOTATE_HOOK);
                  fs.writeFileSync('$GEMINI_SETTINGS', JSON.stringify(settings, null, 2) + '\n');
                "
                echo "Added ainotate hook to ${GEMINI_SETTINGS}"
            else
                echo ""
                echo "Add the following to your ~/.gemini/settings.json hooks:"
                echo ""
                echo '  "hooks": {'
                echo '    "BeforeTool": [{'
                echo '      "matcher": "exit_plan_mode",'
                echo '      "hooks": [{"type": "command", "command": "ainotate", "timeout": 345600}]'
                echo '    }]'
                echo '  }'
            fi
        fi
    else
        cat > "$GEMINI_SETTINGS" << 'GEMINI_SETTINGS_EOF'
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "exit_plan_mode",
        "hooks": [
          {
            "type": "command",
            "command": "ainotate",
            "timeout": 345600
          }
        ]
      }
    ]
  },
  "experimental": {
    "plan": true
  }
}
GEMINI_SETTINGS_EOF
        echo "Created Gemini settings at ${GEMINI_SETTINGS}"
    fi

    # Gemini slash commands (.toml) are installed from the sparse checkout in
    # the skills/commands install block above (apps/gemini/commands).
fi

# OpenCode plugin — install a SELF-CONTAINED copy under the OpenCode config dir
# that has no runtime dependency on any source checkout. Only possible when this
# installer runs from a source tree (local/fork builds); release/curl installs
# lack the plugin's built artifacts (dist/*.js + *.html are gitignored) and fall
# back to the npm-published plugin instructions below. Unix/WSL only.
opencode_plugin_standalone=0
install_opencode_plugin_standalone() {
    local src="${BASH_SOURCE[0]:-}"
    [ -n "$src" ] && [ -f "$src" ] || return 1                 # not a real script path (curl|bash)
    local repo; repo="$(cd "$(dirname "$src")/.." 2>/dev/null && pwd)" || return 1
    local plug="$repo/apps/opencode-plugin"
    [ -d "$plug" ] || return 1                                 # not a source checkout
    # Only bother when OpenCode is actually present.
    command -v opencode >/dev/null 2>&1 || [ -d "${XDG_CONFIG_HOME:-$HOME/.config}/opencode" ] || return 1
    # Build the plugin if bun is available (emits dist/{index,embedded}.js + *.html).
    if command -v bun >/dev/null 2>&1; then
        ( cd "$repo" && bun run build:opencode >/dev/null 2>&1 ) || true
    fi
    [ -f "$plug/dist/index.js" ] && [ -f "$plug/dist/embedded.js" ] \
        && [ -f "$plug/ainotate.html" ] && [ -f "$plug/review-editor.html" ] || return 1
    local ocroot="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
    local dest="$ocroot/ainotate"
    mkdir -p "$dest/dist" "$ocroot/plugin"
    cp "$plug/dist/index.js" "$plug/dist/embedded.js" "$dest/dist/"
    cp "$plug/ainotate.html" "$plug/review-editor.html" "$dest/"
    # index.js loads embedded.js from its own dir and the HTML from the parent;
    # the symlink's realpath resolves into $dest, so nothing points at the repo.
    ln -sfn "$dest/dist/index.js" "$ocroot/plugin/ainotate.js"
    rm -f "$ocroot/plugin/plannotator.js"                      # sweep pre-rebrand symlink
    echo "Installed self-contained OpenCode plugin to ${dest}/ (symlinked from ${ocroot}/plugin/ainotate.js)"
    return 0
}
if install_opencode_plugin_standalone; then opencode_plugin_standalone=1; fi

echo ""
echo "=========================================="
echo "  OPENCODE USERS"
echo "=========================================="
echo ""
if [ "$opencode_plugin_standalone" -eq 1 ]; then
    echo "The self-contained plugin is installed (no source-checkout dependency)."
    echo "Restart OpenCode. The /ainotate-review, /ainotate-annotate, and /ainotate-last commands are ready!"
else
    echo "Add the plugin to your opencode.json:"
    echo ""
    echo '  "plugin": ["@ainotate/opencode@latest"]'
    echo ""
    echo "Then restart OpenCode. The /ainotate-review, /ainotate-annotate, and /ainotate-last commands are ready!"
fi
echo ""
echo "=========================================="
echo "  PI USERS"
echo "=========================================="
echo ""
echo "Install or update the extension:"
echo ""
echo "  pi install npm:@ainotate/pi-extension"
echo ""
echo "=========================================="
echo "  GEMINI CLI USERS"
echo "=========================================="
echo ""
echo "Enable plan mode in Gemini settings, then run:"
echo ""
echo "  gemini"
echo "  /plan"
echo ""
echo "Plans will open in your browser for review."
echo "If settings.json was not auto-configured, see:"
echo "  ~/.gemini/settings.json (add BeforeTool hook)"
echo ""
echo "=========================================="
echo "  CODEX USERS"
echo "=========================================="
echo ""
if [ "$codex_available" -eq 1 ]; then
    echo "Restart Codex Desktop or CLI after installing."
    echo "Plan review is configured through the Codex Stop hook."
    echo ""
    echo "Core skills are installed to ~/.agents/skills/:"
    echo "  \$ainotate-review"
    echo "  \$ainotate-annotate <file|url|folder>"
    echo "  \$ainotate-last"
else
    echo "Codex was not detected. After installing Codex, rerun this installer to add"
    echo "the Stop hook."
fi
echo ""
echo "=========================================="
echo "  KIRO CLI USERS"
echo "=========================================="
echo ""
if [ "$kiro_available" -eq 1 ]; then
    echo "Kiro skills are installed to ~/.kiro/skills/"
    echo "The Ainotate agent is installed to ~/.kiro/agents/ainotate.json"
    echo "Launch it: kiro-cli chat --agent ainotate"
else
    echo "Kiro was not detected. After installing Kiro, rerun this installer to add Kiro skills."
fi
echo ""
echo "=========================================="
echo "  CLAUDE CODE USERS: YOU'RE ALL SET!"
echo "=========================================="
echo ""
echo "Install the Claude Code plugin:"
echo "  /plugin marketplace add yfang00/ainotate"
echo "  /plugin install ainotate@ainotate"
echo ""
echo "Upgrading from an older version? Also run /plugin marketplace update"
echo "so the plugin drops its old ainotate:* command entries."
echo ""
echo "The /ainotate-review, /ainotate-annotate, and /ainotate-last commands are ready to use after you restart Claude Code!"

# Warn if ainotate is configured in both settings.json hooks AND the plugin (causes double execution)
# Only warn when the plugin is installed — manual-only users won't have overlap
CLAUDE_SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
if [ -f "$PLUGIN_HOOKS" ] && [ -f "$CLAUDE_SETTINGS" ] && grep -q '"command".*ainotate' "$CLAUDE_SETTINGS" 2>/dev/null; then
    echo ""
    echo "⚠️ ⚠️ ⚠️  WARNING: DUPLICATE HOOK DETECTED  ⚠️ ⚠️ ⚠️"
    echo ""
    echo "  ainotate was found in your settings.json hooks:"
    echo "  $CLAUDE_SETTINGS"
    echo ""
    echo "  This will cause ainotate to run TWICE on each plan review."
    echo "  Remove the ainotate hook from settings.json and rely on the"
    echo "  plugin instead (installed automatically via marketplace)."
    echo ""
    echo "⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️"
fi
