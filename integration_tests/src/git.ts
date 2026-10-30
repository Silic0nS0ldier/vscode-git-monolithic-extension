import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { testTmpDir, workspaceDir } from "./harness.js";

const execFileAsync = promisify(execFile);

/** Calls outside a poll have no deadline of their own, so a git that never exits would hang the suite. */
const GIT_TIMEOUT_MS = 10_000;

let cachedBin: string | undefined;

/** The fixture task records the absolute path of the Bazel-provided git build here. */
async function gitBin(): Promise<string> {
    cachedBin ??= (await readFile(join(testTmpDir(), "git-bin"), "utf8")).trim();
    return cachedBin;
}

async function git(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync(await gitBin(), ["-C", workspaceDir(), ...args], {
        env: {
            ...process.env,
            // The dugite build ships its own config; ignore whatever the host has.
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_CONFIG_SYSTEM: "/dev/null",
            // Polling `git status` would otherwise take `index.lock` out from under the extension.
            GIT_OPTIONAL_LOCKS: "0",
        },
        timeout: GIT_TIMEOUT_MS,
    });
    return stdout;
}

/** Path to its two-letter porcelain status code, e.g. `tracked.txt` -> `M ` (staged). */
export async function status(): Promise<Record<string, string>> {
    const stdout = await git("status", "--porcelain");
    return Object.fromEntries(
        stdout.split("\n").filter(line => line !== "").map(line => [line.slice(3), line.slice(0, 2)]),
    );
}

export async function headSubject(): Promise<string> {
    return (await git("log", "-1", "--format=%s")).trim();
}

/** Subject line of the commit a revision resolves to. */
export async function subjectOf(rev: string): Promise<string> {
    return (await git("log", "-1", "--format=%s", rev)).trim();
}

/** Object name a ref resolves to, or undefined when the ref does not exist. */
export async function resolveRef(ref: string): Promise<string | undefined> {
    try {
        return (await git("rev-parse", "--verify", "--quiet", ref)).trim();
    } catch {
        return undefined;
    }
}

/** The branch ref `HEAD` points at, or undefined when `HEAD` is detached. */
export async function symbolicHead(): Promise<string | undefined> {
    try {
        return (await git("symbolic-ref", "--quiet", "HEAD")).trim();
    } catch {
        return undefined;
    }
}

/** Value of a key in the repository's own config, or undefined when it is unset. */
export async function localConfig(key: string): Promise<string | undefined> {
    try {
        return (await git("config", "--local", "--get", key)).trim();
    } catch {
        return undefined;
    }
}

/** Object name of a revision, abbreviated the way the SCM UI renders it. */
export async function shortCommit(rev: string): Promise<string> {
    return (await git("rev-parse", rev)).trim().slice(0, 8);
}

/** Full object name of a revision, resolved in `dir` relative to the workspace. */
export async function commitIn(dir: string, rev: string): Promise<string> {
    return (await git("-C", dir, "rev-parse", rev)).trim();
}

export async function setLocalConfig(key: string, value: string): Promise<void> {
    await git("config", key, value);
}

export async function unsetLocalConfig(key: string): Promise<void> {
    await git("config", "--local", "--unset", key);
}

/**
 * Pushes a new commit onto `origin/main`'s tip with no relation to any local commit, so
 * `--cherry` sees a unique entry ahead of whatever it already reports as equivalent.
 */
export async function pushUnrelatedUpstreamCommit(): Promise<void> {
    await pushUnrelatedUpstreamCommitUnfetched();
    await git("fetch", "origin");
}

/**
 * Like {@link pushUnrelatedUpstreamCommit}, but leaves `origin/main` behind, so a later fetch by the extension can be
 * observed. Returns the pushed commit.
 */
export async function pushUnrelatedUpstreamCommitUnfetched(): Promise<string> {
    const tip = (await git("rev-parse", "origin/main")).trim();
    const commit = (await git("commit-tree", "origin/main^{tree}", "-p", tip, "-m", "Unrelated newer change")).trim();
    await git("push", "origin", `${commit}:refs/heads/main`);
    return commit;
}

/**
 * Makes every later push to `origin` (accepted or rejected) create `marker`, by wrapping the receive-pack command
 * git runs for the local bare remote.
 */
export async function markPushesToOrigin(marker: string): Promise<void> {
    await setLocalConfig("remote.origin.receivepack", `touch '${marker}' && '${await gitBin()}' receive-pack`);
}
