#!/usr/bin/env bash
# shellcheck shell=bash
# Appends the remote repos Bazel materialised, and the repos whose repo rules ran, to the job summary.
# Report only: never fails the job.
#
# Usage: OUTPUT_BASE=<bazel output base> report_materialisations.sh <heading> [profile.gz]
#
# `command.log` only describes the most recent Bazel command, so call this straight after the
# command it reports on, and resolve OUTPUT_BASE before the first build (`bazel info` is a command).
set -uo pipefail

heading="${1:-Bazel}"
profile="${2:-}"
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
command_log="${OUTPUT_BASE:-}/command.log"

# Colour codes and `\r` redraws from `--color=yes` would otherwise end up in repo names.
strip_ansi() {
    sed -e 's/\x1b\[[0-9;]*[A-Za-z]//g' -e 's/\r$//'
}

print_list() {
    local list="$1"
    if [[ -z "$list" ]]; then
        echo "_None_"
    else
        local count
        count="$(printf '%s\n' "$list" | wc -l)"
        echo "${count} repo(s)"
        echo
        printf '%s\n' "$list" | sed -e 's/^/- `/' -e 's/$/`/'
    fi
}

{
    echo "### ${heading}"
    echo
    echo "#### Materialised remote repos"
    echo
    if [[ -z "${OUTPUT_BASE:-}" || ! -f "$command_log" ]]; then
        echo "_No command log at \`${command_log}\`_"
    else
        materialised="$(
            strip_ansi <"$command_log" \
                | sed -n 's/.*DEBUG: Materializing remote repo[: ]*//p' \
                | sort -u
        )"
        print_list "$materialised"
    fi
    echo
    echo "#### Repo rules that ran"
    echo
    if [[ -z "$profile" || ! -f "$profile" ]]; then
        echo "_No profile at \`${profile}\`_"
    else
        # Profiles can be truncated, so stream them rather than parsing as JSON.
        ran="$(
            { gzip -dc "$profile" 2>/dev/null || true; } \
                | grep -o '"cat":"Starlark repository function call","name":"[^"]*"' \
                | sed -e 's/.*"name":"//' -e 's/"$//' \
                | sort -u
        )"
        print_list "$ran"
    fi
    echo
} >>"$summary" || true

exit 0
