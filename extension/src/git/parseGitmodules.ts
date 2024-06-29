import type { Submodule } from "./Submodule.js";

export function parseGitmodules(raw: string): Submodule[] {
    const regex = /\r?\n/g;
    let position = 0;
    let match: RegExpExecArray | null = null;

    const result: Submodule[] = [];
    let submodule: Partial<Submodule> = {};

    function parseLine(line: string): void {
        const sectionMatch = /^\s*\[submodule "([^"]+)"\]\s*$/.exec(line);

        if (sectionMatch) {
            if (submodule.name && submodule.path && submodule.url) {
                result.push(submodule as Submodule);
            }

            const name = sectionMatch[1];

            if (name) {
                submodule = { name };
                return;
            }
        }

        if (!submodule) {
            return;
        }

        const propertyMatch = /^\s*(\w+)\s*=\s*(.*)$/.exec(line);

        if (!propertyMatch) {
            return;
        }

        const [, key, value] = propertyMatch;

        switch (key) {
            case "path":
                submodule.path = value;
                break;
            case "url":
                submodule.url = value;
                break;
        }
    }

    while (match = regex.exec(raw)) {
        parseLine(raw.substring(position, match.index));
        position = match.index + match[0].length;
    }

    parseLine(raw.substring(position));

    if (submodule.name && submodule.path && submodule.url) {
        result.push(submodule as Submodule);
    }

    return result;
}
