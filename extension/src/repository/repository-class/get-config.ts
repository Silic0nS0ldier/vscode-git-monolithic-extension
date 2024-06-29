import { read as readUserConfig } from "monolithic-git-interop/api/config/user/read";
import { read as readRepositoryConfig } from "monolithic-git-interop/api/repository/config/read";
import { isOk, unwrap } from "monolithic-git-interop/util/result";
import type { Repository } from "../../git.js";
import { Operation } from "../Operations.js";
import type { RunFn } from "./run.js";

export function getConfigs(
    run: RunFn<{ key: string; value: string }[]>,
    repository: Repository,
): Promise<{ key: string; value: string }[]> {
    return run(Operation.Config, () => repository.getConfigs("local"));
}

export async function getConfig(repository: Repository, key: string): Promise<string> {
    const result = await readRepositoryConfig(repository.git._context, repository.root, key);

    if (isOk(result)) {
        return unwrap(result).value;
    }

    throw unwrap(result);
}

export async function getGlobalConfig(repository: Repository, key: string): Promise<string> {
    const result = await readUserConfig(repository.git._context, repository.root, key);

    if (isOk(result)) {
        return unwrap(result).value;
    }

    throw unwrap(result);
}
