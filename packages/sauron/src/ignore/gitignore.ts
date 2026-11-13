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
    /** Has a `!` pattern, which may re-include a directory a level above excluded. */
    readonly negates: boolean;
};

function level(base: RelativePath | null, patterns: string): Level {
    const anchored = new Set<number>();
    let globstar = false;
    let negates = false;
    for (const line of patterns.split(/\r?\n/)) {
        // As git reads it: only trailing spaces are dropped (escaped or not, which cannot add a `/`), and `#` and
        // `!` are special only first.
        let pattern = line.trimEnd();
        if (pattern === "" || pattern.startsWith("#")) {
            continue;
        }
        if (pattern.startsWith("!")) {
            negates = true;
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
    return { base, matcher: ignore().add(patterns), anchored, globstar, negates };
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
    // Whether a level may re-include a directory one above it excluded (see `entryMatchers`).
    const reincludes = levels.some((l, i) => i > 0 && l.negates);
    const scope: Ignorer = {
        triggers: TRIGGERS,
        async visit(dir) {
            let current = levels;
            let reincluding = reincludes;
            if (dir.entries.get(GITIGNORE) === "file") {
                const text = await dir.readText(GITIGNORE);
                if (text !== null && text.trim() !== "") {
                    const added = level(dir.relative, text);
                    current = [...levels, added];
                    reincluding ||= levels.length > 0 && added.negates;
                }
            }
            const ignored = new Set<FileName>();
            if (current.length > 0) {
                const matchers = reincluding ? entryMatchers(current, dir.relative) : null;
                for (const [name, kind] of dir.entries) {
                    if (isIgnored(current, matchers, dir.relative, name, kind)) {
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

/**
 * Matchers that decide the entries of `dir` by each level's patterns alone, as git does, or `null` if every level's
 * own matcher does. `ignore` also checks each directory above an entry, so a level that excludes `dir` or one above
 * it would exclude every entry. That needs a deeper level to have re-included it (or `dir` would not be visited),
 * so only levels above one with a `!` pattern are checked. A copy that re-includes each of those directories keeps
 * the level to the entry.
 */
function entryMatchers(levels: readonly Level[], dir: RelativePath | null): Ignore[] | null {
    let matchers: Ignore[] | null = null;
    let negatedBelow = false;
    for (let i = levels.length - 1; i >= 0; i--) {
        const { base, matcher, negates } = levels[i]!;
        const relative = dir === null ? "" : base === null ? dir : dir.slice(base.length + 1);
        if (negatedBelow && relative !== "" && matcher.test(relative + "/").ignored) {
            const segments = relative.split("/").map(escape);
            const reincluded = segments.map((_, j) => `!/${segments.slice(0, j + 1).join("/")}/`);
            matchers ??= levels.map(l => l.matcher);
            matchers[i] = ignore().add(matcher).add(reincluded);
        }
        negatedBelow ||= negates;
    }
    return matchers;
}

/** Makes a file name match only itself in a pattern. */
function escape(name: string): string {
    return name.replace(/[\\*?[\]]/g, "\\$&");
}

function isIgnored(
    levels: readonly Level[],
    matchers: readonly Ignore[] | null,
    dir: RelativePath | null,
    name: FileName,
    kind: EntryKind,
): boolean {
    const target = dir === null ? name : `${dir}/${name}`;
    const suffix = kind === "directory" ? "/" : "";
    let ignored = false;
    for (let i = 0; i < levels.length; i++) {
        const { base, matcher } = levels[i]!;
        const relative = base === null ? target : target.slice(base.length + 1);
        const result = (matchers?.[i] ?? matcher).test(relative + suffix);
        if (result.ignored) {
            ignored = true;
        } else if (result.unignored) {
            ignored = false;
        }
    }
    return ignored;
}
