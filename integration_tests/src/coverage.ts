/**
 * V8 coverage of the extension host.
 *
 * `code-server.sh` sets `NODE_V8_COVERAGE`, which the server passes on to the extension
 * host, so V8 counts from before the extension loads. Node writes the counts out when the
 * process exits normally, which the extension host does once the workbench closes. Coverage
 * is of the bundle as shipped, and is then mapped back to the original sources through the
 * bundle's source maps, which are built alongside it but left out of the VSIX.
 */
import istanbulCoverage from "istanbul-lib-coverage";
import istanbulReport from "istanbul-lib-report";
import istanbulReports from "istanbul-reports";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import v8ToIstanbul from "v8-to-istanbul";

/** `--test_env=ITEST_COVERAGE=1` collects coverage of the extension host. */
export const COVERAGE_ENABLED = process.env["ITEST_COVERAGE"] === "1";

/** Install directories are named `<publisher>.<name>-<version>`. */
const EXTENSION_DIR = "/siliconsoldier.git-monolithic-";

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
 * Writes every dump to `outDir`, one file per process, plus a summary, then the same
 * mapped back to the original sources in `outDir/sources`. Other processes running the
 * extension's code, such as askpass, inherit `NODE_V8_COVERAGE` too.
 */
export async function writeCoverage(dumps: Dumps, outDir: string): Promise<void> {
    await writeBundleCoverage(dumps, outDir);
    await writeSourceCoverage(dumps, join(outDir, "sources"));
}

async function writeBundleCoverage(dumps: Dumps, outDir: string): Promise<void> {
    await mkdir(outDir, { recursive: true });
    const summaries: string[] = [];
    for (const [file, scripts] of dumps) {
        // Named and laid out as `NODE_V8_COVERAGE` writes them, so c8 can merge the directory.
        await writeFile(join(outDir, file), JSON.stringify({ result: scripts }));
        summaries.push(
            `# ${file}${isExtensionHost(scripts) ? " (extension host)" : ""}`,
            await summarise(scripts),
        );
    }
    await writeFile(join(outDir, "summary.txt"), summaries.join("\n"));
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
    const path = url.slice(url.indexOf(EXTENSION_DIR) + 1);
    // `<publisher>.<name>-<version>/src/<bundle path>`
    return path.split("/").slice(2).join("/");
}

/**
 * Maps every dump through the bundle's source maps and writes istanbul reports: `index.html`,
 * `lcov.info`, `coverage-final.json` and `summary.txt`. Sources are named relative to the
 * repository (npm packages as `node_modules/<package>/...`), and their text comes from the
 * maps, which embed it.
 */
async function writeSourceCoverage(dumps: Dumps, outDir: string): Promise<void> {
    const bundle = bundleDir();
    const coverageMap = istanbulCoverage.createCoverageMap();
    const sourceText = new Map<string, string>();

    for (const scripts of dumps.values()) {
        for (const script of scripts) {
            const path = bundlePath(script.url);
            const source = await readFile(fileURLToPath(script.url), "utf8");
            if (source !== await readFile(join(bundle, path), "utf8")) {
                throw new Error(`The installed ${path} differs from the bundle its source maps were built with`);
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
    for (
        const report of [
            istanbulReports.create("html"),
            istanbulReports.create("lcovonly"),
            istanbulReports.create("json"),
            istanbulReports.create("text", { file: "summary.txt" }),
        ]
    ) {
        report.execute(context);
    }
}

/**
 * Execution count of every byte. V8 reports properly nested ranges, and the innermost one
 * containing a byte holds its count, so painting outer ranges first leaves the right count.
 */
function byteCounts(script: ScriptCoverage, length: number): Uint32Array {
    const ranges = script.functions.flatMap(fn => fn.ranges)
        .toSorted((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
    const counts = new Uint32Array(length);
    for (const range of ranges) {
        counts.fill(range.count, range.startOffset, Math.min(range.endOffset, length));
    }
    return counts;
}

/** 1-based `line:column` of `offset`, to look the function up in the bundle. */
function position(lineStarts: number[], offset: number): string {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (lineStarts[mid]! <= offset) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return `${low + 1}:${offset - lineStarts[low]! + 1}`;
}

/** Byte coverage per script, then every function never called that no other such function contains. */
async function summarise(scripts: ScriptCoverage[]): Promise<string> {
    const lines: string[] = [];

    for (const script of scripts.toSorted((a, b) => a.url.localeCompare(b.url))) {
        // Offsets index UTF-16 code units, which is what a JS string does too.
        const source = await readFile(fileURLToPath(script.url), "utf8");
        const counts = byteCounts(script, source.length);
        const covered = counts.reduce((total, count) => total + (count > 0 ? 1 : 0), 0);

        const lineStarts = [0];
        for (let index = source.indexOf("\n"); index !== -1; index = source.indexOf("\n", index + 1)) {
            lineStarts.push(index + 1);
        }

        const uncalled = script.functions
            .filter(fn => fn.ranges[0]!.count === 0)
            .map(fn => ({ name: fn.functionName, ...fn.ranges[0]! }))
            .toSorted((a, b) => a.startOffset - b.startOffset);
        const outermost: typeof uncalled = [];
        for (const fn of uncalled) {
            const parent = outermost.at(-1);
            if (parent === undefined || fn.startOffset >= parent.endOffset) {
                outermost.push(fn);
            }
        }

        const percent = source.length === 0 ? 100 : (covered / source.length) * 100;
        lines.push(
            `${script.url.slice(script.url.indexOf(EXTENSION_DIR) + 1)}`,
            `  bytes covered: ${covered}/${source.length} (${percent.toFixed(1)}%)`,
            `  functions called: ${script.functions.length - uncalled.length}/${script.functions.length}`,
            `  never called (outermost ${outermost.length}, by size):`,
            ...outermost
                .toSorted((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset))
                .map(fn =>
                    `    ${position(lineStarts, fn.startOffset)} ${fn.name || "(anonymous)"} `
                    + `[${fn.endOffset - fn.startOffset} B]`
                ),
            "",
        );
    }

    return lines.join("\n");
}
