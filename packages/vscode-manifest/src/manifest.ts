import { getItems, getProperties, getProperty, getString, type JsonNode, type ParseError, parseJson } from "./json.js";
import type { Location } from "./location.js";

/** A use of an id (command or submenu) at some location. */
export interface IdReference {
    readonly id: string;
    readonly location: Location;
}

export interface CommandDeclaration extends IdReference {
    /** Location of the whole `contributes.commands` entry. */
    readonly entryLocation: Location;
}

export interface MenuItem {
    /** The menu the item is contributed to, e.g. `scm/title` or a submenu id. */
    readonly menu: string;
    readonly command?: IdReference | undefined;
    /** Command run instead of `command` when the menu is opened with Alt held. */
    readonly alt?: IdReference | undefined;
    readonly submenu?: IdReference | undefined;
    readonly when?: string | undefined;
    readonly location: Location;
}

export interface NlsReference {
    readonly key: string;
    readonly location: Location;
}

export interface Manifest {
    readonly commands: readonly CommandDeclaration[];
    readonly menuItems: readonly MenuItem[];
    readonly keybindings: readonly IdReference[];
    readonly submenus: readonly IdReference[];
    /** Every whole-string `%key%` placeholder, anywhere in the manifest. */
    readonly nlsReferences: readonly NlsReference[];
}

export type ManifestParseResult =
    | { readonly manifest: Manifest; readonly error?: undefined }
    | { readonly manifest?: undefined; readonly error: ParseError };

const NLS_PLACEHOLDER = /^%(.+)%$/;

/**
 * Parses an extension's `package.json` into the contributions that matter for command bookkeeping.
 */
export function parseManifest(file: string, text: string): ManifestParseResult {
    const parsed = parseJson(file, text);
    if (parsed.error) {
        return { error: parsed.error };
    }

    const contributes = getProperty(parsed.root, "contributes")?.value;
    const toReference = (node: JsonNode | undefined, key: string): IdReference | undefined => {
        const value = getString(node, key);
        return value && { id: value.value, location: value.location };
    };

    const commands: CommandDeclaration[] = [];
    for (const entry of getItems(getProperty(contributes, "commands")?.value)) {
        const id = toReference(entry, "command");
        if (id) {
            commands.push({ ...id, entryLocation: entry.location });
        }
    }

    const menuItems: MenuItem[] = [];
    for (const menu of getProperties(getProperty(contributes, "menus")?.value)) {
        for (const entry of getItems(menu.value)) {
            menuItems.push({
                menu: menu.key,
                command: toReference(entry, "command"),
                alt: toReference(entry, "alt"),
                submenu: toReference(entry, "submenu"),
                when: getString(entry, "when")?.value,
                location: entry.location,
            });
        }
    }

    const keybindings = getItems(getProperty(contributes, "keybindings")?.value)
        .map(entry => toReference(entry, "command"))
        .filter(r => r !== undefined);

    const submenus = getItems(getProperty(contributes, "submenus")?.value)
        .map(entry => toReference(entry, "id"))
        .filter(r => r !== undefined);

    const nlsReferences: NlsReference[] = [];
    (function collect(node: JsonNode): void {
        switch (node.kind) {
            case "string": {
                const match = NLS_PLACEHOLDER.exec(node.value);
                if (match) {
                    nlsReferences.push({ key: match[1]!, location: node.location });
                }
                break;
            }
            case "array":
                node.items.forEach(collect);
                break;
            case "object":
                node.properties.forEach(p => collect(p.value));
                break;
        }
    })(parsed.root);

    return { manifest: { commands, menuItems, keybindings, submenus, nlsReferences } };
}
