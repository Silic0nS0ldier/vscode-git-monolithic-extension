import type { Repository } from "../../git.js";
import { createCachedLookup } from "../../util/cached-lookup.js";

export type InputTemplate = {
    /** A merge or squash in progress supplies its own message; otherwise the cached commit template. */
    get(): Promise<string>;
    /** Drops the cached commit template, so the next `get()` resolves it again. */
    invalidate(): void;
};

export function createInputTemplate(repository: Repository): InputTemplate {
    const commitTemplate = createCachedLookup(() => repository.getCommitTemplate());

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

            return await commitTemplate.get();
        },
        invalidate: commitTemplate.invalidate,
    };
}
