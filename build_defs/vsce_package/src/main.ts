import { cli } from "cleye";
import { createVSIX } from "@vscode/vsce";

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

await createVSIX({
    cwd: inDir,
    packagePath: outFile,
    updatePackageJson: false,
    dependencies: false,
});
