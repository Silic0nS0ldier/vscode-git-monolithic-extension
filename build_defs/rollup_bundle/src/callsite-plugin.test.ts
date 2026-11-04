import MagicString from "magic-string";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { type Plugin, rollup, type RollupOutput } from "rollup";
import { callsitePlugin } from "./callsite-plugin.js";
import { repositoryPath } from "./repository-path.js";

const LOGGER = `
export const calls = [];
export function setLevel() {}
export function trace(msg, callsite) { calls.push([msg, callsite]); }
export function error(msg, callsite) { calls.push([msg, callsite]); }
`;

// Line 6 of the original source holds the first call; the emitted JS has the type declarations removed.
const CALLER_TS = [
    `import { setLevel, trace as log, error } from "./tracing.js";`,
    `interface Options {`,
    `    verbose: boolean;`,
    `}`,
    `export function run(value: number, options?: Options): void {`,
    `    log(\`value \${value}\`);`,
    `    setLevel();`,
    `    if (value > 1) { error("too big"); }`,
    `    try { throw value; } catch (error) { [error].map(String); }`,
    `    const nested = (log: (msg: string) => void) => log("shadowed");`,
    `    nested(() => {});`,
    `    void options;`,
    `}`,
    ``,
].join("\n");

const TYPES = /^interface \w+ \{\n(?: .*\n)*\}\n|\??: (?:number|Options|void|\(msg: string\) => void)/gm;

/** Stands in for `tsc` plus `rollup-plugin-sourcemaps2`: loads emitted JS with a map back to the TypeScript. */
function typescriptFixturePlugin(name: string, source: string): Plugin {
    return {
        name: "typescript-fixture",
        load(id) {
            if (path.basename(id) !== `${name}.js`) return null;
            const emitted = new MagicString(source);
            for (const match of source.matchAll(TYPES)) emitted.remove(match.index, match.index + match[0].length);
            return {
                code: emitted.toString(),
                map: emitted.generateMap({ hires: true, source: `../src/${name}.ts` }),
            };
        },
    };
}

async function fixture(
    files: Record<string, string>,
    run: (directory: string, build: (functions?: string[]) => Promise<RollupOutput>) => Promise<void>,
): Promise<void> {
    const directory = await mkdtemp(path.join(tmpdir(), "rollup-callsite-"));
    try {
        const dist = path.join(directory, "dist");
        await mkdir(dist);
        for (const [name, content] of Object.entries({ "tracing.js": LOGGER, ...files })) {
            await writeFile(path.join(dist, name), content);
        }
        await run(directory, async (functions = ["trace", "debug", "info", "warn", "error"]) => {
            const bundle = await rollup({
                input: path.join(dist, "entry.js"),
                plugins: [
                    typescriptFixturePlugin("caller", CALLER_TS),
                    callsitePlugin(path.join(dist, "tracing.js"), functions),
                ],
                onwarn: () => {},
            });
            try {
                return await bundle.generate({ format: "esm", sourcemap: true });
            } finally {
                await bundle.close();
            }
        });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

async function evaluate(output: RollupOutput): Promise<unknown> {
    const chunk = output.output[0];
    return (await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`) as {
        result: unknown;
    }).result;
}

const ENTRY = `
import { calls } from "./tracing.js";
import { run } from "./caller.js";
run(1);
run(2);
export const result = calls;
`;

test("Passes each logger call its original source location, leaving shadowed names and other functions alone", async () => {
    await fixture({ "entry.js": ENTRY, "caller.js": "" }, async (directory, build) => {
        const output = await build();
        const file = repositoryPath(path.join(directory, "src", "caller.ts"));
        assert.ok(file.endsWith("src/caller.ts"));
        assert.deepEqual(await evaluate(output), [
            ["value 1", { file, line: 6, column: 5 }],
            ["value 2", { file, line: 6, column: 5 }],
            ["too big", { file, line: 8, column: 22 }],
        ]);
        const chunk = output.output[0];
        assert.ok(chunk.map?.sources.some(source => source.endsWith("caller.ts")));
    });
});

test("Gives each call site its own object", async () => {
    await fixture({
        "entry.js": `
            import { trace, calls } from "./tracing.js";
            for (let i = 0; i < 2; i++) { trace("a"); }
            trace("b");
            export const result = calls[0][1] === calls[1][1] && calls[1][1] !== calls[2][1];
        `,
    }, async (_directory, build) => {
        assert.equal(await evaluate(await build()), true);
    });
});

test("Rejects uses that would go without a call site", async () => {
    const cases: [code: string, message: RegExp][] = [
        [`import { trace } from "./tracing.js"; ["x"].forEach(trace);`, /'trace' .* must be called directly/],
        [`import { trace } from "./tracing.js"; trace("x", {});`, /must be called with exactly one argument/],
        [`import { trace } from "./tracing.js"; trace(...["x"]);`, /must be called with exactly one argument/],
        [`import * as tracing from "./tracing.js"; tracing.trace("x");`, /must be imported by name/],
        [`export { trace } from "./tracing.js";`, /must not be re-exported/],
        [`export * from "./tracing.js";`, /must not be re-exported/],
        [`import { trace } from "./tracing.js"; export { trace };`, /must be called directly/],
    ];
    for (const [code, message] of cases) {
        await fixture({ "entry.js": code }, async (_directory, build) => {
            await assert.rejects(build(), message, code);
        });
    }
});

test("Allows re-exporting and passing around the logger's other exports", async () => {
    await fixture({
        "entry.js": `
            import { setLevel } from "./tracing.js";
            export { calls } from "./tracing.js";
            export const result = [setLevel].length;
        `,
    }, async (_directory, build) => {
        assert.equal(await evaluate(await build()), 1);
    });
});

test("Fails when the logger module is not part of the bundle", async () => {
    await fixture({ "entry.js": `export const result = 1;` }, async (_directory, build) => {
        await assert.rejects(build(), /Logger module '.*tracing\.js' is not part of the bundle/);
    });
});
