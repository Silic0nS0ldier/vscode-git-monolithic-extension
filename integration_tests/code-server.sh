#!/usr/bin/env bash
# shellcheck shell=bash
# Unpacks a prepared code-server state directory (see build-code-server-state.sh), then serves it.
# Run as an `itest_service`; see BUILD.bazel.
set -euo pipefail

code_server="$(realpath "$1")"
archive="$(realpath "$2")"
port="$3"
trust="$4"

# The VS Code integrated terminal exports these. code-server's CLI treats them as a
# request to open in the *developer's* editor and exits instead of serving.
unset VSCODE_IPC_HOOK_CLI VSCODE_PID VSCODE_GIT_IPC_HANDLE

state="${TEST_TMPDIR:-/tmp}/code-server"
rm -rf "$state"
mkdir -p "$state"
tar --extract --file "$archive" --directory "$state"

# `--disable-workspace-trust` forces the folder to be trusted. An untrusted suite drops the
# flag, and its state silences the prompt instead.
trust_args=(--disable-workspace-trust)
if [[ "$trust" == "untrusted" ]]; then
    trust_args=()
fi

# `bazel coverage` sets `COVERAGE_DIR`: the extension host inherits `NODE_V8_COVERAGE`
# (the server strips `NODE_OPTIONS`, but not this) and writes V8 coverage on exit.
# The harness maps it back to the sources for Bazel's lcov merger.
if [[ -n "${COVERAGE_DIR:-}" ]]; then
    export NODE_V8_COVERAGE="${TEST_TMPDIR:-/tmp}/v8-coverage"
fi

export HOME="$state"

# Without a serviceUrl the workbench skips the gallery entirely; otherwise it spends a
# second or so querying open-vsx.org for extensions it will never install.
export EXTENSIONS_GALLERY='{}'

common=(
    --config "$state/config.yaml"
    --user-data-dir "$state/user"
    --extensions-dir "$state/extensions"
    --disable-telemetry
    --disable-update-check
)

exec "$code_server" "${common[@]}" \
    --auth none \
    --bind-addr "127.0.0.1:${port}" \
    "${trust_args[@]}"
