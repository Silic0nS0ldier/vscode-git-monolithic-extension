export type SubjectOptions = {
    readonly root: string;
    readonly dotGit: string;
    /** Debounce/quiet period in milliseconds, equal for every subject. */
    readonly settleMs: number;
    /** Called whenever the subject delivers anything to its consumer. */
    readonly onNotify: () => void;
};

/** A watcher under measurement. Adapters are measured too, as they hold the integration logic. */
export type Subject = {
    /** Consumes notifications already queued. Called only while idle so it does the same work every run. */
    drain(): Promise<void>;
    /** Absolute paths reported since the previous call; a directory covers everything beneath it. */
    takeReported(): ReadonlySet<string>;
    close(): Promise<void>;
};

export type StartSubject = (options: SubjectOptions) => Subject;
