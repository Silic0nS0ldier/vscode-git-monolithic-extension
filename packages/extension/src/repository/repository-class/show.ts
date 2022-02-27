import path from "path";
import { Uri, workspace } from "vscode";
import { GitErrorCodes } from "../../api/git.js";
import { Repository } from "../../git.js";
import { Operation } from "../Operation.js";
import { RunFn } from "./run.js";

export async function show(run: RunFn<string>, repository: Repository, ref: string, filePath: string): Promise<string> {
    return await run(Operation.Show, async () => {
        const relativePath = path.relative(repository.root, filePath).replace(/\\/g, "/");
        const configFiles = workspace.getConfiguration("files", Uri.file(filePath));
        const defaultEncoding = configFiles.get<string>("encoding");
        const autoGuessEncoding = configFiles.get<boolean>("autoGuessEncoding");

        try {
            return await repository.bufferString(`${ref}:${relativePath}`, defaultEncoding, autoGuessEncoding);
        } catch (err) {
            if (err.gitErrorCode === GitErrorCodes.WrongCase) {
                const gitRelativePath = await repository.getGitRelativePath(ref, relativePath);
                return await repository.bufferString(
                    `${ref}:${gitRelativePath}`,
                    defaultEncoding,
                    autoGuessEncoding,
                );
            }

            throw err;
        }
    });
}
