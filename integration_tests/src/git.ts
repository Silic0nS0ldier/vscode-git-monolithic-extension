import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { testTmpDir, workspaceDir } from "./harness.js";

const execFileAsync = promisify(execFile);

let cachedBin: string | undefined;

/** The fixture task records the absolute path of the Bazel-provided git build here. */
async function gitBin(): Promise<string> {
    cachedBin ??= (await readFile(join(testTmpDir(), "git-bin"), "utf8")).trim();
    return cachedBin;
}

async function git(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync(await gitBin(), ["-C", workspaceDir(), ...args], {
        // The dugite build ships its own config; ignore whatever the host has.
        env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
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
