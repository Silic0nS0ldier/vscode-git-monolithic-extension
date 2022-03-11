import path from "node:path";
import type { Repository } from "../../git.js";
import { Operation } from "../Operations.js";
import type { RunFn } from "./run.js";

export async function buffer(
    run: RunFn<Buffer>,
    repository: Repository,
    ref: string,
    filePath: string,
): Promise<Buffer> {
    return run(Operation.Show, () => {
        const relativePath = path.relative(repository.root, filePath).replace(/\\/g, "/");
        return repository.buffer(`${ref}:${relativePath}`);
    });
}
