export const SUBJECTS = ["sauron", "watcher"] as const;
export type SubjectName = (typeof SUBJECTS)[number];

/** `counts` collects fs calls, coverage and inotify watches. `heap` runs without coverage, which allocates. */
export const MODES = ["counts", "heap"] as const;
export type Mode = (typeof MODES)[number];

/** Phase name → metric name → value. */
export type Metrics = Record<string, Record<string, number>>;

export type ChildOutput = {
    readonly metrics: Metrics;
    /** Informational only, never compared. */
    readonly info: Record<string, number>;
    readonly problems: readonly string[];
};
