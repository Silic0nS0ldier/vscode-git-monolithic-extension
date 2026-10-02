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

# Packages are unpacked rather than installed, so nothing set these up but the layers themselves.
[[ -u /usr/bin/fusermount3 ]] || fail "/usr/bin/fusermount3 is missing or not setuid"
grep -qE '^\s*user_allow_other\s*$' /etc/fuse.conf || fail "/etc/fuse.conf does not set user_allow_other"

libdir="/usr/lib/$(uname -m)-linux-gnu"
for lib in libasound.so.2 libatk-1.0.so.0 libatk-bridge-2.0.so.0 libatspi.so.0 libcairo.so.2 \
  libcups.so.2 libdbus-1.so.3 libgbm.so.1 libglib-2.0.so.0 libgtk-3.so.0 libnss3.so \
  libpango-1.0.so.0 libXcomposite.so.1 libXdamage.so.1 libXfixes.so.3 libxkbcommon.so.0 \
  libXrandr.so.2; do
  if ! deps="$(ldd "${libdir}/${lib}" 2>&1)"; then
    fail "${lib} failed to load: ${deps}"
  elif grep -q 'not found' <<< "${deps}"; then
    fail "${lib} has unresolved dependencies: $(grep 'not found' <<< "${deps}")"
  fi
done

# The apt layer overwrites files of base image packages it also resolves, so their versions must
# agree. dpkg's database still describes the base image, as the layer does not touch it.
arch="$(dpkg --print-architecture)"
while read -r pkg_arch name version; do
  [[ "${pkg_arch}" == "${arch}" ]] || continue
  read -r status installed < <(dpkg-query -W -f '${db:Status-Status} ${Version}\n' "${name}" 2> /dev/null)
  [[ "${status}" == "installed" ]] || continue
  [[ "${installed}" == "${version}" ]] \
    || fail "${name} ${version} from the apt snapshot overlays ${installed} from the base image (run update_devcontainer_apt_snapshot.mjs)"
done < /apt_versions.txt

exit "$((failures > 0))"
