#!/usr/bin/env bash
# shellcheck shell=bash
# FUSE support for `runc_binary`, which serves an OCI image from the layer
# sidecars instead of extracting it.
#
# `user_allow_other` matters as much as the package. Without it `fusermount3`
# refuses `allow_other` from an unprivileged caller, so rules_oci_runtime cannot
# ask for an auto-unmounting mount and says as much ("Killing this process will
# leave the mount behind"). Bazel kills test processes outright on interrupt, so
# every aborted `bazel test //...` then leaves a mount standing under
# `execroot/_main/_tmp` for someone to `umount` by hand. With it, `fusermount3`
# outlives the launcher and takes the mount down whatever kills it.
#
# Nothing is given away: the mount point sits inside a bundle directory that is
# mode 0700, so no other user can reach it whatever the filesystem allows.
set -euo pipefail

sudo apt-get update
sudo apt-get install -y --no-install-recommends fuse3

if ! grep -qE '^\s*user_allow_other\s*$' /etc/fuse.conf; then
  echo 'user_allow_other' | sudo tee -a /etc/fuse.conf > /dev/null
fi
