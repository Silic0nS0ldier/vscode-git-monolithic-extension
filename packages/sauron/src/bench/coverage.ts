import { Session } from "node:inspector/promises";

type CoverageCounts = {
    /** Function invocations. */
    readonly functions: number;
    /** Executions of blocks within functions (branches, loop bodies, …). */
    readonly blocks: number;
};

export type Coverage = {
    /** Returns counts since the previous call (or start) and resets them. */
    take(): Promise<CoverageCounts>;
};

/** `SAURON_BENCH_TOP=<n>` prints the n most called functions per phase, for investigating results. */
const TOP = Number.parseInt(process.env["SAURON_BENCH_TOP"] ?? "0", 10) || 0;

/** V8 precise coverage, counted only for scripts accepted by `include`. */
export async function startCoverage(include: (url: string) => boolean): Promise<Coverage> {
    const session = new Session();
    session.connect();
    await session.post("Profiler.enable");
    await session.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    return {
        async take() {
            const { result } = await session.post("Profiler.takePreciseCoverage");
            let functions = 0;
            let blocks = 0;
            const top: [string, number, number][] = [];
            for (const script of result) {
                if (!include(script.url)) {
                    continue;
                }
                for (const fn of script.functions) {
                    const [whole, ...nested] = fn.ranges;
                    functions += whole?.count ?? 0;
                    let fnBlocks = 0;
                    for (const range of nested) {
                        fnBlocks += range.count;
                    }
                    blocks += fnBlocks;
                    if (TOP > 0 && (whole?.count ?? 0) + fnBlocks > 0) {
                        const where = `${
                            script.url.slice(
                                script.url.lastIndexOf("/node_modules/") + 1 || script.url.indexOf("/dist/") + 1,
                            )
                        }:${whole?.startOffset}`;
                        top.push([`${fn.functionName || "(anonymous)"} ${where}`, whole?.count ?? 0, fnBlocks]);
                    }
                }
            }
            if (TOP > 0) {
                top.sort((a, b) => b[1] + b[2] - (a[1] + a[2]));
                console.error(top.slice(0, TOP).map(([name, calls, b]) => `  ${calls}\t${b}\t${name}`).join("\n"));
            }
            return { functions, blocks };
        },
    };
}
