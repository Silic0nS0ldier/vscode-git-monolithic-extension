import fs from "node:fs";
import path from "node:path";

/** Patterns that mean the same thing whether or not matching knows an entry is a directory. */
const GITIGNORE = "node_modules\n*.log\n/build\n";
const FAN_OUT = 6;
const DEPTH = 4;
const FILES_PER_DIR = 8;

export type Fixture = {
    readonly root: string;
    readonly dotGit: string;
};

export type Phase = {
    readonly name: string;
    /** Synchronous, so the kernel queues every resulting event before the watcher reads any. */
    readonly mutate: (root: string) => void;
    /** Must be reported (directly, or via an ancestor) for the run to be valid. */
    readonly expect: string;
};

function writeFiles(dir: string, count: number, prefix = "f", extension = ".ts"): void {
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < count; i++) {
        fs.writeFileSync(path.join(dir, `${prefix}${i}${extension}`), `export const v = ${i};\n`);
    }
}

function writeTree(dir: string, depth: number): void {
    writeFiles(dir, FILES_PER_DIR);
    fs.writeFileSync(path.join(dir, "debug.log"), "ignored\n");
    if (depth === 0) {
        return;
    }
    for (let i = 0; i < FAN_OUT; i++) {
        writeTree(path.join(dir, `d${i}`), depth - 1);
    }
}

/**
 * Creates the same tree every time: 1,556 watched directories holding ~12,400 files, plus ignored
 * content (`.git`, `node_modules`, `build`, `*.log`) that a watcher should skip.
 */
export function createFixture(root: string): Fixture {
    fs.rmSync(root, { recursive: true, force: true });
    const dotGit = path.join(root, ".git");
    writeFiles(dotGit, 3, "file", "");
    for (let i = 0; i < 16; i++) {
        writeFiles(path.join(dotGit, "objects", i.toString(16).padStart(2, "0")), 4, "obj", "");
    }
    fs.writeFileSync(path.join(root, ".gitignore"), GITIGNORE);
    for (let i = 0; i < 50; i++) {
        writeFiles(path.join(root, "node_modules", `pkg${i}`, "lib"), 5, "m", ".js");
    }
    for (let i = 0; i < 20; i++) {
        writeFiles(path.join(root, "build", `out${i}`), 10, "o", ".js");
    }
    writeTree(path.join(root, "src"), DEPTH);
    return { root: fs.realpathSync(root), dotGit: fs.realpathSync(dotGit) };
}

export const PHASES: readonly Phase[] = [
    {
        name: "edit",
        mutate: root => fs.writeFileSync(path.join(root, "src/d0/d0/f0.ts"), "export const v = -1;\n"),
        expect: "src/d0/d0/f0.ts",
    },
    {
        // Shaped like a branch switch: new files, modified files, and noise in ignored locations.
        name: "burst",
        mutate: root => {
            for (let i = 0; i < 4; i++) {
                writeFiles(path.join(root, `src/d1/d${i}`), 100, "new");
            }
            for (let i = 0; i < 50; i++) {
                const dir = path.join(root, `src/d3/d${i % FAN_OUT}/d${Math.floor(i / FAN_OUT) % FAN_OUT}`);
                for (let j = 0; j < FILES_PER_DIR; j++) {
                    fs.writeFileSync(path.join(dir, `f${j}.ts`), `export const v = ${-i};\n`);
                }
            }
            writeFiles(path.join(root, "src/d4"), 100, "noise", ".log");
            writeFiles(path.join(root, "node_modules/pkg0"), 100, "noise", ".js");
        },
        expect: "src/d1/d0/new0.ts",
    },
    {
        name: "add-tree",
        mutate: root => {
            for (let i = 0; i < 5; i++) {
                for (let j = 0; j < 5; j++) {
                    writeFiles(path.join(root, `src/new/n${i}/n${j}`), 4);
                }
            }
        },
        expect: "src/new/n0/n0/f0.ts",
    },
    {
        name: "remove-tree",
        mutate: root => fs.rmSync(path.join(root, "src/d2"), { recursive: true }),
        expect: "src/d2",
    },
];
