import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const workspacePath = path.join(repoRoot, "pnpm-workspace.yaml");
const lockPath = path.join(repoRoot, "pnpm-lock.yaml");
const delegatedPackages = new Set(["rollup"]);

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        stdio: "inherit",
        ...options,
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Command failed (${result.status}): ${command} ${args.join(" ")}`);
    }
}

function capture(command, args, options = {}) {
    return execFileSync(command, args, {
        encoding: "utf8",
        ...options,
    }).trim();
}

function unquote(value) {
    const trimmed = value.trim();
    const quote = trimmed[0];
    return quote && quote === trimmed.at(-1) && (quote === "\"" || quote === "'")
        ? trimmed.slice(1, -1)
        : trimmed;
}

function parsePatchedDependencies(workspace) {
    const lines = workspace.split("\n");
    const start = lines.findIndex(line => line.trim() === "patchedDependencies:");
    if (start === -1) {
        return { entries: [], withoutPatches: workspace };
    }

    let end = start + 1;
    while (end < lines.length && (!lines[end].trim() || /^\s/.test(lines[end]))) {
        end++;
    }

    const entries = [];
    for (const line of lines.slice(start + 1, end)) {
        const match = line.match(/^\s+(?<key>[^#][^:]+?)\s*:\s*(?<path>[^#]+?)\s*$/);
        if (!match?.groups) {
            continue;
        }

        const key = unquote(match.groups.key);
        const patchPath = unquote(match.groups.path);
        const separator = key.lastIndexOf("@");
        if (separator <= 0 || !patchPath.startsWith("patches/") || !patchPath.endsWith(".patch")) {
            throw new Error(`Invalid patchedDependencies entry: ${line.trim()}`);
        }
        entries.push({
            line,
            key,
            packageName: key.slice(0, separator),
            version: key.slice(separator + 1),
            patchPath,
        });
    }

    const withoutPatches = [
        ...lines.slice(0, start),
        "patchedDependencies: {}",
        ...lines.slice(end),
    ].join("\n");
    return { entries, withoutPatches };
}

function packageVersions(lockfile, packageName) {
    const lines = lockfile.split("\n");
    const start = lines.lastIndexOf("packages:");
    const end = lines.findIndex((line, index) => index > start && line === "snapshots:");
    if (start === -1 || end === -1) {
        throw new Error("Could not find the packages section in pnpm-lock.yaml");
    }

    const prefix = `${packageName}@`;
    const versions = new Set();
    for (const line of lines.slice(start + 1, end)) {
        const match = line.match(/^  (?<key>.+):$/);
        if (!match?.groups) {
            continue;
        }
        const key = unquote(match.groups.key);
        if (key.startsWith(prefix)) {
            versions.add(key.slice(prefix.length));
        }
    }
    return versions;
}

async function extractPackage(packageName, version, destination) {
    const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) {
        throw new Error(`Failed to fetch ${metadataUrl}: ${metadataResponse.status}`);
    }
    const metadata = await metadataResponse.json();
    const tarballUrl = metadata.versions?.[version]?.dist?.tarball;
    if (!tarballUrl) {
        throw new Error(`Could not find ${packageName}@${version} in ${metadataUrl}`);
    }

    const archiveResponse = await fetch(tarballUrl);
    if (!archiveResponse.ok) {
        throw new Error(`Failed to fetch ${tarballUrl}: ${archiveResponse.status}`);
    }

    await fs.mkdir(destination, { recursive: true });
    const archivePath = path.join(destination, "package.tgz");
    await fs.writeFile(archivePath, new Uint8Array(await archiveResponse.arrayBuffer()));
    const extractedDir = path.join(destination, "extracted");
    await fs.mkdir(extractedDir);
    run("tar", ["-xzf", archivePath, "-C", extractedDir]);
    return path.join(extractedDir, "package");
}

async function rollForward(entry, targetVersion) {
    const workDir = await fs.mkdtemp(
        path.join(os.tmpdir(), `pnpm-patch-${entry.packageName.replaceAll("/", "-")}-`),
    );
    const oldPackageDir = await extractPackage(entry.packageName, entry.version, path.join(workDir, "old"));
    const newPackageDir = await extractPackage(entry.packageName, targetVersion, path.join(workDir, "new"));
    const mergeDir = path.join(workDir, "merge");
    await fs.mkdir(mergeDir);
    run("git", ["init", "--quiet"], { cwd: mergeDir });
    run("git", ["config", "user.name", "pnpm patch updater"], { cwd: mergeDir });
    run("git", ["config", "user.email", "pnpm-patch-updater@localhost"], { cwd: mergeDir });

    await fs.cp(oldPackageDir, mergeDir, { recursive: true });
    run("git", ["add", "--all"], { cwd: mergeDir });
    run("git", ["commit", "--quiet", "-m", `${entry.packageName}@${entry.version}`], { cwd: mergeDir });
    const baseCommit = capture("git", ["rev-parse", "HEAD"], { cwd: mergeDir });

    run("git", ["apply", path.join(repoRoot, entry.patchPath)], { cwd: mergeDir });
    run("git", ["add", "--all"], { cwd: mergeDir });
    run("git", ["commit", "--quiet", "-m", `patch ${entry.packageName}@${entry.version}`], { cwd: mergeDir });
    const patchCommit = capture("git", ["rev-parse", "HEAD"], { cwd: mergeDir });

    run("git", ["checkout", "--quiet", "-b", "target", baseCommit], { cwd: mergeDir });
    run("git", ["rm", "--quiet", "-r", "."], { cwd: mergeDir });
    await fs.cp(newPackageDir, mergeDir, { recursive: true });
    run("git", ["add", "--all"], { cwd: mergeDir });
    run("git", ["commit", "--quiet", "-m", `${entry.packageName}@${targetVersion}`], { cwd: mergeDir });
    const targetCommit = capture("git", ["rev-parse", "HEAD"], { cwd: mergeDir });

    const cherryPick = spawnSync("git", ["cherry-pick", patchCommit], {
        cwd: mergeDir,
        encoding: "utf8",
    });
    if (cherryPick.status !== 0) {
        const conflicts = capture("git", ["diff", "--name-only", "--diff-filter=U"], { cwd: mergeDir });
        throw new Error(
            `Could not automatically roll ${entry.packageName}@${entry.version} forward to ${targetVersion}.\n`
                + `Conflicted package files:\n${conflicts}\n`
                + `The merge work tree is retained at ${mergeDir}.`,
        );
    }

    const updatedPatch = capture("git", ["diff", targetCommit, "HEAD"], { cwd: mergeDir });
    if (!updatedPatch) {
        throw new Error(`The rolled-forward ${entry.packageName}@${targetVersion} patch has no changes.`);
    }
    await fs.rm(workDir, { recursive: true, force: true });
    return `${updatedPatch}\n`;
}

const workspace = await fs.readFile(workspacePath, "utf8");
const lockfile = await fs.readFile(lockPath, "utf8");
const { entries, withoutPatches } = parsePatchedDependencies(workspace);

if (entries.length === 0) {
    console.log("No pnpm package patches to update.");
    process.exit(0);
}

let unpatchedLockfile;
try {
    // Resolve without patch selectors so pnpm can reveal package versions that made an existing patch stale.
    await fs.writeFile(workspacePath, withoutPatches);
    run("pnpm", ["install", "--lockfile-only"], { cwd: repoRoot });
    unpatchedLockfile = await fs.readFile(lockPath, "utf8");
} finally {
    await fs.writeFile(workspacePath, workspace);
    await fs.writeFile(lockPath, lockfile);
}

const migrations = [];
for (const entry of entries) {
    if (delegatedPackages.has(entry.packageName)) {
        continue;
    }

    const oldVersions = packageVersions(lockfile, entry.packageName);
    const targetVersions = packageVersions(unpatchedLockfile, entry.packageName);
    if (targetVersions.has(entry.version)) {
        continue;
    }

    let targetVersion = null;
    if (targetVersions.size === 1) {
        targetVersion = targetVersions.values().next().value;
    } else if (targetVersions.size > 1) {
        const addedVersions = new Set(Array.from(targetVersions).filter(version => !oldVersions.has(version)));
        if (addedVersions.size === 1) {
            targetVersion = addedVersions.values().next().value;
        } else {
            throw new Error(
                `Cannot determine the replacement for ${entry.packageName}@${entry.version}; `
                    + `the unpatched graph contains ${Array.from(targetVersions).join(", ")}.`,
            );
        }
    }
    migrations.push({ entry, targetVersion });
}

if (migrations.length === 0) {
    console.log("All active pnpm package patches already match the dependency graph.");
    process.exit(0);
}

const rolledPatches = [];
for (const migration of migrations) {
    if (migration.targetVersion === null) {
        rolledPatches.push(migration);
        continue;
    }
    console.log(
        `Rolling ${migration.entry.packageName}@${migration.entry.version} forward `
            + `to ${migration.targetVersion}...`,
    );
    rolledPatches.push({
        ...migration,
        patch: await rollForward(migration.entry, migration.targetVersion),
    });
}

let updatedWorkspace = workspace;
for (const { entry, targetVersion, patch } of rolledPatches) {
    const oldPatchPath = path.join(repoRoot, entry.patchPath);
    if (targetVersion === null) {
        updatedWorkspace = updatedWorkspace.replace(`${entry.line}\n`, "");
        await fs.rm(oldPatchPath);
        console.log(`Removed unused patch for ${entry.packageName}@${entry.version}.`);
        continue;
    }

    const targetKey = `${entry.packageName}@${targetVersion}`;
    const targetPatchPath = `patches/${targetKey}.patch`;
    updatedWorkspace = updatedWorkspace.replace(
        entry.line,
        entry.line.replace(entry.key, targetKey).replace(entry.patchPath, targetPatchPath),
    );
    await fs.writeFile(path.join(repoRoot, targetPatchPath), patch);
    if (entry.patchPath !== targetPatchPath) {
        await fs.rm(oldPatchPath);
    }
    console.log(`Regenerated ${targetPatchPath}.`);
}
await fs.writeFile(workspacePath, updatedWorkspace);
