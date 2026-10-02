import { createHash } from "node:crypto";

const KEY_ROOT = "bazel-hidden-lockfile-v1";

export type CacheKeys = {
    primary: string;
    restoreKeys: string[];
};

export function sha256(...parts: (Buffer | string)[]): string {
    const hash = createHash("sha256");
    for (const part of parts) {
        hash.update(part);
    }
    return hash.digest("hex");
}

// Hashes each file first so adjacent file boundaries can't shift between inputs.
export function moduleGraphDigest(moduleBazel: Buffer, moduleBazelLock: Buffer, bazelVersion: Buffer): string {
    return sha256(sha256(moduleBazel), sha256(moduleBazelLock), sha256(bazelVersion));
}

/**
 * The platform is in every segment: the hidden lockfile isn't platform-neutral in practice
 * (extensions may branch on the host without declaring it), so it must never cross platforms.
 */
export function deriveKeys(platform: string, graphDigest: string, pnpmLockDigest: string): CacheKeys {
    const platformRoot = `${KEY_ROOT}-${platform}-`;
    const prefix = `${platformRoot}${graphDigest}`;
    return {
        primary: `${prefix}-${pnpmLockDigest}`,
        restoreKeys: [`${prefix}-`, platformRoot],
    };
}
