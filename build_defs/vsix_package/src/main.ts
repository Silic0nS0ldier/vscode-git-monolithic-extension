import fs from "node:fs";
import { cli } from "cleye";
import { createVSIX } from "@vscode/vsce";
import path from "node:path";

const argv = cli({
    flags: {
        inDir: {
            type: String,
            placeholder: '<dir>',
        },
        outFile: {
            type: String,
            placeholder: '<file>',
        },
    },
});

if (Object.keys(argv.unknownFlags).length > 0) {
    console.error(`Unknown flags: ${Object.keys(argv.unknownFlags).map(v => `'${v}'`).join(", ")}.`);
    argv.showHelp();
    process.exit(1);
}

const inDir = (() => {
    if (argv.flags.inDir) {
        return argv.flags.inDir;
    } else {
        console.log("Input directory must be specified.");
        argv.showHelp();
        process.exit(1);
    }
})();

const outFile = (() => {
    if (argv.flags.outFile) {
        return argv.flags.outFile;
    } else {
        console.log("Output file must be specified.");
        argv.showHelp();
        process.exit(1);
    }
})();

const version = (() => {
    const pkg = JSON.parse(fs.readFileSync(path.join(inDir, "package.json"), "utf-8"));
    if (process.env.BAZEL_VOLATILE_STATUS_FILE) {
        if (!process.env.JS_BINARY__EXECROOT) {
            console.error("JS_BINARY__EXECROOT is not set.");
            process.exit(1);
        }
        const volatileStatusContent = fs.readFileSync(path.join(process.env.JS_BINARY__EXECROOT, process.env.BAZEL_VOLATILE_STATUS_FILE), "utf-8");
        const match = volatileStatusContent.match(/BUILD_TIMESTAMP (\d+)/);
        if (!match) {
            console.error("BUILD_TIMESTAMP not found in BAZEL_VOLATILE_STATUS_FILE.");
            process.exit(1);
        } else {
            return `${pkg.version}-dev.${match[1]}`;
        }
    } else {
        return pkg.version as string;
    }
})();

await createVSIX({
    cwd: inDir,
    packagePath: outFile,
    updatePackageJson: false,
    dependencies: false,
    version,
});
