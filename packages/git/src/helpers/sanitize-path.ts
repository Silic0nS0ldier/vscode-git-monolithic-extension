/**
 * Normalises a filesystem path for consumption by the git CLI on Windows.
 *
 * git on Windows is picky about drive-letter case; a lower-case drive letter
 * in the path can cause git to treat the path as outside the working tree.
 * Uppercasing the drive letter avoids that.
 *
 * See:
 * - https://github.com/microsoft/vscode/issues/89373
 * - https://github.com/git-for-windows/git/issues/2478
 */
export function sanitizePath(path: string): string {
    return path.replace(/^([a-z]):\\/i, (_, letter: string) => `${letter.toUpperCase()}:\\`);
}
