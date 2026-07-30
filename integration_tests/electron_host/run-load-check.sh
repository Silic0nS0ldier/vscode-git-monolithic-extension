#!/usr/bin/env bash
# shellcheck shell=bash
# Runs a JS runtime binary (Electron in ELECTRON_RUN_AS_NODE mode, or plain
# Node as a control) against load-check.mjs. See BUILD.bazel.
set -euo pipefail

runtime="$1"
shift
exec "$runtime" "$@"
