import fs from "node:fs/promises";

// code-server is the source of truth for the VS Code version this repo targets. Its
// releases are cut from upstream VS Code, so they land a few days later; deriving
// `engines.vscode` from the pinned release keeps the extension floor and the
// integration test host from drifting apart.

const repoRoot = new URL("../../", import.meta.url);
const moduleBazelPath = new URL("MODULE.bazel", repoRoot);
const packageJsonPath = new URL("extension/vsix/package.json", repoRoot);

// Repo name in MODULE.bazel -> code-server release asset platform.
const PLATFORMS = {
    code_server_linux_x64: "linux-amd64",
    code_server_linux_arm64: "linux-arm64",
};

let moduleBazelContent = await fs.readFile(moduleBazelPath, "utf-8");

const releaseMatch = moduleBazelContent.match(/_CODE_SERVER_RELEASE = "(?<release>[^"]*)"/);
if (!releaseMatch) {
    throw new Error("Could not find _CODE_SERVER_RELEASE in MODULE.bazel");
}
const release = releaseMatch.groups.release;

const releaseRes = await fetch(
    `https://api.github.com/repos/coder/code-server/releases/tags/v${release}`,
    { headers: { accept: "application/vnd.github+json" } },
);
if (!releaseRes.ok) {
    throw new Error(`Failed to fetch code-server release v${release}: ${releaseRes.status}`);
}
const releaseJson = await releaseRes.json();

// Release notes open with the bundled build, e.g. "Code v1.132.0". The 4.x.y <-> 1.x.y
// alignment is a convention, so read the version rather than deriving it from the tag.
const vscodeMatch = releaseJson.body?.match(/Code v(?<version>\d+\.\d+\.\d+)/);
if (!vscodeMatch) {
    throw new Error(`code-server v${release} release notes do not state the bundled Code version`);
}
const vscodeVersion = vscodeMatch.groups.version;

const assetsByName = new Map(releaseJson.assets.map(asset => [asset.name, asset]));
for (const [repoName, platform] of Object.entries(PLATFORMS)) {
    const assetName = `code-server-${release}-${platform}.tar.gz`;
    const asset = assetsByName.get(assetName);
    if (!asset) {
        throw new Error(`code-server v${release} has no ${assetName}`);
    }
    const sha256 = asset.digest?.replace(/^sha256:/, "");
    if (!/^[0-9a-f]{64}$/.test(sha256 ?? "")) {
        throw new Error(`code-server v${release} exposes no sha256 digest for ${assetName}`);
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

await fs.writeFile(moduleBazelPath, moduleBazelContent, "utf-8");

// Rewritten in place, rather than via JSON.stringify, to leave the rest of the
// (generated contribution point heavy) manifest untouched.
const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
const engineRe = /("engines"\s*:\s*\{[^}]*"vscode"\s*:\s*")[^"]*(")/;
if (!engineRe.test(packageJsonContent)) {
    throw new Error("Could not find engines.vscode in extension/vsix/package.json");
}
await fs.writeFile(
    packageJsonPath,
    packageJsonContent.replace(engineRe, `$1^${vscodeVersion}$2`),
    "utf-8",
);

console.log(`Pinned code-server ${release} (VS Code ${vscodeVersion}).`);
