import test from "ava";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grep } from "./grep.js";

async function withTempFile(
    contents: string,
    body: (path: string) => Promise<void>,
): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "grep-test-"));
    const file = join(dir, "input.txt");
    await writeFile(file, contents);
    try {
        await body(file);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

test("returns true when the pattern matches a line", async t => {
    await withTempFile("alpha\nbeta\ngamma\n", async file => {
        t.true(await grep(file, /beta/));
    });
});

test("returns false when the pattern matches nothing", async t => {
    await withTempFile("alpha\nbeta\ngamma\n", async file => {
        t.false(await grep(file, /delta/));
    });
});

test("returns false for an empty file", async t => {
    await withTempFile("", async file => {
        t.false(await grep(file, /./));
    });
});

test("matches the first line", async t => {
    await withTempFile("first\nsecond\nthird\n", async file => {
        t.true(await grep(file, /^first$/));
    });
});

test("matches the last line", async t => {
    await withTempFile("first\nsecond\nthird\n", async file => {
        t.true(await grep(file, /^third$/));
    });
});

test("matches a line with no trailing newline", async t => {
    await withTempFile("only-line", async file => {
        t.true(await grep(file, /only-line/));
    });
});

test("strips CRLF line endings so anchors match", async t => {
    // If the reader kept the trailing \r, /^middle$/ would fail. crlfDelay:
    // Infinity in createInterface is what makes this work.
    await withTempFile("first\r\nmiddle\r\nlast\r\n", async file => {
        t.true(await grep(file, /^middle$/));
    });
});

test("tests the pattern per-line, not against the whole file", async t => {
    // "alpha" and "gamma" live on different lines; a pattern requiring them on
    // the same line must not match.
    await withTempFile("alpha\ngamma\n", async file => {
        t.false(await grep(file, /alpha.*gamma/));
    });
});

test("rejects when the file does not exist", async t => {
    const missing = join(tmpdir(), "grep-test-does-not-exist-xyz", "nope.txt");
    await t.throwsAsync(grep(missing, /./), { code: "ENOENT" });
});
