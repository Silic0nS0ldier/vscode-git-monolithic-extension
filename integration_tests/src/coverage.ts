/**
 * V8 coverage of the extension host.
 *
 * Under `bazel coverage`, `code-server.sh` sets `NODE_V8_COVERAGE`, which the server passes
 * on to the extension host, so V8 counts from before the extension loads. Node writes the
 * counts out when the process exits normally, which the extension host does once the
 * workbench closes. Coverage is of the bundle as shipped, and is then mapped back to the
 * original sources through the bundle's source maps, which are built alongside it but left
 * out of the VSIX. The resulting LCOV report is written to `COVERAGE_DIR` for Bazel's
 * `_lcov_merger`.
 */
import istanbulCoverage from "istanbul-lib-coverage";
import istanbulReport from "istanbul-lib-report";
import istanbulReports from "istanbul-reports";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import v8ToIstanbul from "v8-to-istanbul";

/** `bazel coverage` sets `COVERAGE_DIR` for the test action. */
export const COVERAGE_DIR = process.env["COVERAGE_DIR"];

/** Root of the unpacked extension directory (`//extension/vsix:git_monolithic_unpacked`). */
const EXTENSION_DIR = "/extension/vsix/git_monolithic_inputs_dir/";

interface CoverageRange {
    startOffset: number;
    endOffset: number;
    count: number;
}

interface FunctionCoverage {
    functionName: string;
    ranges: CoverageRange[];
    isBlockCoverage: boolean;
}

interface SourceMap {
    version: 3;
    mappings: string;
    names: string[];
    sources: string[];
    sourcesContent: (string | null)[];
}

interface ScriptCoverage {
    scriptId: string;
    url: string;
    functions: FunctionCoverage[];
}

/** Where `code-server.sh` points `NODE_V8_COVERAGE`; every Node process the server runs writes here. */
export function rawCoverageDir(testTmpDir: string): string {
    return join(testTmpDir, "v8-coverage");
}

/** The extension's scripts in one process's dump, or none while it is absent or half written. */
async function extensionScripts(file: string): Promise<ScriptCoverage[]> {
    try {
        const { result } = JSON.parse(await readFile(file, "utf8")) as { result: ScriptCoverage[] };
        return result.filter(script => script.url.includes(EXTENSION_DIR));
    } catch {
        return [];
    }
}

/** Only the extension host loads this; askpass, which git runs, has its own entry point. */
function isExtensionHost(scripts: ScriptCoverage[]): boolean {
    return scripts.some(script => script.url.endsWith("/src/main.js"));
}

type Dumps = Map<string, ScriptCoverage[]>;

/** The extension's share of every process's dump so far, keyed by file name. */
export async function readExtensionDumps(rawDir: string): Promise<Dumps> {
    const dumps: Dumps = new Map();
    const files = await readdir(rawDir).catch(() => []);
    for (const file of files.filter(name => name.endsWith(".json")).toSorted()) {
        const scripts = await extensionScripts(join(rawDir, file));
        if (scripts.length > 0) {
            dumps.set(file, scripts);
        }
    }
    return dumps;
}

/** The extension host writes its dump as it exits, so stop it before waiting on this. */
export function hasExtensionHostDump(dumps: Dumps): boolean {
    return dumps.values().some(isExtensionHost);
}

/**
 * The bundle as built, which the test depends on for its source maps (`sourcemaps/`
 * mirrors the bundle's layout). `ITEST_BUNDLE` lists the bundle's outputs as runfiles.
 */
function bundleDir(): string {
    const runfiles = process.env["JS_BINARY__RUNFILES"] ?? process.env["RUNFILES_DIR"];
    const sourcemaps = (process.env["ITEST_BUNDLE"] ?? "").split(" ").find(path => path.endsWith("/sourcemaps"));
    if (runfiles === undefined || sourcemaps === undefined) {
        throw new Error("ITEST_BUNDLE or the runfiles directory is unset; run this via the service_test target");
    }
    return dirname(join(runfiles, sourcemaps));
}

/** Where a script sits in the bundle, e.g. `main.js` or `chunks/<name>.js`. */
function bundlePath(url: string): string {
    // `.../extension/vsix/git_monolithic_inputs_dir/src/<bundle path>`
    return url.slice(url.indexOf(EXTENSION_DIR) + EXTENSION_DIR.length + "src/".length);
}

/**
 * Maps every dump through the bundle's source maps and writes `extension.dat` in `outDir`
 * (`COVERAGE_DIR`), where Bazel's `LcovMerger` looks for `*.dat` reports. Other processes
 * running the extension's code, such as askpass, inherit `NODE_V8_COVERAGE` too. Sources are
 * named relative to the repository, and their text comes from the maps, which embed it.
 */
export async function writeCoverage(dumps: Dumps, outDir: string): Promise<void> {
    const bundle = bundleDir();
    const coverageMap = istanbulCoverage.createCoverageMap();
    const sourceText = new Map<string, string>();

    for (const scripts of dumps.values()) {
        for (const script of scripts) {
            const path = bundlePath(script.url);
            const source = await readFile(fileURLToPath(script.url), "utf8");
            if (source !== await readFile(join(bundle, path), "utf8")) {
                throw new Error(`The loaded ${path} differs from the bundle its source maps were built with`);
            }
            const map = JSON.parse(await readFile(join(bundle, "sourcemaps", `${path}.map`), "utf8")) as SourceMap;
            // A source whose text the map lacks still gets an (empty) entry, rather than
            // being looked for on disk.
            map.sourcesContent = map.sources.map((name, index) => {
                const text = map.sourcesContent[index] ?? "";
                sourceText.set(name, text);
                return text;
            });

            // Sources resolve against the script's directory. Placing the script at `/`, which
            // is never read since its source is given, keeps their names once `/` is stripped.
            const converter = v8ToIstanbul("/bundle.js", 0, {
                source,
                originalSource: "",
                sourceMap: { sourcemap: map },
            });
            await converter.load();
            converter.applyCoverage(script.functions);
            coverageMap.merge(
                Object.fromEntries(
                    Object.entries(converter.toIstanbul()).map(([file, data]) => {
                        const name = relative("/", file);
                        return [name, { ...data, path: name }];
                    }),
                ),
            );
        }
    }

    await mkdir(outDir, { recursive: true });
    const context = istanbulReport.createContext({
        dir: outDir,
        coverageMap,
        sourceFinder: (path: string) => sourceText.get(path) ?? "",
    });
    istanbulReports.create("lcovonly", { file: "extension.dat" }).execute(context);
}
