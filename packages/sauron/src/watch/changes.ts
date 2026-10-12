import { type AbsolutePath, parent } from "../path.js";

export type ChangeSet = {
    /** Individual paths that changed. */
    readonly paths: ReadonlySet<AbsolutePath>;
    /** Directories where anything beneath may have changed. Never overlaps `paths`. */
    readonly subtrees: ReadonlySet<AbsolutePath>;
};

export type ChangeBuffer = {
    /** Upper bound; entries made redundant by a later subtree are only pruned by {@link take}. */
    readonly size: number;
    addPath(target: AbsolutePath): void;
    addSubtree(dir: AbsolutePath): void;
    /** Returns the accumulated changes and resets the buffer. */
    take(): ChangeSet;
};

/**
 * Accumulates changes with bounded memory. Once a directory has `collapseAt` changed children they are
 * replaced by the directory itself as a subtree.
 */
export function createChangeBuffer(collapseAt: number): ChangeBuffer {
    let paths = new Set<AbsolutePath>();
    let subtrees = new Set<AbsolutePath>();
    let perDirectory = new Map<AbsolutePath, number>();
    /** Length of the shortest subtree; no shorter ancestor needs checking. */
    let shortest = Infinity;

    /** Whether `target` or an ancestor is one of `within`. */
    function isCovered(target: AbsolutePath | null, within: ReadonlySet<AbsolutePath>, minLength: number): boolean {
        for (let current = target; current !== null && current.length >= minLength; current = parent(current)) {
            if (within.has(current)) {
                return true;
            }
        }
        return false;
    }

    function addSubtree(dir: AbsolutePath): void {
        if (subtrees.size === 0 || !isCovered(dir, subtrees, shortest)) {
            subtrees.add(dir);
            shortest = Math.min(shortest, dir.length);
        }
    }

    return {
        get size() {
            return paths.size + subtrees.size;
        },
        addPath(target) {
            if (paths.has(target) || (subtrees.size > 0 && isCovered(target, subtrees, shortest))) {
                return;
            }
            paths.add(target);
            const dir = parent(target);
            if (dir === null) {
                return;
            }
            const count = (perDirectory.get(dir) ?? 0) + 1;
            perDirectory.set(dir, count);
            if (count === collapseAt) {
                addSubtree(dir);
            }
        },
        addSubtree,
        take() {
            const all = subtrees;
            const min = shortest;
            const taken: ChangeSet = all.size === 0 ? { paths, subtrees } : {
                paths: new Set(paths.values().filter(p => !isCovered(p, all, min))),
                subtrees: new Set(all.values().filter(s => !isCovered(parent(s), all, min))),
            };
            paths = new Set();
            subtrees = new Set();
            perDirectory = new Map();
            shortest = Infinity;
            return taken;
        },
    };
}
