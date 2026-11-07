import test from "ava";
import { createRecordDiscarder } from "./discard.js";

const DIGITS = "1".repeat(40);
const HEX = "a".repeat(40);

function header(hash: string, message: string): string {
    return `${hash}\nAlice\nalice@example.com\n1000000000\n1000000001\n\n${message}\n\0`;
}

const records = [
    `${header(DIGITS, "Change")}\n1\t0\tnew\0 1 file changed, 1 insertion(+)\n`,
    `${header(HEX, "Rename")}\n0\t0\t\0${header(HEX, "Old").slice(0, -1)}\0new\0`,
    header(DIGITS, "Empty"),
    `${header(HEX, "Binary")}\n-\t-\t${header(DIGITS, "Path")} 1 file changed, 0 insertions(+), 0 deletions(-)\n`,
    `${header("b".repeat(64), "Last")}\n2\t3\t${DIGITS}\0 1 file changed, 2 insertions(+), 3 deletions(-)\n`,
];
const output = Buffer.from(records.join(""));

function discard(count: number, chunks: Buffer[]): string {
    const filter = createRecordDiscarder(count);
    return Buffer.concat(chunks.map(chunk => filter(chunk) ?? Buffer.alloc(0))).toString();
}

test("Discarding keeps every record after the requested count", t => {
    for (let count = 0; count <= records.length + 1; count++) {
        t.is(discard(count, [output]), records.slice(count).join(""), `discarding ${count}`);
    }
});

test("Record boundaries are found wherever chunks split the output", t => {
    for (let count = 1; count <= records.length; count++) {
        const expected = records.slice(count).join("");
        for (let split = 0; split <= output.length; split++) {
            t.is(
                discard(count, [output.subarray(0, split), output.subarray(split)]),
                expected,
                `discarding ${count} split at ${split}`,
            );
        }
        const bytes = Array.from(output, byte => Buffer.of(byte));
        t.is(discard(count, bytes), expected, `discarding ${count} one byte at a time`);
    }
});
