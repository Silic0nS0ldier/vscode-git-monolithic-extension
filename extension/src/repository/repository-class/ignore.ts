import { access } from "node:fs/promises";
import path from "node:path";
import { Uri, window, workspace, WorkspaceEdit } from "vscode";
import type { Repository } from "../../git.js";
import { Operation } from "../Operations.js";
import type { RunFn } from "./run.js";

export async function ignore(
    runRepositoryOperation: RunFn<void>,
    repository: Repository,
    files: Uri[],
): Promise<void> {
    return await runRepositoryOperation(Operation.Ignore, async () => {
        const ignoreFile = `${repository.root}${path.sep}.gitignore`;
        const textToAppend = files
            .map(uri => path.relative(repository.root, uri.fsPath).replace(/\\/g, "/"))
            .join("\n");

        // TOCTOU race: another process could create or delete .gitignore between
        // this check and the subsequent openTextDocument call. VS Code has no
        // single API that opens the file if present or an untitled buffer otherwise,
        // so the check is unavoidable.
        const ignoreFileExists = await access(ignoreFile).then(() => true, () => false);
        const document = ignoreFileExists
            ? await workspace.openTextDocument(ignoreFile)
            : await workspace.openTextDocument(Uri.file(ignoreFile).with({ scheme: "untitled" }));

        await window.showTextDocument(document);

        const edit = new WorkspaceEdit();
        const lastLine = document.lineAt(document.lineCount - 1);
        const text = lastLine.isEmptyOrWhitespace ? `${textToAppend}\n` : `\n${textToAppend}\n`;

        edit.insert(document.uri, lastLine.range.end, text);
        await workspace.applyEdit(edit);
        await document.save();
    });
}
