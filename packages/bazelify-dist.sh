# Exposes a package's Bazel-built output to editors and other non-Bazel tooling by
# symlinking `./dist` at the matching `bazel-bin` path. pnpm's own workspace symlink
# (`<consumer>/node_modules/<package>` -> the package source directory) then resolves
# the `exports` map, which points exclusively into `dist`.
#
# A stale symlink here only costs unresolved imports until the next build; nothing
# else, `pnpm install` included, depends on it.
TARGET="${1:-:dist}"

PACKAGE="$(git rev-parse --show-prefix)"
PACKAGE="${PACKAGE%/}"
BAZEL_BIN="$(bazel --quiet info bazel-bin)"

echo "Building //$PACKAGE$TARGET"
bazel --quiet build --show_result=0 "$TARGET"

echo "Deleting ./dist"
rm -rf ./dist

echo "Linking"
ln --symbolic --no-dereference "$BAZEL_BIN/$PACKAGE/dist" ./dist
