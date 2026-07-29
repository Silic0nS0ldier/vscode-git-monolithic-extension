import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export async function grep(filename: string, pattern: RegExp): Promise<boolean> {
    const rl = createInterface({
        input: createReadStream(filename, { encoding: "utf8" }),
        crlfDelay: Infinity,
    });
    for await (const line of rl) {
        if (pattern.test(line)) return true;
    }
    return false;
}
