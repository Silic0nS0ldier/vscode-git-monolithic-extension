import { type InlayHintsProvider, type InlayHint, Position } from "vscode";
import { hasExecutableBit } from "monolithic-git-interop/api/ls-tree/has-executable-bit";
import { fromGitUri, isGitUri } from "../uri.js";

const START_POSITION = new Position(0, 0);

export function createInlayHintsProvider(): InlayHintsProvider {
    return {
        // TODO Wire up for configuration (disabling inlay hint)
        onDidChangeInlayHints: undefined,
        async provideInlayHints(document, range, token) {
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

            const r = await hasExecutableBit(null, null, filePath, ref);

            const hint: InlayHint = {
                label: "Example Hint",
                position: START_POSITION,
                paddingRight: true,
                tooltip: "This is an example inlay hint",
            };
            return [hint];
        },
        resolveInlayHint(hint, token) {
            // Example implementation: return the hint as is
            return hint;
        }
    };
}
