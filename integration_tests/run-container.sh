#!/usr/bin/env bash

set -euo pipefail


# prepare temp file
tar_file=$(mktemp --suffix=.tar)

# TODO export OCI image to rootfs
image_loader=$(rlocation "_main/integration_tests/openvscode_server.sh")
echo "Creating docker compliant tarball..."
ROOTFS_FACTORY_OUT="$tar_file" $image_loader

runc_path=$(rlocation "_main/integration_tests/runc.exe")

# create temporary directory for runc root
runc_root=$(mktemp -d)
echo "Using $runc_root for container instance"
cd "$runc_root"

# create a minimal config.json
echo "Creating configuration..."
$runc_path spec --rootless

# create rootfs directory
echo "Creating rootfs..."
mkdir rootfs

undocker_path=$(rlocation "undocker/undocker_/undocker")

# pipe files to rootfs
# TODO Avoid the need for a temporary file, it hurts performance
echo "Extracting docker compliant tarball..."
$undocker_path $tar_file - | tar -C rootfs -xf -

echo "Removing tarball..."
rm "$tar_file"

# TODO each container needs a unique ID, need to generate on-demand
echo "Running container..."
$runc_path run foo

echo "Destroying container..."
rm -rf "$runc_root"
