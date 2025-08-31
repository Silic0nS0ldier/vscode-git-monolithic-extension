#!/usr/bin/env bash

set -euo pipefail

# runc persists container state under `$XDG_RUNTIME_DIR/runc` or `/run/runc` (euid=0,USER=root,not running in user namespace)
# to avoid conflicts (leftover state) we require XDG paths to be used
# this means detecting euid=0 and USER=root
# TODO for completeness also detect if running in user namespace
if [[ $EUID -eq 0 || $USER == "root" ]]; then
  echo "Detected root user, cannot override runc persistent state location, not safe to continue as;"
  echo " - Container IDs may collide"
  echo " - May interfere with other container runtimes (e.g. docker, podman)"
  exit 1
fi

# create temporary working directory for image tarball, container and runc state
runc_instance_dir=$(mktemp -d)
image_tar_path="$runc_instance_dir/image.tar"
ctr_dir="$runc_instance_dir/ctr"
mkdir "$ctr_dir"
xdg_runtime_dir_override="$runc_instance_dir/xdg"
mkdir "$xdg_runtime_dir_override"

# TODO export OCI image to rootfs
image_loader=$(rlocation "_main/integration_tests/openvscode_server.sh")
echo "Writing Docker/OCI image tarball to $image_tar_path..."
ROOTFS_FACTORY_OUT="$image_tar_path" $image_loader

runc_path=$(rlocation "_main/integration_tests/runc.exe")
undocker_path=$(rlocation "undocker/undocker_/undocker")

echo "Using $ctr_dir for container instance"
cd "$ctr_dir"

# create a minimal config.json
echo "Creating configuration..."
$runc_path spec --rootless

# update with image configuration
manifest_json=$(tar -x --to-stdout -f "$image_tar_path" manifest.json)
# TODO bring jq in via Bazel
image_config_path=$(echo "$manifest_json" | jq -r '.[0].Config')
image_config_json=$(tar -x --to-stdout -f "$image_tar_path" "$image_config_path")
# `config.User` -> process.user, `config.ExposedPorts` -> ??, `config.Env` -> process.env, `config.Entrypoint` -> process.args, `config.Cmd` -> ++process.args, `config.WorkingDir` -> process.cwd
# IMPORTANT container config must be read in a separate call to avoid races that may produce an empty file
ctr_config=$(cat "$ctr_dir/config.json")
args_as_json=$(jq -c -n '$ARGS.positional' --args -- "$@")
echo "$ctr_config" | jq --argjson u "$image_config_json" --argjson a "$args_as_json" '
    .root.readonly = false |
    .process.env = $u.config.Env |
    .process.args = $u.config.Entrypoint + ($u.config.Cmd // []) + $a |
    .process.cwd = $u.config.WorkingDir
' > "$ctr_dir/config.json"

# create rootfs directory
echo "Creating rootfs..."
mkdir rootfs

# extract to rootfs
# TODO Avoid the need for a temporary file, it hurts performance
echo "Extracting docker compliant tarball..."
$undocker_path $image_tar_path - | tar -C rootfs -xf -

echo "Removing tarball..."
rm "$image_tar_path"

cleanup() {
  echo "Cleaning up..."
  rm -rf "$runc_instance_dir"
}

trap cleanup EXIT

echo "Running container..."
XDG_RUNTIME_DIR="$xdg_runtime_dir_override" $runc_path run stub_container_id
