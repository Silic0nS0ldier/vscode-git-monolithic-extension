import * as cache from "@actions/cache";
import * as core from "@actions/core";
import { execFile, spawn } from "node:child_process";
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

async function refresh(workspace: string): Promise<boolean> {
    return new Promise((resolve) => {
        const child = spawn("bazel", ["mod", "deps", "--lockfile_mode=update"], { cwd: workspace, stdio: "inherit" });
        child.on("error", () => resolve(false));
        child.on("close", (code) => resolve(code === 0));
    });
}

async function post(workspace: string): Promise<void> {
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
    // Evaluates every extension, not only those the job's commands needed, so later jobs find them all.
    // Run after the job's own commands so their materialisations aren't hidden by this one.
    if (!await refresh(workspace)) {
        // The key is immutable, so saving a partial file would pin it until the inputs change.
        core.warning("`bazel mod deps` failed, not saving the hidden lockfile.");
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
    const workspace = process.env["GITHUB_WORKSPACE"] ?? process.cwd();
    if (core.getState("is-post") === "true") {
        await post(workspace);
    } else {
        core.saveState("is-post", "true");
        await main(workspace);
    }
} catch (e) {
    core.setFailed(e instanceof Error ? e.message : String(e));
}
