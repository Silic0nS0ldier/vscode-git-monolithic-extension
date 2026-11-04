import commonjs__ from "@rollup/plugin-commonjs";
import json__ from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { cli } from "cleye";
import * as path from "node:path";
import { rollup } from "rollup";
import sourcemaps from "rollup-plugin-sourcemaps2";
import { callsitePlugin } from "./callsite-plugin.js";
import { commandPruningPlugin } from "./command-pruning-plugin.js";
import { moduleReplacementPlugin } from "./module-replacement-plugin.js";
import { nodeBuiltinPrefixPlugin } from "./node-builtin-prefix-plugin.js";
import { repositoryPath } from "./repository-path.js";
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
        commandSelection: { type: String, placeholder: "<file>" },
        commandImplementations: { type: String, placeholder: "<dir>" },
        callsiteModule: { type: String, placeholder: "<path>" },
        callsiteFunction: { type: [String], placeholder: "<name>" },
        unsafeTreeshake: {
            type: Boolean,
            description: "Enable tree-shaking that is only safe for code known not to rely on what it removes.",
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
const { commandSelection, commandImplementations } = argv.flags;
if (Boolean(commandSelection) !== Boolean(commandImplementations)) {
    console.error("--command-selection and --command-implementations must be used together.");
    process.exit(1);
}
const { callsiteModule, callsiteFunction: callsiteFunctions } = argv.flags;
if (Boolean(callsiteModule) !== callsiteFunctions.length > 0) {
    console.error("--callsite-module and --callsite-function must be used together.");
    process.exit(1);
}
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
                ...(commandSelection && commandImplementations
                    ? [commandPruningPlugin(commandSelection, commandImplementations)]
                    : []),
                ...(callsiteModule ? [callsitePlugin(callsiteModule, callsiteFunctions)] : []),
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
            // `try` blocks are otherwise kept whole, in case they are feature detection that relies on side effects
            // Rollup can't see; e.g. protobuf-ts validates UTF-8 by calling `encodeURIComponent` and discarding the
            // result, which would be removed.
            treeshake: { tryCatchDeoptimization: !argv.flags.unsafeTreeshake },
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

/** Sources are named by where they sit in the repository, rather than relative to the bundle. */
function sourcemapPathTransform(relativeSourcePath: string, sourcemapPath: string): string {
    return repositoryPath(path.resolve(path.dirname(sourcemapPath), relativeSourcePath));
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
