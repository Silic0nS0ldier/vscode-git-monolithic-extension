#!/usr/bin/env bash
# shellcheck shell=bash

set -eax

echo "Running install..."

ARCH="$(uname --processor)"

# renovate: datasource=github-tags depName=bazelbuild/bazelisk
BAZELISK_VERSION="1.26.0"
# renovate: datasource=github-tags depName=bazelbuild/buildtools
BUILDTOOLS_VERSION="8.2.1"
# renovate: datasource=github-tags depName=withered-magic/starpls
STARPLS_VERSION="0.1.21"
# renovate: datasource=github-tags depName=pnpm/pnpm
PNPM_VERSION=v10.13.1

if [[ $ARCH == "arm64" ]] || [[ $ARCH == "aarch64" ]]; then
    curl "https://github.com/bazelbuild/bazelisk/releases/download/v${BAZELISK_VERSION}/bazelisk-linux-arm64" -Lo /usr/local/bin/bazel
    curl "https://github.com/bazelbuild/buildtools/releases/download/v${BUILDTOOLS_VERSION}/buildifier-linux-arm64" -Lo /usr/local/bin/buildifier
    curl "https://github.com/bazelbuild/buildtools/releases/download/v${BUILDTOOLS_VERSION}/buildozer-linux-arm64" -Lo /usr/local/bin/buildozer
    curl "https://github.com/bazelbuild/buildtools/releases/download/v${BUILDTOOLS_VERSION}/unused_deps-linux-arm64" -Lo /usr/local/bin/unused_deps
    curl "https://github.com/withered-magic/starpls/releases/download/v${STARPLS_VERSION}/starpls-linux-aarch64" -Lo /usr/local/bin/starpls
    curl "https://github.com/pnpm/pnpm/releases/download/v${PNPM_VERSION}/pnpm-linux-arm64" -Lo /usr/local/bin/pnpm

elif [[ $ARCH == "x86_64" ]]; then
    curl "https://github.com/bazelbuild/bazelisk/releases/download/v${BAZELISK_VERSION}/bazelisk-linux-amd64" -Lo /usr/local/bin/bazel
    curl "https://github.com/bazelbuild/buildtools/releases/download/v${BUILDTOOLS_VERSION}/buildifier-linux-amd64" -Lo /usr/local/bin/buildifier
    curl "https://github.com/bazelbuild/buildtools/releases/download/v${BUILDTOOLS_VERSION}/buildozer-linux-amd64" -Lo /usr/local/bin/buildozer
    curl "https://github.com/bazelbuild/buildtools/releases/download/v${BUILDTOOLS_VERSION}/unused_deps-linux-amd64" -Lo /usr/local/bin/unused_deps
    curl "https://github.com/withered-magic/starpls/releases/download/v${STARPLS_VERSION}/starpls-linux-amd64" -Lo /usr/local/bin/starpls
    curl "https://github.com/pnpm/pnpm/releases/download/v${PNPM_VERSION}/pnpm-linux-x64" -Lo /usr/local/bin/pnpm
else
    echo "Unknown arch $ARCH"
    exit 1
fi
chmod +x \
    /usr/local/bin/bazel \
    /usr/local/bin/buildifier \
    /usr/local/bin/buildozer \
    /usr/local/bin/unused_deps \
    /usr/local/bin/starpls \
    /usr/local/bin/pnpm
