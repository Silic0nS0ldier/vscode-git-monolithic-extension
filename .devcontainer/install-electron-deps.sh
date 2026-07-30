#!/usr/bin/env bash
# shellcheck shell=bash
# Libraries required by Electron in //integration_tests/electron_host:electron_host_smoke_test.
#
# These are not baked into the Bazel-built image because Ubuntu package versions
# cannot currently be pinned reproducibly (rules_distroless' Ubuntu snapshot
# support is disabled upstream, the snapshot URLs 404).
set -euo pipefail

sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  libasound2t64 \
  libatk1.0-0t64 \
  libatk-bridge2.0-0t64 \
  libatspi2.0-0t64 \
  libcairo2 \
  libcups2t64 \
  libdbus-1-3 \
  libgbm1 \
  libglib2.0-0t64 \
  libgtk-3-0t64 \
  libnss3 \
  libpango-1.0-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2
