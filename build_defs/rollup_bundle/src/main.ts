import commonjs__ from "@rollup/plugin-commonjs";
import json__ from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { cli } from "cleye";
import * as path from "node:path";
import { rollup } from "rollup";
import sourcemaps from "rollup-plugin-sourcemaps2";
import { moduleReplacementPlugin } from "./module-replacement-plugin.js";
import { nodeBuiltinPrefixPlugin } from "./node-builtin-prefix-plugin.js";
import { typescriptHelperWarningsPlugin } from "./typescript-helper-warnings-plugin.js";
import { isDependencyCycle } from "./warnings.js";
import { wasmSourcePhasePlugin } from "./wasm-source-phase-plugin.js";

// Work around https://github.com/rollup/plugins/issues/1662
const commonjs = commonjs__ as unknown as typeof commonjs__.default;
const json = json__ as unknown as typeof json__.default;

const argv = cli({
    flags: {
        entryPoint: {
            type: [String],
            placeholder: "<file>",
        },
        externalModule: {
            type: [String],
            placeholder: "<module-name>",
        },
        replaceModule: {
            type: [String],
            placeholder: "<path>=<file>",
        },
        outDir: {
            type: String,
            placeholder: "<dir>",
        },
    },
});

if (Object.keys(argv.unknownFlags).length > 0) {
    console.error(`Unknown flags: ${Object.keys(argv.unknownFlags).map(v => `'${v}'`).join(", ")}.`);
    argv.showHelp();
    process.exit(1);
}

const entryPoints = (() => {
    if (argv.flags.entryPoint.length > 0) {
        return argv.flags.entryPoint;
    } else {
        console.log("At least one entry point must be specified.");
        argv.showHelp();
        process.exit(1);
    }
})();
const externalModules = argv.flags.externalModule;
const moduleReplacements = argv.flags.replaceModule.map((replacement): readonly [string, string] => {
    const separator = replacement.indexOf("=");
    if (separator <= 0 || separator === replacement.length - 1) {
        console.error(`Invalid module replacement '${replacement}'; expected <path>=<file>.`);
        process.exit(1);
    }
    return [replacement.slice(0, separator), replacement.slice(separator + 1)];
});
const outDir = (() => {
    if (argv.flags.outDir) {
        return argv.flags.outDir;
    } else {
        console.log("Output directory must be specified.");
        argv.showHelp();
        process.exit(1);
    }
})();

const bundle = await (async () => {
    try {
        return await rollup({
            input: entryPoints,
            plugins: [
                moduleReplacementPlugin(moduleReplacements),
                nodeBuiltinPrefixPlugin(),
                wasmSourcePhasePlugin(),
                nodeResolve(),
                commonjs(),
                json(),
                // Follows the inputs' own source maps (e.g. from `tsc`). Last among the loaders,
                // since it loads every file it matches.
                sourcemaps({ include: /\.[cm]?js$/ }),
                typescriptHelperWarningsPlugin(),
            ],
            external: externalModules,
            onwarn: (warning, defaultHandler) => {
                if (isDependencyCycle(warning)) {
                    return;
                }
                if (warning.code === "UNRESOLVED_IMPORT") {
                    console.error(warning.message);
                    console.error(`ID: ${warning.id}`);
                    process.exit(1);
                }
                defaultHandler(warning);
            },
        });
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();

function entryFileNames(chunkInfo: { name: string }): string {
    return path.basename(chunkInfo.name) + ".js";
}

/**
 * Sources are named by where they sit in the repository (e.g. `extension/src/main.ts`,
 * `packages/git/src/api/commit.ts`), rather than relative to the bundle, and third-party
 * npm packages by their package name, not their location in the store.
 */
function sourcemapPathTransform(relativeSourcePath: string, sourcemapPath: string): string {
    const absolute = path.resolve(path.dirname(sourcemapPath), relativeSourcePath);
    const binDir = process.env["BAZEL_BINDIR"];
    const binIndex = binDir === undefined ? -1 : absolute.lastIndexOf(`/${binDir}/`);
    const relative = binIndex === -1
        ? path.relative(process.cwd(), absolute)
        : absolute.slice(binIndex + binDir!.length + 2);
    return relative
        .replace(/(^|\/)node_modules\/\.aspect_rules_js\/[^/]+\/node_modules\//g, "$1node_modules/")
        .replace(/^node_modules\/monolithic-git-interop\//, "packages/git/")
        .replace(/^node_modules\/monolithic-git-wasm\//, "packages/wasm/");
}

try {
    await bundle.write({
        dir: outDir,
        // TODO Formalise this in the CLI API
        entryFileNames,
        // Source maps leave the JS untouched and go to their own directory, mirroring the JS
        // layout, so that packaging the JS never picks them up.
        sourcemap: "hidden",
        sourcemapFileNames: (chunkInfo) =>
            "sourcemaps/" + (chunkInfo.isEntry ? entryFileNames(chunkInfo) : "chunks/[name].js") + ".map",
        sourcemapPathTransform,
        format: "esm",
        generatedCode: "es2015",
        // Bazel wants all outputs to be pre-declared, so chunks and assets
        // are each written into a single fixed directory that maps to a
        // directory output.
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
        // All modules are considered pure, transitive import order does not need to be maintained.
        hoistTransitiveImports: false,
    });
    await bundle.close();
} catch (e) {
    console.error(e);
    process.exit(1);
}
