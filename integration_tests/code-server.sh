#!/usr/bin/env bash
# shellcheck shell=bash
# Installs the extension under test into a throwaway profile, then serves it.
# Run as an `itest_service`; see BUILD.bazel.
set -euo pipefail

code_server="$(realpath "$1")"
vsix="$(realpath "$2")"
port="$3"

# The VS Code integrated terminal exports these. code-server's CLI treats them as a
# request to open in the *developer's* editor and exits instead of serving.
unset VSCODE_IPC_HOOK_CLI VSCODE_PID VSCODE_GIT_IPC_HANDLE

state="${TEST_TMPDIR:-/tmp}/code-server"
rm -rf "$state"
mkdir -p "$state/user" "$state/extensions"

# code-server reads (and creates) ~/.config/code-server/config.yaml unless pointed
# elsewhere. An empty file keeps the developer's own settings out of the test.
: >"$state/config.yaml"
export HOME="$state"

common=(
    --config "$state/config.yaml"
    --user-data-dir "$state/user"
    --extensions-dir "$state/extensions"
    --disable-telemetry
    --disable-update-check
)

"$code_server" "${common[@]}" --install-extension "$vsix" --force

exec "$code_server" "${common[@]}" \
    --auth none \
    --bind-addr "127.0.0.1:${port}" \
    --disable-workspace-trust
