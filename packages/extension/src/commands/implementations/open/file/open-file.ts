import {
    commands,
    OutputChannel,
    SourceControlResourceState,
    TextDocumentShowOptions,
    Uri,
    ViewColumn,
    window,
    workspace,
} from "vscode";
import { Status } from "../../../../api/git.js";
import { Model } from "../../../../model.js";
import { Resource } from "../../../../repository/Resource.js";
import { fromGitUri, isGitUri } from "../../../../uri.js";
import { ScmCommand } from "../../../helpers.js";
import { getSCMResource } from "../../../helpers.js";

export async function openFile(
    model: Model,
    outputChannel: OutputChannel,
    arg?: Resource | Uri,
    ...resourceStates: SourceControlResourceState[]
): Promise<void> {
    const preserveFocus = arg instanceof Resource;

    let uris: Uri[] | undefined;

    if (arg instanceof Uri) {
        if (isGitUri(arg)) {
            uris = [Uri.file(fromGitUri(arg).path)];
        } else if (arg.scheme === "file") {
            uris = [arg];
        }
    } else {
        let resource = arg;

        if (!(resource instanceof Resource)) {
            // can happen when called from a keybinding
            resource = getSCMResource(model, outputChannel);
        }

        if (resource) {
            uris = ([resource, ...resourceStates] as Resource[])
                .filter(r => r.state.type !== Status.DELETED && r.state.type !== Status.INDEX_DELETED)
                .map(r => r.state.resourceUri);
        } else if (window.activeTextEditor) {
            uris = [window.activeTextEditor.document.uri];
        }
    }

    if (!uris) {
        return;
    }

    const activeTextEditor = window.activeTextEditor;

    for (const uri of uris) {
        const opts: TextDocumentShowOptions = {
            preserveFocus,
            preview: false,
            viewColumn: ViewColumn.Active,
        };

        let document;
        try {
            document = await workspace.openTextDocument(uri);
        } catch (error) {
            await commands.executeCommand("vscode.open", uri, {
                ...opts,
                override: arg instanceof Resource && arg.state.type === Status.BOTH_MODIFIED ? false : undefined,
            });
            continue;
        }

        // Check if active text editor has same path as other editor. we cannot compare via
        // URI.toString() here because the schemas can be different. Instead we just go by path.
        if (activeTextEditor && activeTextEditor.document.uri.path === uri.path) {
            // preserve not only selection but also visible range
            opts.selection = activeTextEditor.selection;
            const previousVisibleRanges = activeTextEditor.visibleRanges;
            const editor = await window.showTextDocument(document, opts);
            editor.revealRange(previousVisibleRanges[0]);
        } else {
            await commands.executeCommand("vscode.open", uri, opts);
        }
    }
}

export function createCommand(model: Model, outputChannel: OutputChannel): ScmCommand {
    async function openFileFn(arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]): Promise<void> {
        await openFile(model, outputChannel, arg, ...resourceStates);
    }

    return {
        commandId: "git.openFile",
        method: openFileFn,
        options: {},
    };
}
