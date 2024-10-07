#!/usr/bin/env bash

set -eax

echo "Running install..."

ARCH="$(uname --processor)"

if [[ $ARCH == "arm64" ]]; then
    curl https://github.com/bazelbuild/bazelisk/releases/download/v1.20.0/bazelisk-linux-arm64 -Lo /usr/local/bin/bazel
    curl https://github.com/bazelbuild/buildtools/releases/download/v7.1.2/buildifier-linux-arm64 -Lo /usr/local/bin/buildifier
    curl https://github.com/bazelbuild/buildtools/releases/download/v7.1.2/buildozer-linux-arm64 -Lo /usr/local/bin/buildozer
    curl https://github.com/bazelbuild/buildtools/releases/download/v7.1.2/unused_deps-linux-arm64 -Lo /usr/local/bin/unused_deps
    curl https://github.com/pnpm/pnpm/releases/download/v9.7.0/pnpm-linux-arm64 -Lo /usr/local/bin/pnpm
elif [[ $ARCH == "x86_64" ]]; then
    curl https://github.com/bazelbuild/bazelisk/releases/download/v1.20.0/bazelisk-linux-amd64 -Lo /usr/local/bin/bazel
    curl https://github.com/bazelbuild/buildtools/releases/download/v7.1.2/buildifier-linux-amd64 -Lo /usr/local/bin/buildifier
    curl https://github.com/bazelbuild/buildtools/releases/download/v7.1.2/buildozer-linux-amd64 -Lo /usr/local/bin/buildozer
    curl https://github.com/bazelbuild/buildtools/releases/download/v7.1.2/unused_deps-linux-amd64 -Lo /usr/local/bin/unused_deps
    curl https://github.com/withered-magic/starpls/releases/download/v0.1.14/starpls-linux-amd64 -Lo /usr/local/bin/starpls
    curl https://github.com/pnpm/pnpm/releases/download/v9.7.0/pnpm-linux-x64 -Lo /usr/local/bin/pnpm

    chmod +x /usr/local/bin/starpls ;
else
    echo "Unknown arch $ARCH"
    exit 1
fi
chmod +x /usr/local/bin/bazel /usr/local/bin/buildifier /usr/local/bin/buildozer /usr/local/bin/unused_deps /usr/local/bin/pnpm
