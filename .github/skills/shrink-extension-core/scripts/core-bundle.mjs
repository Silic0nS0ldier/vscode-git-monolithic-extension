// Bundles the extension with no commands registered and reports what is left: the code every integration test suite
// receives regardless of which commands it uses. See ../SKILL.md.
//
// Prerequisite (outputs must be on disk, which `--remote_download_outputs=minimal` does not guarantee):
//   bazel build --remote_download_outputs=all //extension:lib //extension:bundle //build_defs/rollup_bundle:bin
//
// Usage: node .github/skills/shrink-extension-core/scripts/core-bundle.mjs [options]
//   --keep <command>       Also register this command (manifest name without prefix, e.g. stashPop). Repeatable.
//   --absent <path>        Fail unless this module renders nothing, e.g. packages/git/src/api/mv/mod.ts. Repeatable.
//   --absent-text <text>   Fail if this literal appears in the bundled JS, e.g. branchValidationRegex. Repeatable.
//   --top <n>              Number of largest modules to list (default 25).
//
// Exit codes: 0 ok, 1 an --absent/--absent-text check failed, 2 setup problem.

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

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const BIN = path.join(ROOT, ".bazel/bin");
const DIST = path.join(BIN, "extension/dist");
const BUNDLE = path.join(BIN, "extension/bundle_");
const TOOL = path.join(BIN, "build_defs/rollup_bundle");

const { values: args } = parseArgs({
    options: {
        "keep": { type: "string", multiple: true, default: [] },
        "absent": { type: "string", multiple: true, default: [] },
        "absent-text": { type: "string", multiple: true, default: [] },
        "top": { type: "string", default: "25" },
    },
});

class SetupError extends Error {}

function fail(message) {
    throw new SetupError(message);
}

for (const required of [path.join(DIST, "main.js"), path.join(BUNDLE, "main.js"), path.join(TOOL, "dist/main.js")]) {
    if (!existsSync(required)) {
        console.error(
            `Missing ${path.relative(ROOT, required)}. Run:\n  bazel build --remote_download_outputs=all `
                + "//extension:lib //extension:bundle //build_defs/rollup_bundle:bin",
        );
        process.exit(2);
    }
}

// Mirrors the options in build_defs/rollup_bundle/src/main.ts and the `rollup_bundle` call in extension/BUILD.bazel.
// Keep them in sync: the fidelity check below catches most drift, but not tree-shaking options that only matter once
// commands are removed. Source maps are left out, as they never reach the VSIX.
const TREESHAKE = true;
const toolRequire = createRequire(path.join(TOOL, "package.json"));
const { rollup } = toolRequire("rollup");
const interop = mod => mod.default ?? mod;
const commonjs = interop(toolRequire("@rollup/plugin-commonjs"));
const json = interop(toolRequire("@rollup/plugin-json"));
const { nodeResolve } = toolRequire("@rollup/plugin-node-resolve");
const toolModule = name => import(path.join(TOOL, "dist", name));
const { nodeBuiltinPrefixPlugin } = await toolModule("node-builtin-prefix-plugin.js");
const { wasmSourcePhasePlugin } = await toolModule("wasm-source-phase-plugin.js");
const { typescriptHelperWarningsPlugin } = await toolModule("typescript-helper-warnings-plugin.js");

async function bundle(dir) {
    const build = await rollup({
        input: [path.join(dir, "dist/main.js"), path.join(dir, "dist/askpass-main.js")],
        plugins: [
            nodeBuiltinPrefixPlugin(),
            wasmSourcePhasePlugin(),
            nodeResolve(),
            commonjs(),
            json(),
            typescriptHelperWarningsPlugin(),
        ],
        external: ["vscode"],
        treeshake: TREESHAKE,
        // Other warnings are the build's business, not this report's.
        onwarn: warning => {
            if (warning.code === "UNRESOLVED_IMPORT") {
                fail(warning.message);
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
    const dir = mkdtempSync(path.join(tmpdir(), "core-bundle-"));
    cpSync(DIST, path.join(dir, "dist"), { recursive: true });
    // Bazel outputs are read-only, and so are their copies.
    for (const entry of readdirSync(path.join(dir, "dist"), { recursive: true, withFileTypes: true })) {
        chmodSync(path.join(entry.parentPath, entry.name), entry.isDirectory() ? 0o755 : 0o644);
    }
    chmodSync(path.join(dir, "dist"), 0o755);
    cpSync(path.join(BIN, "extension/package.json"), path.join(dir, "package.json"));
    symlinkSync(path.join(BIN, "extension/node_modules"), path.join(dir, "node_modules"));
    return dir;
}

/** Locates the compiled module of a command by its `makeCommandId("<name>")` call. */
function commandModule(dir, name) {
    const root = path.join(dir, "dist/commands/implementations");
    const matches = readdirSync(root, { recursive: true })
        .filter(file => file.endsWith(".js"))
        .filter(file => readFileSync(path.join(root, file), "utf8").includes(`makeCommandId("${name}")`));
    if (matches.length !== 1) {
        fail(`Expected one module declaring command '${name}', found ${matches.length}: ${matches.join(", ")}`);
    }
    if (!readFileSync(path.join(root, matches[0]), "utf8").includes("export function createCommand(")) {
        fail(`${matches[0]} declares '${name}' but does not export createCommand()`);
    }
    return "./implementations/" + matches[0].split(path.sep).join("/");
}

/** Registers only the kept commands. Imports are added, never removed, so import-time side effects stay visible. */
function registerOnly(dir, keep) {
    const file = path.join(dir, "dist/commands/register.js");
    const source = readFileSync(file, "utf8");
    const list = /allCommands\(\[[\s\S]*?\]\);/;
    if (!list.test(source)) {
        fail("commands/register.js no longer has an `allCommands([...])` list; update scripts/core-bundle.mjs.");
    }
    const imports = keep.map((name, i) => `import * as __keep${i} from "${commandModule(dir, name)}";`);
    const calls = keep.map((_, i) => `__keep${i}.createCommand(model, git, outputChannel, telemetryReporter)`);
    writeFileSync(
        file,
        imports.join("\n") + "\n" + source.replace(list, () => `allCommands([${calls.join(", ")}]);`),
    );
}

function sameShippedFiles(files) {
    for (const [name, contents] of files) {
        const shipped = path.join(BUNDLE, name);
        if (!existsSync(shipped) || !contents.equals(readFileSync(shipped))) {
            return false;
        }
    }
    return true;
}

const dir = stage();
try {
    const full = await bundle(dir);
    if (!sameShippedFiles(full.files)) {
        fail(
            "The unmodified build does not match .bazel/bin/extension/bundle_. Either the Bazel outputs are stale "
                + "(rebuild as above) or this script no longer mirrors build_defs/rollup_bundle/src/main.ts.",
        );
    }

    registerOnly(dir, args.keep);
    const core = await bundle(dir);

    const total = modules => [...modules.values()].reduce((a, b) => a + b, 0);
    const pct = (n, of) => `${(100 * n / of).toFixed(1)}%`;
    const fullBytes = total(full.modules);
    const coreBytes = total(core.modules);
    const label = args.keep.length ? `registering only ${args.keep.join(", ")}` : "registering no commands";
    console.log(`full bundle: ${fullBytes} bytes`);
    console.log(`core bundle (${label}): ${coreBytes} bytes, ${pct(coreBytes, fullBytes)} of full`);

    console.log(`\nlargest modules in the core bundle:`);
    const ranked = [...core.modules].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    for (const [name, n] of ranked.slice(0, Number(args.top))) {
        const of = full.modules.get(name) ?? n;
        console.log(`  ${String(n).padStart(7)}  ${name}${n < of ? `  (${pct(n, of)} of its full size)` : ""}`);
    }

    let failed = false;
    if (args.absent.length || args["absent-text"].length) {
        console.log("\nchecks:");
    }
    for (const name of args.absent) {
        const n = core.modules.get(name) ?? 0;
        if (!full.modules.has(name)) {
            console.log(`  ?    ${name}: not in the full bundle either; check the path`);
            failed = true;
        } else if (n > 0) {
            console.log(`  FAIL ${name}: ${n} bytes in the core bundle`);
            failed = true;
        } else {
            console.log(`  ok   ${name}: absent from the core bundle`);
        }
    }
    const js = [...core.files].filter(([name]) => name.endsWith(".js")).map(([, b]) => b.toString("utf8")).join("\n");
    for (const text of args["absent-text"]) {
        if (js.includes(text)) {
            console.log(`  FAIL "${text}" appears in the core bundle`);
            failed = true;
        } else {
            console.log(`  ok   "${text}" does not appear in the core bundle`);
        }
    }
    process.exitCode = failed ? 1 : 0;
} catch (error) {
    if (!(error instanceof SetupError)) {
        throw error;
    }
    console.error(error.message);
    process.exitCode = 2;
} finally {
    rmSync(dir, { recursive: true, force: true });
}
