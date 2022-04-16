import type { Branch, Remote } from "../../api/git.js";
import * as i18n from "../../i18n/mod.js";

export function syncTooltip(
    HEAD: Branch | undefined,
    remotes: Remote[],
) {
    if (
        !HEAD
        || !HEAD.name
        || !HEAD.commit
        || !HEAD.upstream
        || !(HEAD.ahead || HEAD.behind)
    ) {
        return i18n.Translations.syncChanges();
    }

    const remoteName = HEAD && HEAD.remote || HEAD.upstream.remote;
    const remote = remotes.find(r => r.name === remoteName);

    // TODO Revisit the strange nullability here
    if ((remote && remote.isReadOnly) || !HEAD.ahead) {
        return i18n.Translations.pullN(
            HEAD.behind ?? Number.NaN,
            HEAD.upstream.remote,
            HEAD.upstream.name,
        );
    } else if (!HEAD.behind) {
        return i18n.Translations.pushN(
            HEAD.ahead ?? Number.NaN,
            HEAD.upstream.remote,
            HEAD.upstream.name,
        );
    } else {
        return i18n.Translations.pullPushN(
            HEAD.behind ?? Number.NaN,
            HEAD.ahead ?? Number.NaN,
            HEAD.upstream.remote,
            HEAD.upstream.name,
        );
    }
}
