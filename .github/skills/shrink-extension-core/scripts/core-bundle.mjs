// Measures the extension core: what is left of the bundle when no commands, or only some, are registered.
// Run with --help for usage.

import { spawnSync } from "node:child_process";
import {
    chmodSync,
    cpSync,
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parseArgs } from "node:util";

const SCRIPT = ".github/skills/shrink-extension-core/scripts/core-bundle.mjs";
// `minimal`, the repository's default, can leave the outputs read here missing, or stale relative to the sources.
const BUILD_ARGS = [
    "build",
    "--remote_download_outputs=all",
    "//extension:lib",
    "//extension:bundle",
    "//build_defs/rollup_bundle:bin",
];
const BUILD = `bazel ${BUILD_ARGS.join(" ")}`;

const USAGE = `Usage: node ${SCRIPT} [options]

Bundles the extension with no commands registered, or only those given with --keep, and reports what is left by
source path: the core that every integration test suite gets. It first runs
  ${BUILD}
so the measurement follows the sources, then checks that it reproduces Bazel's bundle byte for byte, so the numbers
are those of the shipped bundle. Bazel's output goes to stderr. Stages a copy of the outputs in a temporary
directory, under $TMPDIR if set.

Options:
  --keep <command>      Also register this command, named by its manifest id without "git_monolithic."
                        (e.g. rename). Repeatable.
  --absent <path>       Check that this source module renders no bytes, e.g. packages/git/src/api/mv/mod.ts.
                        A path ending in "/" covers every module under it. Repeatable.
  --absent-text <text>  Check that this literal appears nowhere in the bundled JS. Repeatable.
  --top <n>             List the n largest modules (default 15, 0 for none).
  --skip-build          Measure the outputs already on disk, without building first.
  --json                Print one JSON object to stdout instead of text.
  -h, --help            Show this help.

Exit codes:
  0  measured, and every check passed
  1  measured, and a check failed
  2  usage error, or nothing could be measured (the build failed, or its outputs are missing or stale)

Examples:
  node ${SCRIPT} --top 0 --absent extension/src/repository/operations/
  node ${SCRIPT} --top 0 --keep rename --absent packages/git/src/api/mv/mod.ts
`;

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const BIN = path.join(ROOT, ".bazel/bin");
const DIST = path.join(BIN, "extension/dist");
const BUNDLE = path.join(BIN, "extension/bundle_");
const TOOL = path.join(BIN, "build_defs/rollup_bundle");
const COMMAND_NAMES = path.join(ROOT, "extension/src/commands/command-names.gen.ts");

/** Exits with 2: bad arguments, or outputs that cannot be measured. */
class UsageError extends Error {}

function parse() {
    let values;
    try {
        ({ values } = parseArgs({
            options: {
                "keep": { type: "string", multiple: true, default: [] },
                "absent": { type: "string", multiple: true, default: [] },
                "absent-text": { type: "string", multiple: true, default: [] },
                "top": { type: "string", default: "15" },
                "skip-build": { type: "boolean", default: false },
                "json": { type: "boolean", default: false },
                "help": { type: "boolean", short: "h", default: false },
            },
        }));
    } catch (error) {
        throw new UsageError(`${error.message}\nRun with --help for usage.`);
    }
    if (!/^\d+$/.test(values.top)) {
        throw new UsageError(`--top must be a whole number, got "${values.top}".`);
    }
    return values;
}

function suggest(candidates, wanted) {
    const needle = path.basename(wanted).replace(/\.[jt]s$/, "").toLowerCase();
    const close = candidates.filter(candidate => candidate.toLowerCase().includes(needle)).slice(0, 5);
    return close.length ? ` Did you mean: ${close.join(", ")}?` : "";
}

// Mirrors build_defs/rollup_bundle/src/main.ts and the `rollup_bundle` call in extension/BUILD.bazel; keep them in
// sync. The fidelity check below catches most drift, but not tree-shaking options that only matter once commands
// are removed. Source maps are left out, as they never reach the VSIX.
const TREESHAKE = true;

async function loadRollup() {
    const toolRequire = createRequire(path.join(TOOL, "package.json"));
    const interop = mod => mod.default ?? mod;
    const toolModule = name => import(path.join(TOOL, "dist", name));
    return {
        rollup: toolRequire("rollup").rollup,
        commonjs: interop(toolRequire("@rollup/plugin-commonjs")),
        json: interop(toolRequire("@rollup/plugin-json")),
        nodeResolve: toolRequire("@rollup/plugin-node-resolve").nodeResolve,
        ...await toolModule("node-builtin-prefix-plugin.js"),
        ...await toolModule("wasm-source-phase-plugin.js"),
        ...await toolModule("typescript-helper-warnings-plugin.js"),
    };
}

async function bundle(tool, dir) {
    const build = await tool.rollup({
        input: [path.join(dir, "dist/main.js"), path.join(dir, "dist/askpass-main.js")],
        plugins: [
            tool.nodeBuiltinPrefixPlugin(),
            tool.wasmSourcePhasePlugin(),
            tool.nodeResolve(),
            tool.commonjs(),
            tool.json(),
            tool.typescriptHelperWarningsPlugin(),
        ],
        external: ["vscode"],
        treeshake: TREESHAKE,
        // Other warnings are the build's business, not this report's.
        onwarn: warning => {
            if (warning.code === "UNRESOLVED_IMPORT") {
                throw new UsageError(warning.message);
            }
        },
    });
    const { output } = await build.generate({
        entryFileNames: chunk => chunk.name.replace("dist/", "") + ".js",
        format: "esm",
        generatedCode: "es2015",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
        hoistTransitiveImports: false,
    });
    await build.close();

    const files = new Map();
    const modules = new Map();
    for (const item of output) {
        files.set(item.fileName, item.type === "chunk" ? Buffer.from(item.code) : Buffer.from(item.source));
        if (item.type === "chunk") {
            for (const [id, info] of Object.entries(item.modules)) {
                const key = sourcePath(id, dir);
                modules.set(key, (modules.get(key) ?? 0) + info.renderedLength);
            }
        }
    }
    return { files, modules };
}

/** Names a bundled module by the source it came from, so reports and `--absent` use repository paths. */
function sourcePath(id, dir) {
    const extensionDist = path.join(dir, "dist") + path.sep;
    if (id.startsWith(extensionDist)) {
        return "extension/src/" + id.slice(extensionDist.length).replace(/\.js$/, ".ts");
    }
    const gitPackage = /\/node_modules\/monolithic-git-interop\/dist\/(.*)\.js$/.exec(id);
    if (gitPackage) {
        return `packages/git/src/${gitPackage[1]}.ts`;
    }
    const wasmPackage = /\/node_modules\/monolithic-git-wasm\/(.*)$/.exec(id);
    if (wasmPackage) {
        return `packages/wasm/${wasmPackage[1]}`;
    }
    const npm = /.*\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id);
    if (npm) {
        return `npm:${npm[1]}`;
    }
    return id.replace(/^\0/, "");
}

function stage() {
    for (
        const required of [path.join(DIST, "main.js"), path.join(BUNDLE, "main.js"), path.join(TOOL, "dist/main.js")]
    ) {
        if (!existsSync(required)) {
            throw new UsageError(`${path.relative(ROOT, required)} is missing. Run without --skip-build.`);
        }
    }
    let dir;
    try {
        dir = mkdtempSync(path.join(tmpdir(), "core-bundle-"));
    } catch (error) {
        throw new UsageError(
            `cannot create a temporary directory in ${tmpdir()} (${error.code}). Set TMPDIR to a writable directory, `
                + "e.g. TMPDIR=$PWD/.bazel/tmp after mkdir -p .bazel/tmp.",
        );
    }
    cpSync(DIST, path.join(dir, "dist"), { recursive: true });
    // Bazel outputs are read-only, and so are their copies.
    chmodSync(path.join(dir, "dist"), 0o755);
    for (const entry of readdirSync(path.join(dir, "dist"), { recursive: true, withFileTypes: true })) {
        chmodSync(path.join(entry.parentPath, entry.name), entry.isDirectory() ? 0o755 : 0o644);
    }
    cpSync(path.join(BIN, "extension/package.json"), path.join(dir, "package.json"));
    symlinkSync(path.join(BIN, "extension/node_modules"), path.join(dir, "node_modules"));
    return dir;
}

/** Finds the compiled module that registers a command, by its `commandId: makeCommandId("<name>")`. */
function commandModule(dir, name) {
    const declared = [...readFileSync(COMMAND_NAMES, "utf8").matchAll(/^\s*\| "([^"]+)"/gm)].map(match => match[1]);
    if (!declared.includes(name)) {
        throw new UsageError(
            `No command named "${name}" in ${path.relative(ROOT, COMMAND_NAMES)}.${suggest(declared, name)}`,
        );
    }
    const root = path.join(dir, "dist/commands/implementations");
    const registration = `commandId: makeCommandId("${name}")`;
    const matches = readdirSync(root, { recursive: true })
        .filter(file => file.endsWith(".js"))
        .filter(file => readFileSync(path.join(root, file), "utf8").includes(registration));
    if (matches.length !== 1) {
        throw new UsageError(
            matches.length === 0
                ? `"${name}" is not registered by a module under commands/implementations/, so it is always core.`
                : `"${name}" is registered by several modules: ${matches.join(", ")}.`,
        );
    }
    return "./implementations/" + matches[0].split(path.sep).join("/");
}

/** Registers only the kept commands. Imports are added, never removed, so import-time side effects stay measured. */
function registerOnly(dir, keep) {
    const file = path.join(dir, "dist/commands/register.js");
    const source = readFileSync(file, "utf8");
    const list = /allCommands\(\[[\s\S]*?\]\);/;
    if (!list.test(source)) {
        throw new UsageError(`commands/register.js no longer has an \`allCommands([...])\` list; update ${SCRIPT}.`);
    }
    const imports = keep.map((name, i) => `import * as __keep${i} from "${commandModule(dir, name)}";`);
    // Arguments only need to keep the factories reachable; the bundle is measured, never run.
    const calls = keep.map((_, i) => `__keep${i}.createCommand(model, git, outputChannel, telemetryReporter)`);
    writeFileSync(file, imports.join("\n") + "\n" + source.replace(list, () => `allCommands([${calls.join(", ")}]);`));
}

function matchesShipped(files) {
    for (const [name, contents] of files) {
        const shipped = path.join(BUNDLE, name);
        if (!existsSync(shipped) || !contents.equals(readFileSync(shipped))) {
            return false;
        }
    }
    return true;
}

function checkAbsent(full, core, target) {
    const covers = target.endsWith("/") ? module => module.startsWith(target) : module => module === target;
    const known = [...full.modules.keys()];
    if (!known.some(covers)) {
        throw new UsageError(
            `${target} is not in the full bundle, so --absent would pass vacuously. Use a source path such as `
                + `extension/src/git.ts or packages/git/src/api/mv/mod.ts.${suggest(known, target)}`,
        );
    }
    const present = [...core.modules]
        .filter(([module, bytes]) => covers(module) && bytes > 0)
        .map(([module, bytes]) => ({ module, bytes }));
    return { absent: target, passed: present.length === 0, present };
}

function report(result, json) {
    if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    const pct = (n, of) => `${(100 * n / of).toFixed(1)}%`;
    const label = result.kept.length ? `registering only ${result.kept.join(", ")}` : "registering no commands";
    console.log(`full bundle: ${result.fullBytes} bytes`);
    console.log(`core bundle, ${label}: ${result.coreBytes} bytes (${pct(result.coreBytes, result.fullBytes)})`);
    if (result.largest.length) {
        console.log("largest core modules:");
        for (const { module, bytes } of result.largest) {
            console.log(`  ${String(bytes).padStart(7)}  ${module}`);
        }
    }
    if (result.checks.length) {
        console.log("checks:");
    }
    for (const check of result.checks) {
        if ("absentText" in check) {
            console.log(
                `  ${check.passed ? "ok  " : "FAIL"}  "${check.absentText}" ${check.passed ? "absent" : "present"}`,
            );
            continue;
        }
        console.log(`  ${check.passed ? "ok  " : "FAIL"}  ${check.absent} ${check.passed ? "absent" : "present:"}`);
        for (const { module, bytes } of check.present.slice(0, 5)) {
            console.log(`          ${bytes} bytes  ${module}`);
        }
    }
}

/** Builds what is measured, so that the measurement follows the sources. Bazel's output goes to stderr. */
function build() {
    const result = spawnSync("bazel", BUILD_ARGS, { cwd: ROOT, stdio: ["ignore", 2, 2] });
    if (result.error) {
        throw new UsageError(`cannot run bazel: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new UsageError(`\`${BUILD}\` failed (exit ${result.status}); see its output above.`);
    }
}

async function main() {
    const args = parse();
    if (args.help) {
        process.stdout.write(USAGE);
        return 0;
    }
    if (!args["skip-build"]) {
        build();
    }
    const dir = stage();
    try {
        const tool = await loadRollup();
        const full = await bundle(tool, dir);
        if (!matchesShipped(full.files)) {
            throw new UsageError(
                "The unmodified build does not match .bazel/bin/extension/bundle_. "
                    + (args["skip-build"] ? "Run without --skip-build to rebuild first. " : "")
                    + "If it still differs, bundle() in this script has drifted from "
                    + "build_defs/rollup_bundle/src/main.ts; update it to match.",
            );
        }

        registerOnly(dir, args.keep);
        const core = await bundle(tool, dir);
        const total = modules => [...modules.values()].reduce((a, b) => a + b, 0);
        const js = [...core.files]
            .filter(([name]) => name.endsWith(".js"))
            .map(([, contents]) => contents.toString("utf8"))
            .join("\n");
        const checks = [
            ...args.absent.map(target => checkAbsent(full, core, target)),
            ...args["absent-text"].map(text => ({ absentText: text, passed: !js.includes(text) })),
        ];
        const result = {
            fullBytes: total(full.modules),
            coreBytes: total(core.modules),
            kept: args.keep,
            largest: [...core.modules]
                .filter(([, bytes]) => bytes > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, Number(args.top))
                .map(([module, bytes]) => ({ module, bytes })),
            checks,
        };
        report(result, args.json);
        return checks.every(check => check.passed) ? 0 : 1;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

try {
    process.exitCode = await main();
} catch (error) {
    if (!(error instanceof UsageError)) {
        throw error;
    }
    console.error(`error: ${error.message}`);
    process.exitCode = 2;
}
