import { type AbsolutePath, type EntryKind, type FileName, join, parent, type RelativePath } from "../path.js";

export type DirectoryLocation = {
    readonly path: AbsolutePath;
    /** `null` for a watch root. */
    readonly relative: RelativePath | null;
};

/** A directory being crawled. */
export type DirectoryVisit = DirectoryLocation & {
    readonly entries: ReadonlyMap<FileName, EntryKind>;
    /** Reads an entry of this directory as UTF-8. `null` if missing, unreadable or not a regular file. */
    readText(name: FileName): Promise<string | null>;
    readonly signal: AbortSignal;
};

export type IgnoreScope = {
    /** Entries to skip. Ignored directories are neither watched nor descended into. */
    readonly ignored: ReadonlySet<FileName>;
    /** Ignorer for subdirectories. Omit to reuse the current one. */
    readonly child?: Ignorer;
};

/**
 * Decides what to skip, one directory at a time. Scopes chain from parent to child, which mirrors how
 * nested `.gitignore` files apply. May throw; failures are reported and treated as "ignore nothing".
 */
export type Ignorer = {
    /** Entries whose change invalidates decisions for the visited directory's subtree. */
    readonly triggers?: ReadonlySet<FileName>;
    visit(dir: DirectoryVisit): IgnoreScope | Promise<IgnoreScope>;
    /**
     * Whether visiting a directory moved from `from` to `to` would give the same result, given the same entries,
     * and whether the child ignorer it returned still applies there. A moved directory then keeps its watches
     * without being visited again. Without it, a moved directory is visited again (but not listed again).
     */
    relocatable?(from: DirectoryLocation, to: DirectoryLocation): boolean;
};

const EMPTY: ReadonlySet<FileName> = new Set();

export const ignoreNothing: Ignorer = { visit: () => ({ ignored: EMPTY }), relocatable: () => true };

/** Ignores an entry if any source does. */
export function ignoreAll(...sources: readonly Ignorer[]): Ignorer {
    if (sources.length === 0) {
        return ignoreNothing;
    }
    if (sources.length === 1) {
        return sources[0]!;
    }
    const triggers = sources.reduce<ReadonlySet<FileName>>((all, s) => all.union(s.triggers ?? EMPTY), EMPTY);
    return {
        triggers,
        async visit(dir) {
            const scopes = await Promise.all(sources.map(s => s.visit(dir)));
            const ignored = scopes.reduce<ReadonlySet<FileName>>((all, s) => all.union(s.ignored), EMPTY);
            const children = scopes.map((s, i) => s.child ?? sources[i]!);
            const unchanged = children.every((c, i) => c === sources[i]);
            return unchanged ? { ignored } : { ignored, child: ignoreAll(...children) };
        },
        relocatable: (from, to) => sources.every(s => s.relocatable?.(from, to) ?? false),
    };
}

/** Ignores exact paths, such as the `.git` directory. */
export function ignorePaths(paths: Iterable<AbsolutePath>): Ignorer {
    const set = new Set(paths);
    return {
        visit(dir) {
            const ignored = new Set(dir.entries.keys().filter(name => set.has(join(dir.path, name))));
            return { ignored };
        },
        relocatable: (from, to) => !set.values().some(p => parent(p) === from.path || parent(p) === to.path),
    };
}
