import * as cache from "@actions/cache";
import * as core from "@actions/core";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { deriveKeys, moduleGraphDigest, sha256 } from "./keys.js";

const execFileAsync = promisify(execFile);

const STATE_LOCKFILE = "lockfile";
const STATE_PRIMARY = "primary-key";
const STATE_MATCHED = "matched-key";

async function main(workspace: string): Promise<void> {
    // `bazel info` starts the server, which later steps reuse with setup-bazel's startup flags.
    const { stdout } = await execFileAsync("bazel", ["info", "output_base"], { cwd: workspace });
    const lockfile = join(stdout.trim(), "MODULE.bazel.lock");

    const read = (name: string) => readFile(join(workspace, name));
    const platform = `${process.env["RUNNER_OS"]}-${process.env["RUNNER_ARCH"]}`;
    const keys = deriveKeys(
        platform,
        moduleGraphDigest(await read("MODULE.bazel"), await read("MODULE.bazel.lock"), await read(".bazelversion")),
        sha256(await read("pnpm-lock.yaml")),
    );

    core.saveState(STATE_LOCKFILE, lockfile);
    core.saveState(STATE_PRIMARY, keys.primary);

    // A cache outage only costs a re-evaluation, so it must not fail the job.
    let matched: string | undefined;
    try {
        matched = await cache.restoreCache([lockfile], keys.primary, keys.restoreKeys);
    } catch (e) {
        core.warning(`Failed to restore the hidden lockfile: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (matched === undefined) {
        core.info("No hidden lockfile restored.");
    } else {
        core.saveState(STATE_MATCHED, matched);
        core.info(`Restored hidden lockfile from ${matched}`);
    }
    core.setOutput("cache-hit", matched === keys.primary);
}

async function post(): Promise<void> {
    if (!core.getBooleanInput("save")) {
        return;
    }

    const lockfile = core.getState(STATE_LOCKFILE);
    const primary = core.getState(STATE_PRIMARY);
    if (lockfile === "" || primary === "") {
        core.info("Nothing to save, the restore step did not run.");
        return;
    }
    if (core.getState(STATE_MATCHED) === primary) {
        core.info(`Cache hit on ${primary}, not saving.`);
        return;
    }
    if (!existsSync(lockfile)) {
        core.info(`${lockfile} does not exist, not saving.`);
        return;
    }

    try {
        await cache.saveCache([lockfile], primary);
        core.info(`Saved hidden lockfile as ${primary}`);
    } catch (e) {
        if (e instanceof cache.ReserveCacheError) {
            // Another job saved this key first.
            core.info(e.message);
        } else {
            core.warning(`Failed to save the hidden lockfile: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

try {
    // `main` and `post` are the same file; state saved during `main` is how `post` is recognised.
    if (core.getState("is-post") === "true") {
        await post();
    } else {
        core.saveState("is-post", "true");
        await main(process.env["GITHUB_WORKSPACE"] ?? process.cwd());
    }
} catch (e) {
    core.setFailed(e instanceof Error ? e.message : String(e));
}
