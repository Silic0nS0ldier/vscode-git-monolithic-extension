FROM ubuntu:24.10

# Update package lists
RUN apt-get update

RUN apt-get install -y \
    # Dev utils
    git \
    curl \
    # For NodeJS
    ca-certificates \
    gnupg

# Install NodeJS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs
    
# Install bazelisk, buildifier, buildozer, unused_deps, starpls (amd64 only), pnpm
ARG TARGETARCH
RUN if [ $TARGETARCH = "arm64" ]; then \
        curl https://github.com/bazelbuild/bazelisk/releases/download/v1.20.0/bazelisk-linux-arm64 -Lo /usr/local/bin/bazel ; \
        curl https://github.com/bazelbuild/buildtools/releases/download/v7.3.1/buildifier-linux-arm64 -Lo /usr/local/bin/buildifier ; \
        curl https://github.com/bazelbuild/buildtools/releases/download/v7.3.1/buildozer-linux-arm64 -Lo /usr/local/bin/buildozer ; \
        curl https://github.com/bazelbuild/buildtools/releases/download/v7.3.1/unused_deps-linux-arm64 -Lo /usr/local/bin/unused_deps ; \
        curl https://github.com/pnpm/pnpm/releases/download/v9.9.0/pnpm-linux-arm64 -Lo /usr/local/bin/pnpm ; \
    fi
RUN if [ $TARGETARCH = "amd64" ]; then \
        curl https://github.com/bazelbuild/bazelisk/releases/download/v1.20.0/bazelisk-linux-amd64 -Lo /usr/local/bin/bazel ; \
        curl https://github.com/bazelbuild/buildtools/releases/download/v7.3.1/buildifier-linux-amd64 -Lo /usr/local/bin/buildifier ; \
        curl https://github.com/bazelbuild/buildtools/releases/download/v7.3.1/buildozer-linux-amd64 -Lo /usr/local/bin/buildozer ; \
        curl https://github.com/bazelbuild/buildtools/releases/download/v7.3.1/unused_deps-linux-amd64 -Lo /usr/local/bin/unused_deps ; \
        curl https://github.com/withered-magic/starpls/releases/download/v0.1.14/starpls-linux-amd64 -Lo /usr/local/bin/starpls ; \
        curl https://github.com/pnpm/pnpm/releases/download/v9.9.0/pnpm-linux-x64 -Lo /usr/local/bin/pnpm ; \
    fi
RUN chmod +x /usr/local/bin/bazel /usr/local/bin/buildifier /usr/local/bin/buildozer /usr/local/bin/unused_deps /usr/local/bin/pnpm
RUN if [ $TARGETARCH = "amd64" ]; then \
        chmod +x /usr/local/bin/starpls ; \
    fi

CMD [ "bash"]
