import { type ConfigEntry, read as readConfig, readAll as readAllConfig } from "monolithic-git-interop/api/config/read";
import { write as writeConfig } from "monolithic-git-interop/api/config/write";
import { unwrapOk } from "monolithic-git-interop/errors";
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
    return unwrapOk(await readConfig(repository.git._context, repository.root, "local", key)).value;
}

export async function getAllConfig(repository: Repository): Promise<ConfigEntry[]> {
    return unwrapOk(await readAllConfig(repository.git._context, repository.root, "local"));
}

export async function getGlobalConfig(repository: Repository, key: string): Promise<string> {
    return unwrapOk(await readConfig(repository.git._context, repository.root, "global", key)).value;
}

export async function setConfig(repository: Repository, key: string, value: string) {
    unwrapOk(await writeConfig(repository.git._context, repository.root, "local", key, value));
}
