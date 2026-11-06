import ignore, { type Ignore } from "ignore";
import type { EntryKind, FileName, RelativePath } from "../path.js";
import type { DirectoryLocation, Ignorer } from "./mod.js";

const GITIGNORE = ".gitignore" as FileName;
const TRIGGERS: ReadonlySet<FileName> = new Set([GITIGNORE]);

type Level = {
    readonly base: RelativePath | null;
    readonly matcher: Ignore;
    /** Segments in each pattern anchored to `base` (one with a `/` other than a trailing one). */
    readonly anchored: ReadonlySet<number>;
    /** Has a pattern with `**`, which may match at any depth. */
    readonly globstar: boolean;
};

function level(base: RelativePath | null, patterns: string): Level {
    const anchored = new Set<number>();
    let globstar = false;
    for (const line of patterns.split(/\r?\n/)) {
        // As git reads it: only trailing spaces are dropped (escaped or not, which cannot add a `/`), and `#` and
        // `!` are special only first.
        let pattern = line.trimEnd();
        if (pattern === "" || pattern.startsWith("#")) {
            continue;
        }
        if (pattern.startsWith("!")) {
            pattern = pattern.slice(1);
        }
        if (pattern.includes("**")) {
            globstar = true;
            continue;
        }
        pattern = pattern.replace(/\/+$/, "");
        if (pattern.includes("/")) {
            anchored.add(pattern.replace(/^\//, "").split("/").length);
        }
    }
    return { base, matcher: ignore().add(patterns), anchored, globstar };
}

export type GitignoreOptions = {
    /** Root level patterns, e.g. from `.git/info/exclude` or `core.excludesFile`. */
    readonly patterns?: readonly string[];
};

/**
 * Honours `.gitignore` files at every level, with deeper files taking precedence (including `!` negation).
 *
 * Git keeps reporting changes to tracked files that match an ignore pattern. Those changes are missed here.
 */
export function gitignore(options: GitignoreOptions = {}): Ignorer {
    const patterns = options.patterns ?? [];
    return createScope(patterns.length > 0 ? [level(null, patterns.join("\n"))] : []);
}

function createScope(levels: readonly Level[]): Ignorer {
    const scope: Ignorer = {
        triggers: TRIGGERS,
        async visit(dir) {
            let current = levels;
            if (dir.entries.get(GITIGNORE) === "file") {
                const text = await dir.readText(GITIGNORE);
                if (text !== null && text.trim() !== "") {
                    current = [...levels, level(dir.relative, text)];
                }
            }
            const ignored = new Set<FileName>();
            if (current.length > 0) {
                for (const [name, kind] of dir.entries) {
                    if (isIgnored(current, dir.relative, name, kind)) {
                        ignored.add(name);
                    }
                }
            }
            return current === levels ? { ignored } : { ignored, child: createScope(current) };
        },
        relocatable: (from, to) => levels.every(l => isRelocatable(l, from) && isRelocatable(l, to)),
    };
    return scope;
}

/**
 * Whether `level` decides the same for the entries of a directory at `dir` as wherever it moved from. That holds
 * when the level is above it, and no pattern can match there: none is anchored at the depth of its entries, and
 * none ignores the directory itself (`ignore` checks parents first, so that covers each one above it).
 */
function isRelocatable(level: Level, dir: DirectoryLocation): boolean {
    if (level.globstar || dir.relative === null) {
        return false;
    }
    // A level from a `.gitignore` within the moved directory has its old path as `base`.
    const relative = level.base === null
        ? dir.relative
        : dir.relative.startsWith(level.base + "/")
        ? dir.relative.slice(level.base.length + 1)
        : null;
    if (relative === null) {
        return false;
    }
    const depth = relative.split("/").length;
    return !level.anchored.has(depth + 1) && !level.matcher.test(relative + "/").ignored;
}

function isIgnored(levels: readonly Level[], dir: RelativePath | null, name: FileName, kind: EntryKind): boolean {
    const target = dir === null ? name : `${dir}/${name}`;
    const suffix = kind === "directory" ? "/" : "";
    let ignored = false;
    for (const { base, matcher } of levels) {
        const relative = base === null ? target : target.slice(base.length + 1);
        const result = matcher.test(relative + suffix);
        if (result.ignored) {
            ignored = true;
        } else if (result.unignored) {
            ignored = false;
        }
    }
    return ignored;
}
