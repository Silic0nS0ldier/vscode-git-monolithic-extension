import path from "node:path";
import { EventEmitter, Uri } from "vscode";
import { Repository } from "../../git.js";
import { Operation } from "../Operations.js";
import { RunFn } from "./run.js";

export async function stage(
    repository: Repository,
    run: RunFn<void>,
    onDidChangeOriginalResourceEmitter: EventEmitter<Uri>,
    resource: Uri,
    contents: string,
): Promise<void> {
    const relativePath = path.relative(repository.root, resource.fsPath).replace(/\\/g, "/");
    await run(Operation.Stage, () => repository.stage(relativePath, contents));
    onDidChangeOriginalResourceEmitter.fire(resource);
}
