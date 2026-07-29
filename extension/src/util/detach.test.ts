import test from "ava";
import { spawnSync } from "node:child_process";
import { detach } from "./detach.js";

test("returns a value equal to the input", t => {
    t.is(detach(""), "");
    t.is(detach("x"), "x");
    t.is(detach("hello world"), "hello world");
    t.is(detach("a".repeat(10_000)), "a".repeat(10_000));
});

test("returns a value that survives round-trips", t => {
    const original = "commit-hash-abcdef1234567890";
    const detached = detach(original);
    t.is(detached, original);
    t.is(detached.length, original.length);
    t.is(detached.charCodeAt(0), original.charCodeAt(0));
});

// Empirical validation of the runtime-specific behavior. Runs each case in a
// fresh `node --expose-gc` subprocess so we can force GC and read heap usage
// deterministically without perturbing the ava worker.
//
// Each case allocates a ~100 MiB source `SeqString`, extracts a slice from it,
// nulls the source reference, forces GC, and reports `heapUsed`. If the
// substring pins its parent, heap stays high (~105 MiB); if it detaches, heap
// drops back to baseline (~4 MiB).
//
// The whole point of `detach` is that only a small handful of idioms actually
// break V8's SlicedString retention chain. These tests guard against a future
// runtime regression (or a well-intentioned "simplification" of `detach`).
type Measurement = { heapMB: number; len: number };

function measure(body: string): Measurement {
    const script = `
        // Build ~100 MiB flat SeqString entirely in JS-land so heapUsed reflects it.
        const CHUNK = "abcdefghijklmnopqrstuvwxyz".repeat(1024);
        let source = "";
        for (let i = 0; i < 4000; i++) source += CHUNK;
        // Repeated \`+=\` produces a ConsString (a tree of concat nodes) rather
        // than a flat character buffer. Sliced-string retention, GC accounting,
        // and \`heapUsed\` all behave differently for ConsString vs SeqString,
        // and real callers of \`detach\` receive flat strings (git stdout, file
        // reads). Random-access ops like \`charCodeAt\` force V8 to walk the
        // tree and materialise a contiguous SeqString in its place; touching
        // both ends guarantees the far leaf is reached so the flatten is
        // complete before any measurement runs.
        source.charCodeAt(0);
        source.charCodeAt(source.length - 1);

        ${body}

        globalThis.gc();
        globalThis.gc();
        globalThis.gc();
        const mu = process.memoryUsage();
        console.log(JSON.stringify({
            heapMB: Number((mu.heapUsed / 1024 / 1024).toFixed(1)),
            len: kept.length,
        }));
    `;
    const r = spawnSync(process.execPath, ["--expose-gc", "-e", script], {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
    });
    if (r.status !== 0) {
        throw new Error(`subprocess exited ${r.status}: ${r.stderr}`);
    }
    return JSON.parse(r.stdout.trim());
}

const RETAINED_MB = 50; // Comfortable midpoint between ~4 MiB baseline and ~105 MiB leak.

test("baseline: retaining the source pins ~100 MiB (sanity check)", t => {
    const m = measure(`let kept = source;`);
    t.true(m.heapMB > RETAINED_MB, `expected leak, got heapMB=${m.heapMB}`);
    t.is(m.len, 4000 * 26 * 1024);
});

test("baseline: a bare .slice() pins the parent (the bug we defend against)", t => {
    const m = measure(`
        let kept = source.slice(1000, 6000);
        source = null;
    `);
    t.true(m.heapMB > RETAINED_MB, `expected leak, got heapMB=${m.heapMB}`);
    t.is(m.len, 5000);
});

test("detach: \\` \\${x}\\`.slice(1) releases the parent", t => {
    const m = measure(`
        let cap = source.slice(1000, 6000);
        let kept = \` \${cap}\`.slice(1);
        source = null; cap = null;
    `);
    t.true(m.heapMB < RETAINED_MB, `expected release, got heapMB=${m.heapMB}`);
    t.is(m.len, 5000);
});

// The tests below document idioms that _feel_ like they should copy the string
// but actually don't in current V8. If any of these start passing (i.e. heap
// drops below RETAINED_MB), it means V8's behavior changed and `detach` could
// potentially be simplified — re-run the exploration and update the docs.
test("negative: `${x}` template alone does NOT detach", t => {
    const m = measure(`
        let cap = source.slice(1000, 6000);
        let kept = \`\${cap}\`;
        source = null; cap = null;
    `);
    t.true(m.heapMB > RETAINED_MB, `V8 behavior changed; heapMB=${m.heapMB}`);
});

test("negative: Buffer.from(x, 'utf8').toString('utf8') does NOT detach", t => {
    const m = measure(`
        let cap = source.slice(1000, 6000);
        let kept = Buffer.from(cap, "utf8").toString("utf8");
        source = null; cap = null;
    `);
    t.true(m.heapMB > RETAINED_MB, `V8 behavior changed; heapMB=${m.heapMB}`);
});

test("negative: JSON.parse(JSON.stringify(x)) does NOT detach", t => {
    const m = measure(`
        let cap = source.slice(1000, 6000);
        let kept = JSON.parse(JSON.stringify(cap));
        source = null; cap = null;
    `);
    t.true(m.heapMB > RETAINED_MB, `V8 behavior changed; heapMB=${m.heapMB}`);
});
