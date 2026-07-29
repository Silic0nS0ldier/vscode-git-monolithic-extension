export function* splitInChunks(array: string[], maxChunkLength: number): IterableIterator<string[]> {
    let current: string[] = [];
    let length = 0;

    for (const value of array) {
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
