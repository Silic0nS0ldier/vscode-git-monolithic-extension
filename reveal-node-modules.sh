# Copies `node_modules` out from Bazel
echo "Building node_modules"
bazel build \
    //:node_modules \
    //packages/git:node_modules \
    //extension:node_modules \
    //build_defs/rollup_bundle:node_modules \
    //build_defs/vsce_package:node_modules

# Get bazel-bin of last build
# NOTE This can technically race with other processes, but is fine so long as target platform remains the same
bazel_bin=$(bazel info bazel-bin)

echo "Linking node_modules"
ln --symbolic --no-dereference --force $bazel_bin/node_modules ./node_modules
ln --symbolic --no-dereference --force $bazel_bin/packages/git/node_modules ./packages/git/node_modules
ln --symbolic --no-dereference --force $bazel_bin/extension/node_modules ./extension/node_modules
ln --symbolic --no-dereference --force $bazel_bin/build_defs/rollup_bundle/node_modules ./build_defs/rollup_bundle/node_modules
ln --symbolic --no-dereference --force $bazel_bin/build_defs/vsce_package/node_modules ./build_defs/vsce_package/node_modules
