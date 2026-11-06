#!/usr/bin/env bash
# shellcheck shell=bash
# Extracts the cached repository tree that the editor opens during an integration test suite.
# Run as an `itest_task`; see defs.bzl.
set -euo pipefail

git_bin="$(realpath "$1")"
archive="$(realpath "$2")"

# The test asserts against the same git build, and only this task can resolve its runfile.
printf '%s' "$git_bin" >"${TEST_TMPDIR:-/tmp}/git-bin"

tar --extract --file "$archive" --directory "${TEST_TMPDIR:-/tmp}"
