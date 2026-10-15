import ignore, { type Ignore } from "ignore";
import type { EntryKind, FileName, RelativePath } from "../path.js";
import type { Ignorer } from "./mod.js";

const GITIGNORE = ".gitignore" as FileName;
const TRIGGERS: ReadonlySet<FileName> = new Set([GITIGNORE]);

type Level = {
    readonly base: RelativePath | null;
    readonly matcher: Ignore;
};

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
    return createScope(patterns.length > 0 ? [{ base: null, matcher: ignore().add(patterns) }] : []);
}

function createScope(levels: readonly Level[]): Ignorer {
    const scope: Ignorer = {
        triggers: TRIGGERS,
        async visit(dir) {
            let current = levels;
            if (dir.entries.get(GITIGNORE) === "file") {
                const text = await dir.readText(GITIGNORE);
                if (text !== null && text.trim() !== "") {
                    current = [...levels, { base: dir.relative, matcher: ignore().add(text) }];
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
    };
    return scope;
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
