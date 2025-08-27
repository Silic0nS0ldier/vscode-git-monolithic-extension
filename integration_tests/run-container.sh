#!/usr/bin/env bash

set -euo pipefail

runc_path=$(rlocation "_main/integration_tests/runc.exe")
echo "Using runc from $runc_path"

# create temporary directory for runc root
runc_root=$(mktemp -d)
echo "Using runc root at $runc_root"

# create rootfs directory
pushd "$runc_root"
mkdir rootfs

# create a minimal config.json
$runc_path spec --rootless
popd

# TODO export OCI image to rootfs
image_loader=$(rlocation "_main/integration_tests/openvscode_server.sh")
echo "Using image loader from $image_loader"
$image_loader
