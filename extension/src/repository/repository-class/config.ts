import { read as readConfig, readAll as readAllConfig, type ConfigEntry } from "monolithic-git-interop/api/config/read";
import { write as writeConfig } from "monolithic-git-interop/api/config/write";
import { isErr, isOk, unwrap } from "monolithic-git-interop/util/result";
import type { Repository } from "../../git.js";
import { Operation } from "../Operations.js";
import type { RunFn } from "./run.js";

export function getConfigs(
    run: RunFn<{ key: string; value: string }[]>,
    repository: Repository,
): Promise<{ key: string; value: string }[]> {
    return run(Operation.Config, () => repository.getConfigs());
}

export async function getConfig(repository: Repository, key: string): Promise<string> {
    const result = await readConfig(repository.git._context, repository.root, "local", key);

    if (isOk(result)) {
        return unwrap(result).value;
    }

    throw unwrap(result);
}

export async function getAllConfig(repository: Repository): Promise<ConfigEntry[]> {
    const result = await readAllConfig(repository.git._context, repository.root, "local");

    if (isOk(result)) {
        return unwrap(result);
    }

    throw unwrap(result);
}

export async function getGlobalConfig(repository: Repository, key: string): Promise<string> {
    const result = await readConfig(repository.git._context, repository.root, "global", key);

    if (isOk(result)) {
        return unwrap(result).value;
    }

    throw unwrap(result);
}

export async function setConfig(repository: Repository, key: string, value: string) {
    const result = await writeConfig(repository.git._context, repository.root, "local", key, value);

    if (isErr(result)) {
        throw unwrap(result);
    }
}
