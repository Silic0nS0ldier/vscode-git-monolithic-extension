export interface LsFilesElement {
    mode: string;
    object: string;
    stage: string;
    file: string;
}

export function parseLsFiles(raw: string): LsFilesElement[] {
    return raw.split("\n")
        .filter(l => !!l)
        .map(line => /^(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line)!)
        .filter(m => !!m)
        .map(([, mode, object, stage, file]) => ({ file, mode, object, stage }));
}
