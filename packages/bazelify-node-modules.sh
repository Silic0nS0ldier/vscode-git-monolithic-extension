REPO_ROOT="$(git rev-parse --show-toplevel)"
PACKAGE="$(git rev-parse --show-prefix)"
PACKAGE="${PACKAGE%/}"
BAZEL_BIN="$(bazel --quiet info bazel-bin)"

echo "Building //$PACKAGE:node_modules"
bazel --quiet build --show_result=0 :node_modules

echo "Deleting ./node_modules"
rm -rf ./node_modules

echo "Linking"
ln --symbolic --no-dereference "$BAZEL_BIN/$PACKAGE/node_modules" ./node_modules
