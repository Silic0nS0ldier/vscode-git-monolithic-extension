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

# update with image configuration
manifest_json=$(tar -x --to-stdout -f "$tar_file" manifest.json)
# TODO bring jq in via Bazel
config_path=$(echo "$manifest_json" | jq -r '.[0].Config')
config_json=$(tar -x --to-stdout -f "$tar_file" "$config_path")
# `config.User` -> process.user, `config.ExposedPorts` -> ??, `config.Env` -> process.env, `config.Entrypoint` -> process.args, `config.Cmd` -> ++process.args, `config.WorkingDir` -> process.cwd
cat "$runc_root/config.json" | jq --argjson u "$config_json" '
    .root.readonly = false |
    .process.env = $u.config.Env |
    .process.args = $u.config.Entrypoint + ($u.config.Cmd // []) |
    .process.cwd = $u.config.WorkingDir
' > "$runc_root/config.json"

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
