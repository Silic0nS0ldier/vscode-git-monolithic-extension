type VersionComparisonResult = -1 | 0 | 1;

export interface Version {
    major: number;
    minor: number;
    patch: number;
    pre?: string;
}

export function compare(v1: string | Version, v2: string | Version): VersionComparisonResult {
    let normalisedV1 = v1;
    let normalisedV2 = v2;
    if (typeof normalisedV1 === "string") {
        normalisedV1 = fromString(normalisedV1);
    }
    if (typeof normalisedV2 === "string") {
        normalisedV2 = fromString(normalisedV2);
    }

    if (normalisedV1.major > normalisedV2.major) return 1;
    if (normalisedV1.major < normalisedV2.major) return -1;

    if (normalisedV1.minor > normalisedV2.minor) return 1;
    if (normalisedV1.minor < normalisedV2.minor) return -1;

    if (normalisedV1.patch > normalisedV2.patch) return 1;
    if (normalisedV1.patch < normalisedV2.patch) return -1;

    if (normalisedV1.pre === undefined && normalisedV2.pre !== undefined) return 1;
    if (normalisedV1.pre !== undefined && normalisedV2.pre === undefined) return -1;

    if (normalisedV1.pre !== undefined && normalisedV2.pre !== undefined) {
        return normalisedV1.pre.localeCompare(normalisedV2.pre) as VersionComparisonResult;
    }

    return 0;
}

export function from(
    major: string | number,
    minor: string | number,
    patch?: string | number,
    pre?: string,
): Version {
    return {
        major: typeof major === "string" ? parseInt(major, 10) : major,
        minor: typeof minor === "string" ? parseInt(minor, 10) : minor,
        patch: patch === undefined || patch === null ? 0 : typeof patch === "string" ? parseInt(patch, 10) : patch,
        pre: pre,
    };
}

export function fromString(version: string): Version {
    const [ver, pre] = version.split("-");
    const [major, minor, patch] = ver.split(".");
    return from(major, minor, patch, pre);
}
