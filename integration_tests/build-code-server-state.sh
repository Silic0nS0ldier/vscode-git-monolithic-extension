#!/usr/bin/env bash
# shellcheck shell=bash
# Builds code-server's entire state directory (`HOME`, user data and extensions) into a cached
# archive that `code-server.sh` extracts. The packaged extension is installed as a user would;
# `extensions.json` locates it relative to the extensions directory, so the archive relocates.
set -euo pipefail

code_server="$(realpath "$1")"
vsix="$(realpath "$2")"
trust="$3"
archive="$(realpath -m "$4")"
tar_bin="$(realpath "$5")"

state="$(mktemp -d)"
trap 'rm -rf "$state"' EXIT
mkdir -p "$state/user/User"

# An untrusted suite silences the trust prompt, so the workbench opens straight into
# Restricted Mode and the extension takes its reduced discovery path.
trust_settings=""
if [[ "$trust" == "untrusted" ]]; then
    trust_settings=',
    "security.workspace.trust.startupPrompt": "never",
    "security.workspace.trust.banner": "never"'
fi

# The extension under test is opt-in: it stays dormant while VS Code's builtin git
# extension is enabled, so without this the test would drive the builtin instead.
# Disabling AI features keeps the workbench from spawning an agent host process.
# The refresh delays, layout shift delay and watcher debounce guard large repositories, which no suite uses.
cat >"$state/user/User/settings.json" <<JSON
{
    "chat.disableAIFeatures": true,
    "git.enabled": false,
    "git_monolithic.autorefreshCooldown": 0,
    "git_monolithic.autorefreshDebounce": 0,
    "git_monolithic.enabled": true,
    "git_monolithic.layoutShiftDelay": 0,
    "git_monolithic.watcherDebounce": 0,
    "workbench.startupEditor": "none",
    "workbench.secondarySideBar.defaultVisibility": "hidden"${trust_settings}
}
JSON

# code-server reads (and creates) ~/.config/code-server/config.yaml unless pointed
# elsewhere. An empty file keeps the developer's own settings out of the test.
: >"$state/config.yaml"

export HOME="$state"
export EXTENSIONS_GALLERY='{}'
if ! code_server_output="$("$code_server" \
    --config "$state/config.yaml" \
    --user-data-dir "$state/user" \
    --extensions-dir "$state/extensions" \
    --install-extension "$vsix" 2>&1)"; then
    echo "$code_server_output"
    exit 1
fi
"$tar_bin" --create --file "$archive" --directory "$state" .
