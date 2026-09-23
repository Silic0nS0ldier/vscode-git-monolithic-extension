import type { IExecutionResult } from "../exec.js";
import { sanitizePath } from "../helpers.js";
import type { SpawnOptions } from "../SpawnOptions.js";

type Exec = (args: string[], options?: SpawnOptions) => Promise<IExecutionResult<string>>;

export async function diffWithHEAD({ exec }: { exec: Exec }, path: string): Promise<string> {
    const result = await exec(["diff", "--", sanitizePath(path)]);
    return result.stdout;
}

export async function diffIndexWithHEAD({ exec }: { exec: Exec }, path: string): Promise<string> {
    const result = await exec(["diff", "--cached", "--", sanitizePath(path)]);
    return result.stdout;
}
