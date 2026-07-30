#!/usr/bin/env bash
# shellcheck shell=bash
# Runs inside the devcontainer image, verifying it provides the toolchain the
# workspace expects. See BUILD.bazel.
set -uo pipefail

failures=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

# DotSlash stubs resolve and cache their payload on first run, which needs
# network access, so only the stub plumbing is checked here.
for tool in bazel buildifier buildozer dprint gh jscpd node pnpm rustup starpls unused-deps; do
  [[ -x "/usr/bin/${tool}" ]] || fail "/usr/bin/${tool} is missing or not executable"
  read -r shebang < "/usr/bin/${tool}"
  [[ "${shebang}" == "#!/usr/bin/env dotslash" ]] || fail "/usr/bin/${tool} is not a DotSlash stub"
done

for tool in cargo cargo-clippy cargo-fmt cargo-miri clippy-driver rust-analyzer rust-gdb rust-lldb rustc rustdoc rustfmt; do
  target="$(readlink "/usr/bin/${tool}")"
  [[ "${target}" == "rustup" ]] || fail "/usr/bin/${tool} links to '${target}', expected 'rustup'"
done

command -v dotslash > /dev/null || fail "dotslash is not on PATH"

# knip is bundled outright rather than fetched on demand, so it can be run.
knip --version > /dev/null || fail "knip failed to run"

exit "$((failures > 0))"
