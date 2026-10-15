#!/usr/bin/env bash
# shellcheck shell=bash
# Prints `true` when the image index digest in <digest file> differs from what <tag> points to in
# ghcr.io/<repository>, otherwise `false`. Lets publishing skip `oci_push`, whose runfiles
# materialise every layer tarball, when the registry already has the image.
#
# Usage: devcontainer_needs_publish.sh <digest file> <repository> <tag>
# Reads GHCR_USER and GHCR_TOKEN from the environment.
set -euo pipefail

digest_file="$1"
repository="$2"
tag="$3"

local_digest="$(tr -d '[:space:]' < "$digest_file")"

# Credentials go through stdin so they stay out of the process list.
token="$(
    printf 'user = "%s:%s"\n' "$GHCR_USER" "$GHCR_TOKEN" \
        | curl -fsS -K - "https://ghcr.io/token?scope=repository:${repository}:pull" \
        | jq -r '.token'
)"

# A missing tag (first publish) or registry error falls through to pushing.
remote_digest="$(
    printf 'header = "Authorization: Bearer %s"\n' "$token" \
        | curl -fsS -K - --head \
            -H "Accept: application/vnd.oci.image.index.v1+json" \
            -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
            "https://ghcr.io/v2/${repository}/manifests/${tag}" \
        | tr -d '\r' \
        | awk -F': ' 'tolower($1) == "docker-content-digest" { print $2 }'
)" || remote_digest=""

echo "Local digest: ${local_digest}" >&2
echo "Published digest: ${remote_digest:-<none>}" >&2

if [[ -n "$remote_digest" && "$remote_digest" == "$local_digest" ]]; then
    echo "false"
else
    echo "true"
fi
