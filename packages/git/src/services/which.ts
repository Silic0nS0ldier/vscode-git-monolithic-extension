import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { isWindows } from "../helpers/platform-matchers.js";

const DEFAULT_PATH_EXT = ".EXE;.CMD;.BAT;.COM";

/**
 * Finds the first executable named `cmd` in the `path` directories, or `null` if there is none.
 * Mirrors the asynchronous lookup of the `which` package, without its synchronous half and the
 * CommonJS `isexe` build it drags into the bundle.
 */
export async function which(cmd: string, options: { path: string; pathExt?: string }): Promise<string | null> {
    const windows = isWindows(process.platform);
    const dirs = options.path.split(delimiter);
    let extensions = [""];
    let pathExt: string[] = [];

    if (windows) {
        // Windows searches the current directory before `PATH`.
        dirs.unshift(process.cwd());
        pathExt = (options.pathExt || DEFAULT_PATH_EXT).split(delimiter).map(ext => ext.toLowerCase());
        extensions = pathExt.flatMap(ext => [ext.toUpperCase(), ext]);
        if (cmd.includes(".") && extensions[0] !== "") {
            extensions.unshift("");
        }
    }

    for (const dir of dirs) {
        const base = join(/^".*"$/.test(dir) ? dir.slice(1, -1) : dir, cmd);
        for (const ext of extensions) {
            const candidate = base + ext;
            if (await (windows ? isWindowsExecutable(candidate, pathExt) : isPosixExecutable(candidate))) {
                return candidate;
            }
        }
    }

    return null;
}

async function isPosixExecutable(path: string): Promise<boolean> {
    try {
        if (!(await stat(path)).isFile()) {
            return false;
        }
        await access(path, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

async function isWindowsExecutable(path: string, pathExt: string[]): Promise<boolean> {
    try {
        if (!(await stat(path)).isFile()) {
            return false;
        }
    } catch {
        return false;
    }
    const lowerPath = path.toLowerCase();
    return pathExt.some(ext => ext === "" || lowerPath.endsWith(ext));
}
