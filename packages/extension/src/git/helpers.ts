// https://github.com/microsoft/vscode/issues/89373
// https://github.com/git-for-windows/git/issues/2478
export function sanitizePath(path: string): string {
    return path.replace(/^([a-z]):\\/i, (_, letter) => `${letter.toUpperCase()}:\\`);
}
