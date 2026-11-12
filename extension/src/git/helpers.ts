// https://github.com/microsoft/vscode/issues/89373
// https://github.com/git-for-windows/git/issues/2478
export function sanitizePath(path: string | URL): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call -- `letter` is typed as `any` by TypeScript, need to refactor (with tests)
    return path.toString().replace(/^([a-z]):\\/i, (_, letter) => `${letter.toUpperCase()}:\\`);
}
