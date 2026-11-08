const NUL = 0x00;
const TAB = 0x09;
const LF = 0x0a;
const SPACE = 0x20;
const DASH = 0x2d;

type State =
    /** Between fields, where a numstat entry, a shortstat line or the next record may start. */
    | "between"
    /** The first numstat count, which may instead turn out to be a hash made of digits. */
    | "added"
    | "deleted"
    | "after-counts"
    | "rename-from"
    | "path"
    | "shortstat"
    | "header";

function isDigit(byte: number): boolean {
    return byte >= 0x30 && byte <= 0x39;
}

/**
 * Drops the first `count` records of `log -z` output in `COMMIT_FORMAT` as it streams, so they never need buffering.
 *
 * A record is a NUL terminated header, then any `--numstat` entries (`added\tdeleted\tpath\0`, or
 * `added\tdeleted\t\0from\0to\0` for a rename), then any `--shortstat` line. The next header follows with no
 * separator, so record boundaries are found by walking those fields rather than by searching for header-shaped text,
 * which filenames can contain.
 *
 * The returned filter keeps the part of each chunk that belongs to kept records, which is every byte once the first
 * kept record has started.
 */
export function createRecordDiscarder(count: number): (chunk: Buffer) => Buffer | undefined {
    let remaining = count;
    let state: State = "between";
    let keeping = remaining === 0;
    // Bytes of a leading run of digits, which only the byte after them identifies as a numstat count or a hash.
    let carry: Buffer | undefined;

    return chunk => {
        if (keeping) return chunk;
        const data = carry ? Buffer.concat([carry, chunk]) : chunk;
        carry = undefined;
        let runStart = 0;
        for (let index = 0; index < data.length; index++) {
            const byte = data[index]!;
            switch (state) {
                case "between":
                    if (byte === LF) break;
                    if (byte === SPACE) {
                        state = "shortstat";
                        break;
                    }
                    if (byte === DASH || isDigit(byte)) {
                        runStart = index;
                        state = "added";
                        break;
                    }
                    if (remaining === 0) {
                        keeping = true;
                        return data.subarray(index);
                    }
                    remaining--;
                    state = "header";
                    break;
                case "added":
                    if (byte === TAB) {
                        state = "deleted";
                    } else if (!isDigit(byte) && byte !== DASH) {
                        if (remaining === 0) {
                            keeping = true;
                            return data.subarray(runStart);
                        }
                        remaining--;
                        state = byte === NUL ? "between" : "header";
                    }
                    break;
                case "deleted":
                    if (byte === TAB) state = "after-counts";
                    break;
                case "after-counts":
                    state = byte === NUL ? "rename-from" : "path";
                    break;
                case "rename-from":
                    if (byte === NUL) state = "path";
                    break;
                case "path":
                case "header":
                    if (byte === NUL) state = "between";
                    break;
                case "shortstat":
                    if (byte === LF) state = "between";
                    break;
            }
        }
        if (state === "added") {
            carry = Buffer.from(data.subarray(runStart));
            state = "between";
        }
        return undefined;
    };
}
