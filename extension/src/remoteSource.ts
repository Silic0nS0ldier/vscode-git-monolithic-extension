/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type QuickPick, type QuickPickItem, window } from "vscode";
import type { RemoteSource, RemoteSourceProvider } from "./api/git.js";
import * as i18n from "./i18n/mod.js";
import { prettyPrint } from "./logging/pretty-print.js";
import type { Model } from "./model.js";
import { debounce } from "./package-patches/just-debounce.js";
import { throat } from "./package-patches/throat.js";

async function getQuickPickResult<T extends QuickPickItem>(quickpick: QuickPick<T>): Promise<T | undefined> {
    const result = await new Promise<T | undefined>(c => {
        quickpick.onDidAccept(() => c(quickpick.selectedItems[0]));
        quickpick.onDidHide(() => c(undefined));
        quickpick.show();
    });

    quickpick.hide();
    return result;
}

class RemoteSourceProviderQuickPick {
    #quickpick: QuickPick<QuickPickItem & { remoteSource?: RemoteSource }>;
    #provider: RemoteSourceProvider;

    constructor(provider: RemoteSourceProvider) {
        this.#provider = provider;
        this.#quickpick = window.createQuickPick();
        this.#quickpick.ignoreFocusOut = true;

        if (this.#provider.supportsQuery) {
            this.#quickpick.placeholder = i18n.Translations.typeToSearch();
            this.#quickpick.onDidChangeValue(this.#onDidChangeValue, this);
        } else {
            this.#quickpick.placeholder = i18n.Translations.typeToFilter();
        }
    }

    #query = throat(1, async () => {
        this.#quickpick.busy = true;

        try {
            const remoteSources = await this.#provider.getRemoteSources(this.#quickpick.value) || [];

            if (remoteSources.length === 0) {
                this.#quickpick.items = [{
                    alwaysShow: true,
                    label: i18n.Translations.noneFound(),
                }];
            } else {
                this.#quickpick.items = remoteSources.map(remoteSource => ({
                    alwaysShow: true,
                    description: remoteSource.description
                        || (typeof remoteSource.url === "string" ? remoteSource.url : remoteSource.url[0]),
                    label: remoteSource.name,
                    remoteSource,
                }));
            }
        } catch (err) {
            this.#quickpick.items = [{
                alwaysShow: true,
                label: i18n.Translations.error(prettyPrint(err)),
            }];
            // TODO Follow up, this won't go anywhere useful
            console.error(err);
        } finally {
            this.#quickpick.busy = false;
        }
    });

    #onDidChangeValue = debounce(this.#query, 300);

    async pick(): Promise<RemoteSource | undefined> {
        this.#query();
        const result = await getQuickPickResult(this.#quickpick);
        return result?.remoteSource;
    }
}

export interface PickRemoteSourceOptions {
    readonly providerLabel?: (provider: RemoteSourceProvider) => string;
    readonly urlLabel?: string;
    readonly providerName?: string;
    readonly branch?: boolean; // then result is PickRemoteSourceResult
}

export interface PickRemoteSourceResult {
    readonly url: string;
    readonly branch?: string;
}

export async function pickRemoteSource(
    model: Model,
    options: PickRemoteSourceOptions & { branch?: false | undefined },
): Promise<string | undefined>;
export async function pickRemoteSource(
    model: Model,
    options: PickRemoteSourceOptions & { branch: true },
): Promise<PickRemoteSourceResult | undefined>;
export async function pickRemoteSource(
    model: Model,
    options: PickRemoteSourceOptions = {},
): Promise<string | PickRemoteSourceResult | undefined> {
    const quickpick = window.createQuickPick<(QuickPickItem & { provider?: RemoteSourceProvider; url?: string })>();
    quickpick.ignoreFocusOut = true;

    if (options.providerName) {
        const provider = model.getRemoteProviders()
            .filter(provider => provider.name === options.providerName)[0];

        if (provider) {
            return await pickProviderSource(provider, options);
        }
    }

    const providers = model.getRemoteProviders()
        .map(provider => ({
            alwaysShow: true,
            label: (provider.icon ? `$(${provider.icon}) ` : "") + (options.providerLabel
                ? options.providerLabel(provider)
                : provider.name),
            provider,
        }));

    quickpick.placeholder = providers.length === 0
        ? i18n.Translations.provideUrl()
        : i18n.Translations.provideUrlOrPick();

    const updatePicks = (value?: string): void => {
        if (value) {
            quickpick.items = [{
                alwaysShow: true,
                description: value,
                label: options.urlLabel ?? i18n.Translations.url(),
                url: value,
            }, ...providers];
        } else {
            quickpick.items = providers;
        }
    };

    quickpick.onDidChangeValue(updatePicks);
    updatePicks();

    const result = await getQuickPickResult(quickpick);

    if (result) {
        if (result.url) {
            return result.url;
        } else if (result.provider) {
            return await pickProviderSource(result.provider, options);
        }
    }

    return undefined;
}

async function pickProviderSource(
    provider: RemoteSourceProvider,
    options: PickRemoteSourceOptions = {},
): Promise<string | PickRemoteSourceResult | undefined> {
    const quickpick = new RemoteSourceProviderQuickPick(provider);
    const remote = await quickpick.pick();

    let url: string | undefined;

    if (remote) {
        if (typeof remote.url === "string") {
            url = remote.url;
        } else if (remote.url.length > 0) {
            url = await window.showQuickPick(remote.url, {
                ignoreFocusOut: true,
                placeHolder: i18n.Translations.pickUrl(),
            });
        }
    }

    if (!url || !options.branch) {
        return url;
    }

    if (!provider.getBranches) {
        return { url };
    }

    const branches = await provider.getBranches(url);

    if (!branches) {
        return { url };
    }

    const branch = await window.showQuickPick(branches, {
        placeHolder: i18n.Translations.branchName(),
    });

    if (!branch) {
        return { url };
    }

    return { branch, url };
}
