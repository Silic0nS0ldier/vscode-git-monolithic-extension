/**
 * A span of a file. Offsets are UTF-16 code units (as in JS strings and the VSCode/LSP APIs), `end` is exclusive.
 * `line` and `column` are 1-based and describe `start`, for human-readable output.
 */
export interface Location {
    readonly file: string;
    readonly start: number;
    readonly end: number;
    readonly line: number;
    readonly column: number;
}

export type Locate = (start: number, end: number) => Location;

export function createLocator(file: string, text: string): Locate {
    const lineStarts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "\n") {
            lineStarts.push(i + 1);
        }
    }

    return (start, end) => {
        let low = 0;
        let high = lineStarts.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (lineStarts[mid]! <= start) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        return { file, start, end, line: low + 1, column: start - lineStarts[low]! + 1 };
    };
}
