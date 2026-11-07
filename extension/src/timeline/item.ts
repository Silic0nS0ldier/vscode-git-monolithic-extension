/* Copyright (c) Microsoft Corporation. Licensed under the MIT License. */

import path from "node:path";
import { type Command, type TextDocumentShowOptions, TimelineItem, type Uri } from "vscode";
import * as i18n from "../i18n/mod.js";

export class GitTimelineItem extends TimelineItem {
    constructor(
        readonly ref: string,
        readonly previousRef: string,
        readonly message: string,
        timestamp: number,
        id: string,
        contextValue: string,
        readonly rootUri: Uri,
        readonly previousUri?: Uri,
    ) {
        const newline = message.indexOf("\n");
        super(newline === -1 ? message : message.slice(0, newline), timestamp);
        this.id = id;
        this.contextValue = contextValue;
    }

    get shortRef(): string {
        return this.ref === "" || this.ref === "~" || this.ref === "HEAD" ? this.ref : this.ref.slice(0, 8);
    }
}

export function itemTitle(item: GitTimelineItem, uri: Uri): string {
    const basename = path.basename(uri.fsPath);
    if (item.ref === "") return i18n.Translations.gitTitleWorkingTree(basename);
    if (item.ref === "~") return i18n.Translations.gitTitleIndex(basename);
    return `${basename} (${item.shortRef})`;
}

export function resolveOpenDiff(
    item: GitTimelineItem,
    uri: Uri,
    options?: TextDocumentShowOptions,
): Command {
    if (!item.previousUri || !item.resourceUri) throw new Error("Timeline item has no comparable file versions");
    const title = item.ref === "" || item.ref === "~"
        ? itemTitle(item, uri)
        : i18n.Translations.timelineDiffTitle(path.basename(uri.fsPath), item.previousRef.slice(0, 8), item.shortRef);
    return {
        command: "vscode.diff",
        title: i18n.Translations.openComparison(),
        arguments: [item.previousUri, item.resourceUri, title, options],
    };
}
