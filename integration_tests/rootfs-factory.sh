#!/usr/bin/env bash

set -euo pipefail

# print args
echo "Args: $*"
echo "arg1: ${1:-}"
echo "arg2: ${2:-}"
echo "arg3: ${3:-}"

# arg 3 is a path like `/dev/fd/63` where container files are being written
# read with tar and extract to temporary location
tmpdir=$(mktemp -d)
tar -xf "${3:-}" -C "$tmpdir"
echo "$tmpdir"

# TODO Use https://git.jakstys.lt/motiejus/undocker/ to export to rootfs (handled docker layers)
# see also https://github.com/ForAllSecure/rootfs_builder
# https://github.com/diraneyya/docker2lxc
# https://github.com/mviereck/image2rootfs
# https://github.com/chantra/bpfcitools
