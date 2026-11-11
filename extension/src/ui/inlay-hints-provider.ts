import * as fs from "node:fs/promises";
import { inspect } from "node:util";
import { EventEmitter, type InlayHintsProvider, Position, Range, workspace } from "vscode";
import type { Model } from "../model.js";
import { error, trace } from "../tracing.js";
import { inlayHintsForFilePermissions } from "../util/config.js";

const START_POSITION = new Position(0, 0);
const SHEBANG_RANGE = new Range(0, 0, 0, 2);

export function createInlayHintsProvider(model: Model): InlayHintsProvider {
    let inlayFilePermissions = inlayHintsForFilePermissions();
    const onChangedEmitter = new EventEmitter<void>();
    workspace.onDidChangeConfiguration(event => {
        if (inlayHintsForFilePermissions.affected(event)) {
            inlayFilePermissions = inlayHintsForFilePermissions();
            onChangedEmitter.fire();
        }
    });
    // TODO `onDidChangeOriginalResource` appears to be bugged (cyclic reference?)
    //      and will need to be fixed.
    model.onDidChangeOriginalResource(() => {
        onChangedEmitter.fire();
    });

    return {
        onDidChangeInlayHints: onChangedEmitter.event,
        async provideInlayHints(document, range, _token) {
            const hasShebang = document.getText(SHEBANG_RANGE) === "#!";
            if (!inlayFilePermissions) {
                trace("Inlay hints for file permissions are disabled in the configuration.");
                return [];
            }

            if (!range.start.isEqual(START_POSITION)) {
                // Only support execbit inlay hint for now, which is always at the start of the document
                return [];
            }

            // TODO Add support for specific commits and staged files
            //      APIs already defined in monolithic-git-interop, just need to pick the
            //      appropriate one based on state.
            if (document.uri.scheme !== "file") {
                trace(`Document scheme ${document.uri.scheme} is not supported.`);
                return [];
            }

            const filePath = document.uri.fsPath;

            const isExecutable = await (async () => {
                try {
                    const stats = await fs.stat(filePath);
                    return !!(stats.mode & 0o111);
                } catch (err) {
                    if (err instanceof Error && /ENOENT/.test(err.message)) {
                        error(`File ${filePath} does not exist on disk.`);
                    } else {
                        error(`Failed checking file permissions for ${filePath}: ${inspect(err)}`);
                    }
                    return false;
                }
            })();

            if (hasShebang && !isExecutable) {
                // If the file has a shebang but is not executable.
                // This is usually a mistake, so we provide a hint.
                return [{
                    label: "-x",
                    position: START_POSITION,
                    paddingRight: true,
                    tooltip: "This file has a shebang but is not marked as executable.",
                }];
            }

            if (hasShebang || isExecutable) {
                // If the file has a shebang or is executable.
                // This is usually a mistake for non-shebang files.
                // For shebang files, it's good to see a visual confirmation.
                return [{
                    label: "+x",
                    position: START_POSITION,
                    paddingRight: true,
                    tooltip: "This file is marked as executable.",
                }];
            }

            return [];
        },
    };
}
