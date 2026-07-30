#!/usr/bin/env bash
# shellcheck shell=bash

set -eax

echo "Running install..."

# Libraries required by Electron in //integration_tests/electron_host:electron_host_smoke_test
apt-get update
apt-get install -y --no-install-recommends \
    libasound2t64 \
    libatk1.0-0t64 \
    libatk-bridge2.0-0t64 \
    libatspi2.0-0t64 \
    libcairo2 \
    libcups2t64 \
    libdbus-1-3 \
    libgbm1 \
    libglib2.0-0t64 \
    libgtk-3-0t64 \
    libnss3 \
    libpango-1.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2

ARCH="$(uname --machine)"

# renovate: datasource=github-tags depName=bazelbuild/bazelisk
BAZELISK_VERSION="v1.29.0"
# renovate: datasource=github-tags depName=bazelbuild/buildtools
BUILDTOOLS_VERSION="v8.5.1"
# renovate: datasource=github-tags depName=withered-magic/starpls
STARPLS_VERSION="v0.1.22"
# renovate: datasource=npm depName=pnpm
PNPM_VERSION="11.17.0"
# renovate: datasource=github-tags depName=nodejs/node
NODE_VERSION="v26.5.0"
# renovate: datasource=github-releases depName=kucherenko/jscpd
JSCPD_VERSION="v5.0.12"
# renovate: datasource=github-releases depName=dprint/dprint
DPRINT_VERSION="0.55.2"
# renovate: datasource=npm depName=knip
KNIP_VERSION="6.29.0"

if [[ $ARCH == "arm64" ]] || [[ $ARCH == "aarch64" ]]; then
    curl "https://github.com/bazelbuild/bazelisk/releases/download/${BAZELISK_VERSION}/bazelisk-linux-arm64" -Lo /usr/local/bin/bazel
    curl "https://github.com/bazelbuild/buildtools/releases/download/${BUILDTOOLS_VERSION}/buildifier-linux-arm64" -Lo /usr/local/bin/buildifier
    curl "https://github.com/bazelbuild/buildtools/releases/download/${BUILDTOOLS_VERSION}/buildozer-linux-arm64" -Lo /usr/local/bin/buildozer
    curl "https://github.com/bazelbuild/buildtools/releases/download/${BUILDTOOLS_VERSION}/unused_deps-linux-arm64" -Lo /usr/local/bin/unused_deps
    curl "https://github.com/withered-magic/starpls/releases/download/${STARPLS_VERSION}/starpls-linux-aarch64" -Lo /usr/local/bin/starpls
    curl "https://github.com/pnpm/pnpm/releases/download/v${PNPM_VERSION}/pnpm-linux-arm64.tar.gz" -Lo /tmp/pnpm.tar.gz
    curl "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-arm64.tar.xz" -Lo /tmp/node.tar.xz
    curl "https://github.com/kucherenko/jscpd/releases/download/${JSCPD_VERSION}/jscpd-linux-arm64-gnu.tar.gz" -Lo /tmp/jscpd.tar.gz
    curl "https://github.com/dprint/dprint/releases/download/${DPRINT_VERSION}/dprint-aarch64-unknown-linux-gnu.zip" -Lo /tmp/dprint.zip
elif [[ $ARCH == "x86_64" ]]; then
    curl "https://github.com/bazelbuild/bazelisk/releases/download/${BAZELISK_VERSION}/bazelisk-linux-amd64" -Lo /usr/local/bin/bazel
    curl "https://github.com/bazelbuild/buildtools/releases/download/${BUILDTOOLS_VERSION}/buildifier-linux-amd64" -Lo /usr/local/bin/buildifier
    curl "https://github.com/bazelbuild/buildtools/releases/download/${BUILDTOOLS_VERSION}/buildozer-linux-amd64" -Lo /usr/local/bin/buildozer
    curl "https://github.com/bazelbuild/buildtools/releases/download/${BUILDTOOLS_VERSION}/unused_deps-linux-amd64" -Lo /usr/local/bin/unused_deps
    curl "https://github.com/withered-magic/starpls/releases/download/${STARPLS_VERSION}/starpls-linux-amd64" -Lo /usr/local/bin/starpls
    curl "https://github.com/pnpm/pnpm/releases/download/v${PNPM_VERSION}/pnpm-linux-x64.tar.gz" -Lo /tmp/pnpm.tar.gz
    curl "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz" -Lo /tmp/node.tar.xz
    curl "https://github.com/kucherenko/jscpd/releases/download/${JSCPD_VERSION}/jscpd-linux-x64-gnu.tar.gz" -Lo /tmp/jscpd.tar.gz
    curl "https://github.com/dprint/dprint/releases/download/${DPRINT_VERSION}/dprint-x86_64-unknown-linux-gnu.zip" -Lo /tmp/dprint.zip
else
    echo "Unknown arch $ARCH"
    exit 1
fi

# pnpm installation
mkdir -p /usr/local/pnpm
tar -xzf /tmp/pnpm.tar.gz -C /usr/local/pnpm
rm /tmp/pnpm.tar.gz
ln -s /usr/local/pnpm/pnpm /usr/local/bin/pnpm

# node installation
mkdir -p /usr/local/node
tar -xf /tmp/node.tar.xz -C /usr/local/node --strip-components=1
rm /tmp/node.tar.xz
ln -s /usr/local/node/bin/node /usr/local/bin/node

# jscpd installation
tar -xzf /tmp/jscpd.tar.gz -C /usr/local/bin
rm /tmp/jscpd.tar.gz

# dprint installation
unzip -o /tmp/dprint.zip -d /usr/local/bin dprint
rm /tmp/dprint.zip

# knip installation (npm package, installed globally via pnpm)
# pnpm's global shim uses $0-relative paths, so a plain symlink into /usr/local/bin
# would break; wrap it in a tiny exec script instead.
export PNPM_HOME=/usr/local/pnpm-global
mkdir -p "$PNPM_HOME/bin"
export PATH="$PNPM_HOME/bin:$PATH"
/usr/local/bin/pnpm add -g "knip@${KNIP_VERSION}"
cat > /usr/local/bin/knip <<EOF
#!/bin/sh
exec "$PNPM_HOME/bin/knip" "\$@"
EOF
chmod +x /usr/local/bin/knip

chmod +x \
    /usr/local/bin/bazel \
    /usr/local/bin/buildifier \
    /usr/local/bin/buildozer \
    /usr/local/bin/unused_deps \
    /usr/local/bin/starpls \
    /usr/local/bin/pnpm \
    /usr/local/bin/node \
    /usr/local/bin/jscpd \
    /usr/local/bin/dprint
