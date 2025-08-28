#!/usr/bin/env bash

set -euo pipefail

# arg 1 = command
# arg 2 = --import
# arg 3 = file descriptor path (e.g. /dev/fd/63)

tar_file=$(mktemp --suffix=.tar)
cat "${3:-}" > "$ROOTFS_FACTORY_OUT"
