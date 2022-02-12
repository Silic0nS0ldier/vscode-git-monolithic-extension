export function isWindows(platform: string): platform is "win32" {
    return platform === "win32";
}

export function isMacOS(platform: string): platform is "darwin" {
    return platform === "darwin";
}
