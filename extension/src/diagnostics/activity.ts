export type DiagnosticOutcome = "succeeded" | "failed";

export interface DiagnosticActivity {
    readonly durationMs: number;
    readonly id: number;
    readonly kind: "git" | "operation";
    readonly label: string;
    readonly outcome?: DiagnosticOutcome;
    readonly pid?: number;
    readonly repository?: string;
    readonly startedAt: number;
}

export interface DiagnosticActivitySnapshot {
    readonly active: readonly DiagnosticActivity[];
    readonly recent: readonly DiagnosticActivity[];
}

export interface DiagnosticActivityHandle {
    finish(outcome: DiagnosticOutcome): void;
    setPid(pid: number): void;
}

interface MutableDiagnosticActivity {
    durationMs?: number;
    readonly id: number;
    readonly kind: "git" | "operation";
    readonly label: string;
    outcome?: DiagnosticOutcome;
    pid?: number;
    readonly repository?: string;
    readonly startedAt: number;
}

export interface DiagnosticActivityRecorder {
    beginGitInvocation(
        repositoryPath: string | undefined,
        invocationId: string,
        command: string,
    ): DiagnosticActivityHandle;
    beginOperation(repositoryPath: string, operation: string): DiagnosticActivityHandle;
    clear(): void;
    repositoryLabel(repositoryPath: string): string;
    snapshot(): DiagnosticActivitySnapshot;
}

function safeLabel(value: string): string {
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(value) ? value : "unknown";
}

const GIT_COMMANDS = new Set([
    "add",
    "branch",
    "cat-file",
    "check-ignore",
    "checkout",
    "cherry",
    "cherry-pick",
    "clean",
    "clone",
    "commit",
    "config",
    "diff",
    "diff-files",
    "fetch",
    "for-each-ref",
    "hash-object",
    "init",
    "log",
    "ls-files",
    "ls-tree",
    "merge",
    "mv",
    "pull",
    "push",
    "rebase",
    "remote",
    "reset",
    "rev-list",
    "rev-parse",
    "rm",
    "show",
    "stash",
    "status",
    "submodule",
    "symbolic-ref",
    "tag",
    "update-ref",
    "update-index",
    "version",
]);

const REPOSITORY_CAPACITY = 64;

export function diagnosticGitCommand(args: readonly string[]): string {
    return args.find(arg => GIT_COMMANDS.has(arg)) ?? "unknown";
}

export function createActivityRecorder(
    capacity = 200,
    now: () => number = Date.now,
): DiagnosticActivityRecorder {
    const historyCapacity = Math.max(0, Math.floor(capacity));
    const active = new Map<number, MutableDiagnosticActivity>();
    const recent: DiagnosticActivity[] = [];
    const repositories = new Map<string, string>();
    let nextId = 0;
    let nextRepositoryId = 0;

    function repositoryLabel(repositoryPath: string): string {
        let label = repositories.get(repositoryPath);
        if (label === undefined) {
            const oldest = repositories.keys().next().value;
            if (repositories.size >= REPOSITORY_CAPACITY && oldest !== undefined) {
                repositories.delete(oldest);
            }
            label = `repository-${++nextRepositoryId}`;
            repositories.set(repositoryPath, label);
        }
        return label;
    }

    function begin(activity: Omit<MutableDiagnosticActivity, "id" | "startedAt">): DiagnosticActivityHandle {
        const mutable: MutableDiagnosticActivity = {
            ...activity,
            id: nextId++,
            startedAt: now(),
        };
        const oldest = active.keys().next().value;
        if (active.size >= Math.max(1, historyCapacity) && oldest !== undefined) {
            active.delete(oldest);
        }
        active.set(mutable.id, mutable);

        let finished = false;
        return {
            finish(outcome) {
                if (finished) return;
                finished = true;
                active.delete(mutable.id);
                recent.push({
                    ...mutable,
                    durationMs: Math.max(0, now() - mutable.startedAt),
                    outcome,
                });
                if (recent.length > historyCapacity) {
                    recent.splice(0, recent.length - historyCapacity);
                }
            },
            setPid(pid) {
                if (!finished) mutable.pid = pid;
            },
        };
    }

    function snapshotActivity(activity: MutableDiagnosticActivity): DiagnosticActivity {
        return {
            ...activity,
            durationMs: activity.durationMs ?? Math.max(0, now() - activity.startedAt),
        };
    }

    return {
        beginGitInvocation(repositoryPath, invocationId, command) {
            return begin({
                kind: "git",
                label: `${safeLabel(invocationId)}:${safeLabel(command)}`,
                ...repositoryPath === undefined ? {} : { repository: repositoryLabel(repositoryPath) },
            });
        },
        beginOperation(repositoryPath, operation) {
            return begin({
                kind: "operation",
                label: safeLabel(operation),
                repository: repositoryLabel(repositoryPath),
            });
        },
        clear() {
            active.clear();
            recent.splice(0);
            repositories.clear();
            nextId = 0;
            nextRepositoryId = 0;
        },
        repositoryLabel,
        snapshot() {
            return {
                active: [...active.values()].map(snapshotActivity),
                recent: [...recent],
            };
        },
    };
}

export const diagnosticActivity = createActivityRecorder();
