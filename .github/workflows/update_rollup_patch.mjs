import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Rollup ships pre-bundled CJS (`dist/shared/rollup.js`) and ESM (`dist/es/shared/node-entry.js`)
// artifacts in its npm package. Because even unrelated upstream commits shift line numbers and
// bundle order across `dist/`, a raw `patches/rollup@<version>.patch` cannot simply be renamed when
// Renovate bumps `rollup`.
//
// Instead, the canonical change lives as an unbundled TypeScript source patch against upstream
// `rollup/rollup` in `patches/rollup/fold-external-dynamic-imports.patch`. Whenever `rollup`'s
// pinned version in `build_defs/rollup_bundle/package.json` differs from the `rollup@<version>` key
// in `pnpm-workspace.yaml` (or `--force` / `--continue` is passed), this script:
//   1. Clones `rollup/rollup` at `v<version>` into a workspace directory.
//   2. Applies `patches/rollup/fold-external-dynamic-imports.patch` with `git apply --3way`.
//      If 3-way merge leaves conflicts, it lists the conflicted files and exits with instructions
//      to resolve them and re-run with `--continue --work-dir <dir>`, which refreshes
//      `patches/rollup/fold-external-dynamic-imports.patch` from the resolved tree before building.
//   3. Builds Rollup's Node distribution bundles (`dist/rollup.d.ts`, `dist/shared/rollup.js`,
//      `dist/es/shared/node-entry.js`) with `SOURCE_DATE_EPOCH` matched to the published tarball's
//      banner timestamp so the resulting `pnpm patch` diff contains only our functional changes.
//   4. Runs `pnpm patch` + `pnpm patch-commit` and removes any stale `patches/rollup@*.patch`.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const rollupBundlePkgPath = path.join(repoRoot, "build_defs/rollup_bundle/package.json");
const pnpmWorkspacePath = path.join(repoRoot, "pnpm-workspace.yaml");
const patchesDir = path.join(repoRoot, "patches");
const sourcePatchPath = path.join(patchesDir, "rollup/fold-external-dynamic-imports.patch");
const defaultWorkDir = path.join(os.tmpdir(), "rollup-patch-build");

const args = process.argv.slice(2);
let force = false;
let continueMode = false;
let workDir = defaultWorkDir;

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--force") {
        force = true;
    } else if (arg === "--continue") {
        continueMode = true;
    } else if (arg === "--work-dir") {
        const next = args[++i];
        if (!next) {
            throw new Error("--work-dir requires a path argument");
        }
        workDir = path.resolve(next);
    } else if (arg.startsWith("--work-dir=")) {
        workDir = path.resolve(arg.slice("--work-dir=".length));
    } else if (arg === "--help" || arg === "-h") {
        console.log(
            [
                "Usage: node .github/workflows/update_rollup_patch.mjs [options]",
                "",
                "Options:",
                "  --force             Rebuild the pnpm patch even if the version already matches",
                "  --continue          Resume after resolving merge conflicts in --work-dir",
                "  --work-dir <dir>    Directory for the upstream rollup checkout",
                `                      (default: ${defaultWorkDir})`,
            ].join("\n"),
        );
        process.exit(0);
    } else {
        throw new Error(`Unknown argument: ${arg}`);
    }
}

function run(cmd, cmdArgs, options = {}) {
    const result = spawnSync(cmd, cmdArgs, {
        stdio: "inherit",
        ...options,
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Command failed (${result.status}): ${cmd} ${cmdArgs.join(" ")}`);
    }
}

function capture(cmd, cmdArgs, options = {}) {
    return execFileSync(cmd, cmdArgs, {
        encoding: "utf8",
        ...options,
    }).trim();
}

const rollupBundlePkg = JSON.parse(await fs.readFile(rollupBundlePkgPath, "utf8"));
const targetVersion = rollupBundlePkg.dependencies?.rollup;
if (!targetVersion || !/^\d+\.\d+\.\d+/.test(targetVersion)) {
    throw new Error(`Could not determine pinned rollup version in ${rollupBundlePkgPath}`);
}

const workspaceYaml = await fs.readFile(pnpmWorkspacePath, "utf8");
const patchedMatch = workspaceYaml.match(/"?rollup@(?<version>[^":\s]+)"?\s*:\s*"?patches\/rollup@[^"\s]+\.patch"?/);
const currentPatchedVersion = patchedMatch?.groups?.version ?? null;
const targetPatchRelPath = `patches/rollup@${targetVersion}.patch`;
const targetPatchAbsPath = path.join(repoRoot, targetPatchRelPath);

const targetPatchExists = await fs.stat(targetPatchAbsPath).then(() => true, () => false);

if (!force && !continueMode && currentPatchedVersion === targetVersion && targetPatchExists) {
    console.log(`rollup@${targetVersion} patch is already up to date (${targetPatchRelPath}).`);
    process.exit(0);
}

console.log(`Updating Rollup patch for rollup@${targetVersion}...`);

if (!continueMode) {
    await fs.rm(workDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(workDir), { recursive: true });
    console.log(`Cloning rollup/rollup@v${targetVersion} into ${workDir}...`);
    run("git", [
        "clone",
        "--depth",
        "1",
        "--branch",
        `v${targetVersion}`,
        "https://github.com/rollup/rollup.git",
        workDir,
    ]);

    // Fetch blob objects referenced in the patch's `index <old>..<new>` lines if available so
    // `git apply --3way` can construct a 3-way merge base when upstream hunks have shifted.
    const patchContent = await fs.readFile(sourcePatchPath, "utf8");
    const baseBlobs = Array.from(
        patchContent.matchAll(/^index ([0-9a-f]{7,40})\.\.[0-9a-f]{7,40}/gm),
        m => m[1],
    );
    if (baseBlobs.length > 0) {
        spawnSync("git", ["fetch", "--depth", "50", "origin", "master"], {
            cwd: workDir,
            stdio: "ignore",
        });
    }

    const applyResult = spawnSync("git", ["apply", "--3way", sourcePatchPath], {
        cwd: workDir,
        encoding: "utf8",
    });

    if (applyResult.status !== 0) {
        const statusOutput = capture("git", ["status", "--porcelain"], { cwd: workDir });
        const conflictedFiles = statusOutput
            .split("\n")
            .filter(line => /^(UU|AA|DD|AU|UA|DU|UD)\s/.test(line))
            .map(line => line.slice(3));

        console.error("\n======================================================================");
        console.error(
            `Merge conflict while applying ${path.relative(repoRoot, sourcePatchPath)} to rollup@v${targetVersion}.`,
        );
        if (applyResult.stderr) {
            console.error(applyResult.stderr.trim());
        }
        if (conflictedFiles.length > 0) {
            console.error("\nConflicted files in work tree:");
            for (const file of conflictedFiles) {
                console.error(`  - ${path.join(workDir, file)}`);
            }
        }
        console.error("\nTo resolve manually:");
        console.error(`  1. Resolve the conflicts in ${workDir}`);
        console.error("  2. Mark them resolved (`git add <file>` inside the work tree) or remove conflict markers");
        console.error(
            `  3. Re-run: node .github/workflows/update_rollup_patch.mjs --continue${
                workDir === defaultWorkDir ? "" : ` --work-dir ${JSON.stringify(workDir)}`
            }`,
        );
        console.error("======================================================================\n");
        process.exit(1);
    }
} else {
    const workDirExists = await fs.stat(workDir).then(() => true, () => false);
    if (!workDirExists) {
        throw new Error(`--continue specified, but work directory ${workDir} does not exist.`);
    }
    const unmerged = capture("git", ["diff", "--name-only", "--diff-filter=U"], { cwd: workDir });
    if (unmerged) {
        throw new Error(
            `Unresolved merge conflicts remain in ${workDir}:\n${unmerged}\n`
                + "Resolve all conflict markers and `git add` the resolved files before running with --continue.",
        );
    }
    for (const relFile of unmerged.split("\n").filter(Boolean)) {
        throw new Error(`Unmerged file: ${relFile}`);
    }
    const diffCheck = spawnSync("git", ["diff", "--check", "src/"], {
        cwd: workDir,
        encoding: "utf8",
    });
    if (diffCheck.status !== 0 && diffCheck.stdout?.includes("conflict marker")) {
        throw new Error(`Leftover conflict markers detected in ${workDir}/src:\n${diffCheck.stdout}`);
    }
}

// Refresh the canonical source patch so future version bumps apply cleanly from the updated base.
const updatedSourcePatch = execFileSync("git", ["diff", "HEAD", "--", "src/"], {
    cwd: workDir,
    encoding: "utf8",
});
if (!updatedSourcePatch.trim()) {
    throw new Error(`No changes found in ${workDir}/src/ against HEAD.`);
}
await fs.writeFile(sourcePatchPath, updatedSourcePatch, "utf8");
console.log(`Updated canonical source patch at ${path.relative(repoRoot, sourcePatchPath)}.`);

// Ensure pnpm-workspace.yaml does not reference a stale rollup patch before running `pnpm install`
// or `pnpm patch`, as pnpm fails with ERR_PNPM_UNUSED_PATCH if patchedDependencies names a version
// no longer in the dependency graph.
if (currentPatchedVersion && currentPatchedVersion !== targetVersion) {
    const cleanedWorkspaceYaml = workspaceYaml.replace(
        /\n\s*"?rollup@[^":\s]+"?\s*:\s*"?patches\/rollup@[^"\s]+\.patch"?/,
        "",
    );
    await fs.writeFile(pnpmWorkspacePath, cleanedWorkspaceYaml, "utf8");
    const oldPatchPath = path.join(patchesDir, `rollup@${currentPatchedVersion}.patch`);
    await fs.rm(oldPatchPath, { force: true });
}

// Regenerate the lockfile and local node_modules for the target rollup version so `pnpm patch`
// can extract the unpatched upstream package tarball. The old patch mapping was removed above, so
// this install must not use pnpm's CI-default frozen-lockfile mode.
run("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile"], { cwd: repoRoot });

const patchEditDir = path.join(os.tmpdir(), `rollup-patch-edit-${targetVersion}-${process.pid}`);
await fs.rm(patchEditDir, { recursive: true, force: true });
run("pnpm", ["patch", `rollup@${targetVersion}`, "--edit-dir", patchEditDir], { cwd: repoRoot });

// Extract the exact build timestamp from the published `dist/rollup.js` license banner so our
// rebuilt bundles produce a minimal diff without banner timestamp churn.
const upstreamRollupJs = await fs.readFile(path.join(patchEditDir, "dist/rollup.js"), "utf8");
const dateMatch = upstreamRollupJs.match(
    /^\s*(?<date>[A-Z][a-z]{2}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT) - commit /m,
);
const sourceDateEpoch = dateMatch
    ? String(Math.floor(Date.parse(dateMatch.groups.date) / 1000))
    : capture("git", ["log", "-1", "--format=%ct", "HEAD"], { cwd: workDir });

console.log(`Installing Rollup build dependencies in ${workDir}...`);
// Import Rollup's npm `package-lock.json` and install with `nodeLinker=hoisted` so Rollup's
// `fsEventsReplacement` build plugin finds `node_modules/chokidar/lib/fsevents-handler.js` at the
// exact path and version (`chokidar@3.x`) upstream built with.
run("pnpm", ["import"], {
    cwd: workDir,
    env: { ...process.env, npm_config_Minimum_release_age: "0" },
});
run(
    "pnpm",
    [
        "install",
        "--frozen-lockfile",
        "--ignore-scripts",
        "--config.nodeLinker=hoisted",
        "--config.minimumReleaseAge=0",
    ],
    { cwd: workDir },
);

console.log("Building Rollup distribution bundles (CJS + ESM)...");
run(
    path.join(workDir, "node_modules/.bin/rollup"),
    ["--config", "rollup.config.ts", "--configPlugin", "typescript", "--configIsBuildNode", "--forceExit"],
    {
        cwd: workDir,
        env: {
            ...process.env,
            SOURCE_DATE_EPOCH: sourceDateEpoch,
        },
    },
);

const distFilesToCopy = [
    "dist/rollup.d.ts",
    "dist/shared/rollup.js",
    "dist/es/shared/node-entry.js",
];
for (const relPath of distFilesToCopy) {
    await fs.copyFile(path.join(workDir, relPath), path.join(patchEditDir, relPath));
}

console.log(`Committing pnpm patch to ${targetPatchRelPath}...`);
run("pnpm", ["patch-commit", patchEditDir], { cwd: repoRoot });

await fs.rm(patchEditDir, { recursive: true, force: true });
if (!continueMode) {
    await fs.rm(workDir, { recursive: true, force: true });
}

console.log(`Successfully regenerated ${targetPatchRelPath}.`);
