import { createVSIX } from "@vscode/vsce";
import { cli } from "cleye";
import fs from "node:fs";
import path from "node:path";

const argv = cli({
    flags: {
        inDir: {
            type: String,
            placeholder: "<dir>",
        },
        outFile: {
            type: String,
            placeholder: "<file>",
        },
        verbose: {
            type: Boolean,
            description: "Show vsce output",
        },
    },
});

if (Object.keys(argv.unknownFlags).length > 0) {
    console.error(`Unknown flags: ${Object.keys(argv.unknownFlags).map(v => `'${v}'`).join(", ")}.`);
    argv.showHelp();
    process.exit(1);
}

const execroot = process.env.JS_BINARY__EXECROOT;
if (!execroot) {
    console.error("JS_BINARY__EXECROOT is not set.");
    process.exit(1);
}

const inDir = (() => {
    if (argv.flags.inDir) {
        return path.join(execroot, argv.flags.inDir);
    } else {
        console.log("Input directory must be specified.");
        argv.showHelp();
        process.exit(1);
    }
})();

const outFile = (() => {
    if (argv.flags.outFile) {
        return path.join(execroot, argv.flags.outFile);
    } else {
        console.log("Output file must be specified.");
        argv.showHelp();
        process.exit(1);
    }
})();

const version = (() => {
    const pkg = JSON.parse(fs.readFileSync(path.join(inDir, "package.json"), "utf-8"));
    if (process.env.BAZEL_VOLATILE_STATUS_FILE) {
        const volatileStatusContent = fs.readFileSync(
            path.join(execroot, process.env.BAZEL_VOLATILE_STATUS_FILE),
            "utf-8",
        );
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

function createOutputCapture() {
    const captured: Buffer[] = [];
    const origStdoutWrite = process.stdout.write;
    const origStderrWrite = process.stderr.write;
    process.stdout.write = (chunk: any) => {
        captured.push(Buffer.from(chunk));
        return true;
    };
    process.stderr.write = (chunk: any) => {
        captured.push(Buffer.from(chunk));
        return true;
    };
    return {
        replay() {
            const stderr = origStderrWrite.bind(process.stderr);
            for (const buf of captured) {
                stderr(buf);
            }
        },
        restore() {
            process.stdout.write = origStdoutWrite;
            process.stderr.write = origStderrWrite;
        },
    };
}

function createNoopCapture() {
    return { replay() {}, restore() {} };
}

const output = argv.flags.verbose ? createNoopCapture() : createOutputCapture();

try {
    await createVSIX({
        cwd: inDir,
        packagePath: outFile,
        updatePackageJson: false,
        dependencies: false,
        version,
    });
} catch (e) {
    output.replay();
    throw e;
} finally {
    output.restore();
}
