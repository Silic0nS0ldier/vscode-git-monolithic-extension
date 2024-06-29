import { cli } from "cleye";
import { rollup } from "rollup";
import commonjs__ from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";

// Work around https://github.com/rollup/plugins/issues/1662
const commonjs = commonjs__ as unknown as typeof commonjs__.default;

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
        outDir: {
            type: String,
            placeholder: '<dir>',
        }
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
                nodeResolve(),
                commonjs(),
            ],
            external: externalModules,
        });
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();

try {
    await bundle.write({
        dir: outDir,
        // TODO Formalise this in the CLI API
        entryFileNames: (chunkInfo) => {
            return chunkInfo.name.replace("dist/", "") + ".js";
        },
        format: "cjs",
        generatedCode: "es2015",
        // Bazel wants all outputs to be pre-declared, to satisfy this all chunks are put
        // into a single directory that maps to a directory output.
        chunkFileNames: "chunks/[name].js",
    });
    await bundle.close();
} catch (e) {
    console.error(e);
    process.exit(1);
}
