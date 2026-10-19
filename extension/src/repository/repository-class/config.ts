import { read as readConfig } from "monolithic-git-interop/api/config/read";
import { unwrapOk } from "monolithic-git-interop/errors";
import type { Repository } from "../../git.js";

export async function getConfig(repository: Repository, key: string): Promise<string> {
    return unwrapOk(await readConfig(repository.git._context, repository.root, "local", key)).value;
}
