#!/usr/bin/env bash
# shellcheck shell=bash
# Runs image_checks.sh inside the devcontainer image. See BUILD.bazel.
set -euo pipefail

runfiles="${RUNFILES_DIR:-${TEST_SRCDIR:-$0.runfiles}}"

# One container start covers every check, since starting one is expensive.
exec "${runfiles}/${CONTAINER}" \
  --mount "${runfiles}/${CHECKS}:/image_checks.sh:ro" \
  -- /bin/bash /image_checks.sh
