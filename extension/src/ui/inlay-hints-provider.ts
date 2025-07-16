import { type InlayHintsProvider, Position, Range, workspace, EventEmitter, type OutputChannel } from "vscode";
import { fromGitUri, isGitUri } from "../uri.js";
import { inlayHintsForFilePermissions } from "../util/config.js";
import type { Model } from "../model.js";

const START_POSITION = new Position(0, 0);
const SHEBANG_RANGE = new Range(0, 0, 0, 2);

export function createInlayHintsProvider(model: Model, outputChannel: OutputChannel): InlayHintsProvider {
    outputChannel.appendLine("Creating inlay hints provider...");
    let inlayFilePermissions = inlayHintsForFilePermissions();
    const onConfigurationChangedEmitter = new EventEmitter<void>();
    workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration("git-monolithic.inlayHints.filePermissions")) {
            inlayFilePermissions = inlayHintsForFilePermissions();
            onConfigurationChangedEmitter.fire();
        }
    });

    return {
        onDidChangeInlayHints: onConfigurationChangedEmitter.event,
        async provideInlayHints(document, range, _token) {
            outputChannel.appendLine(`Providing inlay hints for document: ${document.uri.toString()}`);
            if (!inlayFilePermissions) {
                outputChannel.appendLine("Inlay hints for file permissions are disabled in the configuration.");
                return [];
            }

            if (!range.start.isEqual(START_POSITION)) {
                // Only support execbit inlay hint for now, which is always at the start of the document
                outputChannel.appendLine("Range beyond document start.");
                return [];
            }

            // Resolve file path and commit-ish
            const { filePath, ref } = (() => {
                if (isGitUri(document.uri)) {
                    const gitUriParams = fromGitUri(document.uri);
                    if (gitUriParams.submoduleOf) {
                        // does this need special handling?
                    }
                    return { filePath: document.uri.fsPath, ref: gitUriParams.ref };
                } else {
                    // Take file path and use 'HEAD' as commit-ish
                    return { filePath: document.uri.fsPath, ref: 'HEAD' };
                }
            })();

            const repository = model.getRepository(filePath);
            if (!repository) {
                return [];
            }
            
            const isExecutable = await (async () => {
                try {
                    return await repository.fileHasExecutableBit(filePath, ref);
                } catch (error) {
                    outputChannel.appendLine(`Error checking executable bit for ${filePath}: ${error}`);
                    throw error;
                }
            })();
            const hasShebang = document.getText(SHEBANG_RANGE) === "#!";

            outputChannel.appendLine(`Executable? ${isExecutable}, Shebang? ${hasShebang}`);

            if (hasShebang && !isExecutable) {
                // If the file has a shebang but is not executable.
                // This is usually a mistake, so we provide a hint.
                outputChannel.appendLine("File has shebang but is not executable.");
                return [{
                    label: "-e",
                    position: START_POSITION,
                    paddingRight: true,
                    tooltip: "This file has a shebang but is not marked as executable.",
                }];
            }

            if (isExecutable && !hasShebang) {
                // If the file is executable and does not have a shebang.
                // This is unusual, so we provide a hint.
                outputChannel.appendLine("File is executable but has no shebang.");
                return [{
                    label: "+x",
                    position: START_POSITION,
                    paddingRight: true,
                    tooltip: "This file is marked as executable.",
                }];
            }

            outputChannel.appendLine("No inlay hints to provide for this file.");
            return [];
        },
        // resolveInlayHint(hint, token) {
        //     // Example implementation: return the hint as is
        //     return hint;
        // }
    };
}
