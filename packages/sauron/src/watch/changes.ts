import { type AbsolutePath, isWithin, parent } from "../path.js";

export type ChangeSet = {
    /** Individual paths that changed. */
    readonly paths: ReadonlySet<AbsolutePath>;
    /** Directories where anything beneath may have changed. Never overlaps `paths`. */
    readonly subtrees: ReadonlySet<AbsolutePath>;
};

export type ChangeBuffer = {
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

    function isCovered(target: AbsolutePath): boolean {
        for (let current: AbsolutePath | null = target; current !== null; current = parent(current)) {
            if (subtrees.has(current)) {
                return true;
            }
        }
        return false;
    }

    function addSubtree(dir: AbsolutePath): void {
        if (isCovered(dir)) {
            return;
        }
        for (const p of paths) {
            if (p === dir || isWithin(p, dir)) {
                paths.delete(p);
            }
        }
        for (const s of subtrees) {
            if (isWithin(s, dir)) {
                subtrees.delete(s);
            }
        }
        for (const d of perDirectory.keys()) {
            if (d === dir || isWithin(d, dir)) {
                perDirectory.delete(d);
            }
        }
        subtrees.add(dir);
    }

    return {
        get size() {
            return paths.size + subtrees.size;
        },
        addPath(target) {
            if (paths.has(target) || isCovered(target)) {
                return;
            }
            paths.add(target);
            const dir = parent(target);
            if (dir === null) {
                return;
            }
            const count = (perDirectory.get(dir) ?? 0) + 1;
            perDirectory.set(dir, count);
            if (count >= collapseAt) {
                addSubtree(dir);
            }
        },
        addSubtree,
        take() {
            const taken = { paths, subtrees };
            paths = new Set();
            subtrees = new Set();
            perDirectory = new Map();
            return taken;
        },
    };
}
