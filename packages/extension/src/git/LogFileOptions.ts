/**
 * Log file options.
 * TODO@eamodio: Move to git.d.ts once we are good with the api
 */

export interface LogFileOptions {
    /** Optional. The maximum number of log entries to retrieve. */
    readonly maxEntries?: number | string;
    /** Optional. The Git sha (hash) to start retrieving log entries from. */
    readonly hash?: string;
    /** Optional. Specifies whether to start retrieving log entries in reverse order. */
    readonly reverse?: boolean;
    readonly sortByAuthorDate?: boolean;
}
