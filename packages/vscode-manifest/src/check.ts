import { API } from "typescript/sync";
import type { Location } from "./location.js";
import { type IdReference, type Manifest, parseManifest } from "./manifest.js";
import { type NlsEntry, parseNls } from "./nls.js";
import { scanSource, type SourceCommands, type SourceScanOptions } from "./sources.js";

export type DiagnosticCode =
    /** A file could not be parsed. */
    | "parse-error"
    /** A command is declared or registered more than once. VSCode rejects duplicate registrations at runtime. */
    | "duplicate-command"
    /** A command is declared in the manifest, but nothing registers it. */
    | "unimplemented-command"
    /** A command is registered, but neither the command palette, a menu, a keybinding, nor the code can run it. */
    | "unreachable-command"
    /** A menu, keybinding or code reference names a command that is neither declared nor registered. */
    | "unknown-command"
    /** A menu item names a submenu that is not declared. */
    | "unknown-submenu"
    /** A submenu is declared, but no menu item opens it. */
    | "unused-submenu"
    /** The manifest uses a `%key%` that the nls file does not define. */
    | "missing-nls-key"
    /** The nls file defines a key that the manifest does not use. */
    | "unused-nls-key";

export interface Diagnostic {
    readonly code: DiagnosticCode;
    /** The command id, submenu id, nls key or file the diagnostic is about. */
    readonly subject: string;
    readonly message: string;
    readonly location: Location;
}

export interface CheckInput {
    readonly manifest: Manifest;
    readonly nls: readonly NlsEntry[];
    readonly sources: readonly SourceCommands[];
}

function groupById<T extends { readonly id: string }>(items: Iterable<T>): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const group = groups.get(item.id);
        if (group) {
            group.push(item);
        } else {
            groups.set(item.id, [item]);
        }
    }
    return groups;
}

function compareLocations(a: Location, b: Location): number {
    return a.file < b.file ? -1 : a.file > b.file ? 1 : a.start - b.start;
}

/**
 * Checks that the manifest's command, menu, keybinding, submenu and nls contributions agree with each other and
 * with the command registrations and references found in source.
 */
export function check({ manifest, nls, sources }: CheckInput): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const report = (code: DiagnosticCode, subject: string, message: string, location: Location): void => {
        diagnostics.push({ code, subject, message, location });
    };

    const declared = groupById(manifest.commands);
    const registered = groupById(sources.flatMap(s => s.registrations));

    for (const [id, declarations] of declared) {
        for (const duplicate of declarations.slice(1)) {
            report("duplicate-command", id, `Command "${id}" is declared more than once.`, duplicate.location);
        }
    }
    for (const [id, registrations] of registered) {
        for (const duplicate of registrations.slice(1)) {
            report("duplicate-command", id, `Command "${id}" is registered more than once.`, duplicate.location);
        }
    }

    for (const [id, [declaration]] of declared) {
        if (!registered.has(id)) {
            report(
                "unimplemented-command",
                id,
                `Command "${id}" is declared but never registered.`,
                declaration!.location,
            );
        }
    }

    const hiddenFromPalette = new Set<string>();
    const reachedBy: IdReference[] = [...manifest.keybindings, ...sources.flatMap(s => s.references)];
    for (const item of manifest.menuItems) {
        if (item.menu === "commandPalette") {
            if (item.command && item.when === "false") {
                hiddenFromPalette.add(item.command.id);
            }
        } else {
            reachedBy.push(...[item.command, item.alt].filter(r => r !== undefined));
        }
    }
    const reached = new Set(reachedBy.map(r => r.id));

    for (const [id, [registration]] of registered) {
        const inPalette = declared.has(id) && !hiddenFromPalette.has(id);
        if (!inPalette && !reached.has(id)) {
            const why = declared.has(id) ? "is hidden from the command palette and" : "is not declared and";
            report(
                "unreachable-command",
                id,
                `Command "${id}" ${why} no menu, keybinding or code references it.`,
                declared.get(id)?.[0]!.location ?? registration!.location,
            );
        }
    }

    const commandReferences = [
        ...reachedBy,
        ...manifest.menuItems.filter(i => i.menu === "commandPalette").flatMap(i => i.command ?? []),
    ];
    for (const reference of commandReferences) {
        if (!declared.has(reference.id) && !registered.has(reference.id)) {
            report("unknown-command", reference.id, `Command "${reference.id}" does not exist.`, reference.location);
        }
    }

    const submenus = groupById(manifest.submenus);
    const openedSubmenus = new Set<string>();
    for (const item of manifest.menuItems) {
        if (item.submenu) {
            openedSubmenus.add(item.submenu.id);
            if (!submenus.has(item.submenu.id)) {
                report(
                    "unknown-submenu",
                    item.submenu.id,
                    `Submenu "${item.submenu.id}" is not declared.`,
                    item.submenu.location,
                );
            }
        }
    }
    for (const [id, [submenu]] of submenus) {
        if (!openedSubmenus.has(id)) {
            report("unused-submenu", id, `Submenu "${id}" is declared but no menu item opens it.`, submenu!.location);
        }
    }

    const nlsKeys = new Set(nls.map(e => e.key));
    const usedNlsKeys = new Set(manifest.nlsReferences.map(r => r.key));
    for (const reference of manifest.nlsReferences) {
        if (!nlsKeys.has(reference.key)) {
            report("missing-nls-key", reference.key, `nls key "${reference.key}" is not defined.`, reference.location);
        }
    }
    for (const entry of nls) {
        if (!usedNlsKeys.has(entry.key)) {
            report("unused-nls-key", entry.key, `nls key "${entry.key}" is not used by the manifest.`, entry.location);
        }
    }

    return diagnostics.sort((a, b) => compareLocations(a.location, b.location));
}

export interface SourceText {
    readonly file: string;
    readonly text: string;
}

export interface ProjectInput {
    readonly manifest: SourceText;
    readonly nls: SourceText;
    readonly sources: readonly SourceText[];
    readonly options: SourceScanOptions;
}

/**
 * Parses and checks a whole extension. Parse failures are reported as diagnostics rather than thrown.
 */
export function checkProject({ manifest, nls, sources, options }: ProjectInput): Diagnostic[] {
    using api = new API();
    const parsedManifest = parseManifest(api, manifest.file, manifest.text);
    const parsedNls = parseNls(api, nls.file, nls.text);

    const parseErrors: Diagnostic[] = [];
    for (const [file, error] of [[manifest.file, parsedManifest.error], [nls.file, parsedNls.error]] as const) {
        if (error) {
            parseErrors.push({ code: "parse-error", subject: file, message: error.message, location: error.location });
        }
    }
    if (parsedManifest.error || parsedNls.error) {
        return parseErrors;
    }

    return check({
        manifest: parsedManifest.manifest,
        nls: parsedNls.entries,
        sources: sources.map(s => scanSource(api, s.file, s.text, options)),
    });
}

export function formatDiagnostic({ code, message, location }: Diagnostic): string {
    return `${location.file}:${location.line}:${location.column} ${code}: ${message}`;
}
