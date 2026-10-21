import { getProperties, type ParseError, parseJson } from "./json.js";
import type { Location } from "./location.js";

export interface NlsEntry {
    readonly key: string;
    readonly value: string | undefined;
    readonly location: Location;
}

export type NlsParseResult =
    | { readonly entries: readonly NlsEntry[]; readonly error?: undefined }
    | { readonly entries?: undefined; readonly error: ParseError };

/**
 * Parses a `package.nls.json` string table.
 */
export function parseNls(file: string, text: string): NlsParseResult {
    const parsed = parseJson(file, text);
    if (parsed.error) {
        return { error: parsed.error };
    }
    const entries = getProperties(parsed.root).map(p => ({
        key: p.key,
        value: p.value.kind === "string" ? p.value.value : undefined,
        location: p.keyLocation,
    }));
    return { entries };
}
