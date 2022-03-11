import fs from "node:fs";
import path from "node:path";
import { Uri, window, workspace, WorkspaceEdit } from "vscode";
import type { Repository } from "../../git.js";
import { Operation } from "../Operations.js";
import type { RunFn } from "./run.js";

export async function ignore(
    run: RunFn<void>,
    repository: Repository,
    files: Uri[],
): Promise<void> {
    return await run(Operation.Ignore, async () => {
        const ignoreFile = `${repository.root}${path.sep}.gitignore`;
        const textToAppend = files
            .map(uri => path.relative(repository.root, uri.fsPath).replace(/\\/g, "/"))
            .join("\n");

        const document = await new Promise(c => fs.exists(ignoreFile, c))
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
