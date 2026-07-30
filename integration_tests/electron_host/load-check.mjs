import { readdir, readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

// Loads each bundle entry point given on argv under the current runtime;
// - Electron in ELECTRON_RUN_AS_NODE mode.
// - Mainline Node.
// A parse/instantiation failure (e.g. a host whose V8 can't parse `import source`) rejects the
// dynamic `import()` and fails the check.
//
// This is necessary to prevent regressions. e.g.
// Break: https://github.com/Silic0nS0ldier/vscode-git-monolithic-extension/commit/f4f9199053937d1a3c094f5b95f0f4346e79e3a9
// Fix: https://github.com/Silic0nS0ldier/vscode-git-monolithic-extension/commit/ca6666135fd5c7b9b9cb4bd5cc4ad80dc52d1a56
//
// It's not perfect, but provides _some_ assurance that the bundle is compatible with the runtime.

async function listJsFiles(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await listJsFiles(full));
        else if (entry.name.endsWith(".js")) out.push(full);
    }
    return out;
}

const IMPORT_RE = /import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\})?\s*from\s*["']vscode["']/g;

async function collectVscodeNames(bundleDir) {
    const names = new Set();
    for (const file of await listJsFiles(bundleDir)) {
        const content = await readFile(file, "utf-8");
        for (const match of content.matchAll(IMPORT_RE)) {
            const [, defaultName, namedList] = match;
            if (defaultName) names.add("default");
            if (namedList) {
                for (const part of namedList.split(",")) {
                    const trimmed = part.trim();
                    if (!trimmed) continue;
                    // Strip `Foo as Bar` down to the exported name `Foo`.
                    names.add(trimmed.split(/\s+as\s+/)[0].trim());
                }
            }
        }
    }
    return names;
}

/**
 * A proxy stands in for every export: callable (functions, classes used with `new`) and property
 * access (enum-like namespaces, e.g. `ProgressLocation.SourceControl`).
 * Both resolve to another such proxy.
 */
function buildVscodeStubSource(names) {
    return [...names].map(name => {
        const decl = name === "default" ? "export default" : `export const ${name} =`;
        return `${decl} new Proxy(function () {}, { get: () => new Proxy(function () {}, {}) });`;
    }).join("\n");
}

const entryPoints = process.argv.slice(2);
if (entryPoints.length === 0) {
    console.error("usage: load-check.mjs <entry-point.js>...");
    process.exit(1);
}

const vscodeNames = new Set();
for (const entryPoint of entryPoints) {
    for (const name of await collectVscodeNames(path.dirname(entryPoint))) {
        vscodeNames.add(name);
    }
}
console.error("Stubbing vscode names:", [...vscodeNames].sort().join(", "));

const VSCODE_STUB_URL = "vscode-stub:vscode";
const stubSource = buildVscodeStubSource(vscodeNames);

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "vscode") return { url: VSCODE_STUB_URL, shortCircuit: true };
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url === VSCODE_STUB_URL) {
            return { format: "module", source: stubSource, shortCircuit: true };
        }
        return nextLoad(url, context);
    },
});

// Entry points may run CLI-style top-level logic that calls `process.exit()` when invoked without
// their expected argv/env (e.g. `askpass-main.js` checks `process.argv.length` and bails). That is not
// a load failure, so `process.exit` is neutralised for the duration of the import.
// Only a thrown/rejected error (parse or instantiation failure) fails the check.
const realExit = process.exit;
process.exit = () => {};
let failed = false;
try {
    for (const entryPoint of entryPoints) {
        try {
            await import(pathToFileURL(entryPoint).href);
            console.log("OK:", entryPoint);
        } catch (err) {
            failed = true;
            console.error("FAILED to load", entryPoint);
            console.error(err);
        }
    }
} finally {
    process.exit = realExit;
}
if (failed) process.exit(1);
