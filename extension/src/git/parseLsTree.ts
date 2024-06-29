export interface LsTreeElement {
    mode: string;
    type: string;
    object: string;
    size: string;
    file: string;
}

export function parseLsTree(raw: string): LsTreeElement[] {
    return raw.split("\n")
        .filter(l => !!l)
        .map(line => /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line)!)
        .filter(m => !!m)
        .map(([, mode, type, object, size, file]) => ({ file, mode, object, size, type }));
}
