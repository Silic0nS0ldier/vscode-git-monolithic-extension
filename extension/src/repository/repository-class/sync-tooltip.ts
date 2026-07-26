import type { Branch, Remote } from "../../api/git.js";
import * as i18n from "../../i18n/mod.js";
import { getSyncStatus } from "./sync-status.js";

export function syncTooltip(
    head: Branch | undefined,
    remotes: Remote[],
): string {
    const status = getSyncStatus(head, remotes);

    if (!status) {
        return i18n.Translations.syncChanges();
    }

    const { HEAD, remote } = status;

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
