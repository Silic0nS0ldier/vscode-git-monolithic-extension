import { type InlayHintsProvider, Position, Range, workspace, EventEmitter } from "vscode";
import { fromGitUri, isGitUri } from "../uri.js";
import { inlayHintsForFilePermissions } from "../util/config.js";
import type { Model } from "../model.js";

const START_POSITION = new Position(0, 0);
const SHEBANG_RANGE = new Range(0, 0, 0, 2);

export function createInlayHintsProvider(model: Model): InlayHintsProvider {
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
            if (!inlayFilePermissions) {
                return [];
            }

            if (!range.start.isEqual(START_POSITION)) {
                // Only support execbit inlay hint for now, which is always at the start of the document
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
            
            const isExecutable = await repository.fileHasExecutableBit(filePath, ref);
            const hasShebang = document.getText(SHEBANG_RANGE) === "#!";

            if (hasShebang && !isExecutable) {
                // If the file has a shebang but is not executable.
                // This is usually a mistake, so we provide a hint.
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
                return [{
                    label: "+x",
                    position: START_POSITION,
                    paddingRight: true,
                    tooltip: "This file is marked as executable.",
                }];
            }

            return [];
        },
        // resolveInlayHint(hint, token) {
        //     // Example implementation: return the hint as is
        //     return hint;
        // }
    };
}
