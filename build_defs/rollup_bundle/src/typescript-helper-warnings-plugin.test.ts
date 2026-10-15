import assert from "node:assert/strict";
import { test } from "node:test";
import { rollup, type RollupLog } from "rollup";
import { typescriptHelperWarningsPlugin } from "./typescript-helper-warnings-plugin.js";

async function bundleSource(source: string, filterWarnings: boolean) {
    const warnings: RollupLog[] = [];
    const bundle = await rollup({
        input: "fixture",
        plugins: [
            {
                name: "fixture",
                resolveId: id => id,
                load: () => source,
            },
            ...(filterWarnings ? [typescriptHelperWarningsPlugin()] : []),
        ],
        onwarn: warning => warnings.push(warning),
    });
    try {
        const { output } = await bundle.generate({ format: "esm" });
        return { warnings, output };
    } finally {
        await bundle.close();
    }
}

test("TypeScript helper guards are quiet without changing the generated bundle", async () => {
    const source = `
var __awaiter = (this && this.__awaiter) || function () { return 42; };
var __asyncGenerator = (this && this.__asyncGenerator) || function () { return this; };
export { __awaiter, __asyncGenerator };
`;
    const baseline = await bundleSource(source, false);
    const filtered = await bundleSource(source, true);
    assert.equal(baseline.warnings.length, 4);
    assert.ok(baseline.warnings.every(warning => warning.code === "THIS_IS_UNDEFINED"));
    assert.deepEqual(filtered.warnings, []);
    assert.deepEqual(filtered.output, baseline.output);
});

test("Other top-level this uses still warn, including uses inside a helper function", async () => {
    const source = `
var __awaiter = (this && this.__awaiter) || function () { return () => this; };
var __other = (this && this.__different) || function () {};
var custom = (this && this.custom) || function () {};
export const value = this;
export const arrow = () => this;
export { __awaiter, __other, custom };
`;
    const { warnings } = await bundleSource(source, true);
    assert.equal(warnings.length, 6);
    assert.ok(warnings.every(warning => warning.code === "THIS_IS_UNDEFINED"));
});

test("Unrelated warnings are not filtered", async () => {
    const { warnings } = await bundleSource("export const value = eval('42');", true);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.code, "EVAL");
});
