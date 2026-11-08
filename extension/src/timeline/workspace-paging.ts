import path from "node:path";
import { throttle } from "../util/throttle.js";
import { orderedTimestamp } from "./paging.js";

const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const MAX_CONCURRENT_LOGS = 4;

type WorkspaceRevision = { root: string; tip: string; instance: string };
export type WorkspaceSnapshot = WorkspaceRevision & {
    commonDir: string;
    objectsDir: string;
    isolationRoot?: string;
};
export type WorkspaceHistory = {
    commonDir: string;
    objectsDir: string;
    isolationRoot?: string;
    repositories: WorkspaceRevision[];
    skip: number;
};
export type WorkspaceCursor = { histories: WorkspaceHistory[]; before: number };

export function usesWorktreeRelativeHistory(env: Readonly<Record<string, string | undefined>>): boolean {
    const alternates = env["GIT_ALTERNATE_OBJECT_DIRECTORIES"];
    return (alternates !== undefined && alternates.split(path.delimiter).some(entry => !path.isAbsolute(entry)))
        || [env["GIT_SHALLOW_FILE"], env["GIT_GRAFT_FILE"]].some(value =>
            value !== undefined && !path.isAbsolute(value)
        );
}

export function groupWorkspaceHistories(repositories: readonly WorkspaceSnapshot[]): WorkspaceHistory[] {
    const groups = new Map<string, WorkspaceHistory>();
    for (const { commonDir, objectsDir, isolationRoot, root, tip, instance } of repositories) {
        const key = JSON.stringify([commonDir, objectsDir, isolationRoot]);
        let history = groups.get(key);
        if (!history) {
            history = {
                commonDir,
                objectsDir,
                ...(isolationRoot === undefined ? {} : { isolationRoot }),
                repositories: [],
                skip: 0,
            };
            groups.set(key, history);
        }
        history.repositories.push({ root, tip, instance });
    }
    return [...groups.values()];
}

export function workspaceRepository(
    history: WorkspaceHistory,
    commit: { hash: string; source: string },
): string {
    const revision = history.repositories.find(({ tip }) => tip === commit.hash)
        ?? history.repositories.find(({ tip }) => tip === commit.source);
    if (!revision) throw new Error("Unknown workspace Timeline traversal source");
    return revision.root;
}

export function validateWorkspaceRepositories(
    histories: readonly WorkspaceHistory[],
    activeRepositories: ReadonlyMap<string, string>,
): void {
    for (const history of histories) {
        for (const { root, instance } of history.repositories) {
            const active = activeRepositories.get(root);
            if (active === undefined) {
                throw new Error("Workspace Timeline repository was closed; refresh the history");
            }
            if (active !== instance) throw new Error("Workspace Timeline repository changed; refresh the history");
        }
    }
}

export async function readWorkspaceTimelinePage<T>(
    histories: readonly WorkspaceHistory[],
    limit: number,
    read: (history: WorkspaceHistory, maxEntries: number) => Promise<readonly T[]>,
    timestamp: (commit: T, history: WorkspaceHistory) => number,
): Promise<{ page: { history: WorkspaceHistory; commit: T }[]; histories: WorkspaceHistory[] | undefined }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(limit + 1)) {
        throw new Error("Invalid workspace Timeline page size");
    }
    const readLimited = throttle(MAX_CONCURRENT_LOGS, read);
    const windows = await Promise.all(histories.map(async history => ({
        history,
        commits: await readLimited(history, limit + 1),
        position: 0,
    })));
    const page: { history: WorkspaceHistory; commit: T }[] = [];
    while (page.length < limit) {
        let next: { window: typeof windows[number]; commit: T; date: number } | undefined;
        for (const window of windows) {
            const commit = window.commits[window.position];
            if (commit === undefined) continue;
            const date = orderedTimestamp(timestamp(commit, window.history));
            if (!next || date > next.date) next = { window, commit, date };
        }
        if (!next) break;
        next.window.position++;
        page.push({ history: next.window.history, commit: next.commit });
    }
    const remaining = windows.filter(window => window.position < window.commits.length).map(window => {
        const skip = window.history.skip + window.position;
        if (!Number.isSafeInteger(skip)) throw new Error("Invalid workspace Timeline offset");
        return { ...window.history, skip };
    });
    return { page, histories: remaining.length ? remaining : undefined };
}

export function parseWorkspaceCursor(cursor: string): WorkspaceCursor {
    const parsed: unknown = JSON.parse(cursor);
    if (
        !parsed || typeof parsed !== "object" || !("histories" in parsed) || !Array.isArray(parsed.histories)
        || !parsed.histories.length || !("before" in parsed) || typeof parsed.before !== "number"
    ) {
        throw new Error("Invalid workspace Timeline cursor");
    }
    orderedTimestamp(parsed.before);
    const roots = new Set<string>();
    const layouts = new Set<string>();
    const histories: WorkspaceHistory[] = [];
    for (const value of parsed.histories) {
        if (
            !value || typeof value !== "object" || !("commonDir" in value) || typeof value.commonDir !== "string"
            || !value.commonDir || !("objectsDir" in value) || typeof value.objectsDir !== "string"
            || !value.objectsDir
            || !("skip" in value) || typeof value.skip !== "number" || !Number.isSafeInteger(value.skip)
            || value.skip < 0 || !("repositories" in value) || !Array.isArray(value.repositories)
            || !value.repositories.length
        ) {
            throw new Error("Invalid workspace Timeline cursor");
        }
        const isolationRoot = "isolationRoot" in value ? value.isolationRoot : undefined;
        if (isolationRoot !== undefined && (typeof isolationRoot !== "string" || !isolationRoot)) {
            throw new Error("Invalid workspace Timeline cursor");
        }
        const layout = JSON.stringify([value.commonDir, value.objectsDir, isolationRoot]);
        if (layouts.has(layout)) throw new Error("Invalid workspace Timeline cursor");
        layouts.add(layout);
        const repositories: WorkspaceRevision[] = [];
        for (const revision of value.repositories) {
            if (
                !revision || typeof revision !== "object" || !("root" in revision) || typeof revision.root !== "string"
                || !revision.root || roots.has(revision.root) || !("tip" in revision)
                || typeof revision.tip !== "string" || !HASH.test(revision.tip) || !("instance" in revision)
                || typeof revision.instance !== "string" || !revision.instance
            ) {
                throw new Error("Invalid workspace Timeline cursor");
            }
            roots.add(revision.root);
            repositories.push({ root: revision.root, tip: revision.tip, instance: revision.instance });
        }
        if (isolationRoot && (repositories.length !== 1 || repositories[0]?.root !== isolationRoot)) {
            throw new Error("Invalid workspace Timeline cursor");
        }
        histories.push({
            commonDir: value.commonDir,
            objectsDir: value.objectsDir,
            ...(isolationRoot === undefined ? {} : { isolationRoot }),
            repositories,
            skip: value.skip,
        });
    }
    return { histories, before: parsed.before };
}
