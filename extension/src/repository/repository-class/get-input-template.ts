import type { Repository } from "../../git.js";

export type InputTemplate = {
    /** A merge or squash in progress supplies its own message; otherwise the cached commit template. */
    get(): Promise<string>;
    /** Drops the cached commit template, so the next `get()` resolves it again. */
    invalidate(): void;
};

export function createInputTemplate(repository: Repository): InputTemplate {
    let commitTemplate: Promise<string> | undefined;

    return {
        async get() {
            const [mergeMessage, squashMessage] = await Promise.all([
                repository.getMergeMessage(),
                repository.getSquashMessage(),
            ]);

            const message = mergeMessage || squashMessage;
            if (message) {
                return message;
            }

            commitTemplate ??= repository.getCommitTemplate();
            return await commitTemplate;
        },
        invalidate() {
            commitTemplate = undefined;
        },
    };
}
