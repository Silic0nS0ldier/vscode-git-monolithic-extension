import fs from "node:fs/promises";

const repoRoot = new URL("../../", import.meta.url);
const moduleBazelPath = new URL("MODULE.bazel", repoRoot);

// Repo name in MODULE.bazel -> dugite-native release asset platform.
const PLATFORMS = {
    dugite_linux_x64: "ubuntu-x64",
    dugite_linux_arm64: "ubuntu-arm64",
    dugite_darwin_x64: "macOS-x64",
    dugite_darwin_arm64: "macOS-arm64",
};

let moduleBazelContent = await fs.readFile(moduleBazelPath, "utf-8");

const releaseMatch = moduleBazelContent.match(/_DUGITE_RELEASE = "(?<release>[^"]*)"/);
if (!releaseMatch) {
    throw new Error("Could not find _DUGITE_RELEASE in MODULE.bazel");
}
const release = releaseMatch.groups.release;

const releaseRes = await fetch(
    `https://api.github.com/repos/desktop/dugite-native/releases/tags/${release}`,
    { headers: { accept: "application/vnd.github+json" } },
);
if (!releaseRes.ok) {
    throw new Error(`Failed to fetch dugite-native release ${release}: ${releaseRes.status}`);
}
const assetUrls = new Map(
    (await releaseRes.json()).assets.map(asset => [asset.name, asset.browser_download_url]),
);

const assetVersions = new Set();
for (const [repoName, platform] of Object.entries(PLATFORMS)) {
    const suffix = `-${platform}.tar.gz`;
    const assetName = Array.from(assetUrls.keys()).find(name => name.endsWith(suffix));
    if (!assetName) {
        throw new Error(`dugite-native ${release} has no ${platform} tarball`);
    }
    assetVersions.add(assetName.slice("dugite-native-".length, -suffix.length));

    const checksumUrl = assetUrls.get(`${assetName}.sha256`);
    if (!checksumUrl) {
        throw new Error(`dugite-native ${release} has no checksum for ${assetName}`);
    }
    const checksumRes = await fetch(checksumUrl);
    if (!checksumRes.ok) {
        throw new Error(`Failed to fetch ${assetName}.sha256: ${checksumRes.status}`);
    }
    const sha256 = (await checksumRes.text()).trim().split(/\s+/)[0];
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
        throw new Error(`${assetName}.sha256 did not contain a sha256 digest`);
    }

    // buildifier alphabetises attributes, so match the whole block by name and
    // substitute within it rather than assuming a fixed attribute order.
    const blockRe = new RegExp(`http_archive\\(\\s*name = "${repoName}",[\\s\\S]*?\\n\\)`);
    const blockMatch = moduleBazelContent.match(blockRe);
    if (!blockMatch) {
        throw new Error(`Could not find http_archive block for ${repoName} in MODULE.bazel`);
    }
    const updatedBlock = blockMatch[0].replace(/sha256\s*=\s*"[^"]*"/, `sha256 = "${sha256}"`);
    moduleBazelContent = moduleBazelContent.slice(0, blockMatch.index)
        + updatedBlock
        + moduleBazelContent.slice(blockMatch.index + blockMatch[0].length);
}

if (assetVersions.size !== 1) {
    throw new Error(`dugite-native ${release} assets disagree on version: ${[...assetVersions]}`);
}
moduleBazelContent = moduleBazelContent.replace(
    /_DUGITE_ASSET_VERSION = "[^"]*"/,
    `_DUGITE_ASSET_VERSION = "${[...assetVersions][0]}"`,
);

await fs.writeFile(moduleBazelPath, moduleBazelContent, "utf-8");
