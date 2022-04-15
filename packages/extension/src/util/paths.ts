import { sep } from "node:path";

function isWindowsPath(path: string): boolean {
    return /^[a-zA-Z]:\\/.test(path);
}

export function isDescendant(parent: string, descendant: string): boolean {
    let normalisedParent = parent;
    let normalisedDescendant = descendant;
    if (normalisedParent === normalisedDescendant) {
        return true;
    }

    if (normalisedParent.charAt(normalisedParent.length - 1) !== sep) {
        normalisedParent += sep;
    }

    // Windows is case insensitive
    if (isWindowsPath(normalisedParent)) {
        normalisedParent = normalisedParent.toLowerCase();
        normalisedDescendant = normalisedDescendant.toLowerCase();
    }

    return normalisedDescendant.startsWith(normalisedParent);
}

// TODO This is an oversimplification, sensitivity depends on the disk
export function pathEquals(a: string, b: string): boolean {
    let normalisedA = a;
    let normalisedB = b;
    // Windows is case insensitive
    if (isWindowsPath(normalisedA)) {
        normalisedA = normalisedA.toLowerCase();
        normalisedB = normalisedB.toLowerCase();
    }

    return normalisedA === normalisedB;
}
