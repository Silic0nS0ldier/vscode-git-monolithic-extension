/**
 * Maximum combined length (in characters) of variable arguments to pass to a
 * single git invocation.
 *
 * Sized to stay well under the Windows `CreateProcess` command-line limit of
 * 32767 characters, leaving headroom for the git binary path, the fixed
 * arguments (subcommand, flags), environment inheritance, and any per-arg
 * quoting overhead.
 */
const MAX_CLI_LENGTH = 30000;

/**
 * Splits `values` into successive chunks whose combined character length does
 * not exceed `maxChunkLength`.
 *
 * A single value longer than `maxChunkLength` is emitted on its own — the
 * caller is responsible for deciding what to do with it (typically, let the
 * underlying process fail with a clear error).
 */
export function* splitInChunks(
    values: readonly string[],
    maxChunkLength: number = MAX_CLI_LENGTH,
): IterableIterator<string[]> {
    let current: string[] = [];
    let length = 0;

    for (const value of values) {
        let newLength = length + value.length;

        if (newLength > maxChunkLength && current.length > 0) {
            yield current;
            current = [];
            newLength = value.length;
        }

        current.push(value);
        length = newLength;
    }

    if (current.length > 0) {
        yield current;
    }
}
