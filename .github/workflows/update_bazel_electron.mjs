import fs from "node:fs/promises";

const repoRoot = new URL("../../", import.meta.url);
const packageJsonPath = new URL("extension/vsix/package.json", repoRoot);
const pinPath = new URL("electron-pin.json", repoRoot);
const moduleBazelPath = new URL("MODULE.bazel", repoRoot);

const pkg = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
const engineRange = pkg.engines?.vscode;
const versionMatch = engineRange?.match(/\d+\.\d+\.\d+/);
if (!versionMatch) {
    throw new Error(`Could not parse a minimum version out of engines.vscode: "${engineRange}"`);
}
const vscodeVersion = versionMatch[0];

const currentPin = JSON.parse(await fs.readFile(pinPath, "utf-8"));
if (currentPin.vscodeVersion === vscodeVersion) {
    console.log(`electron-pin.json already pinned for VS Code ${vscodeVersion}; nothing to do.`);
    process.exit(0);
}

const vscodePackageJsonRes = await fetch(
    `https://raw.githubusercontent.com/microsoft/vscode/${vscodeVersion}/package.json`,
);
if (!vscodePackageJsonRes.ok) {
    throw new Error(`Failed to fetch VS Code ${vscodeVersion} package.json: ${vscodePackageJsonRes.status}`);
}
const vscodePackageJson = await vscodePackageJsonRes.json();
const electronVersion = vscodePackageJson.devDependencies?.electron;
if (!electronVersion) {
    throw new Error(`microsoft/vscode@${vscodeVersion} package.json has no devDependencies.electron`);
}

const shasumsRes = await fetch(
    `https://github.com/electron/electron/releases/download/v${electronVersion}/SHASUMS256.txt`,
);
if (!shasumsRes.ok) {
    throw new Error(`Failed to fetch SHASUMS256.txt for electron v${electronVersion}: ${shasumsRes.status}`);
}
const shasumsText = await shasumsRes.text();
const shaByFilename = new Map(
    shasumsText.split("\n").filter(Boolean).map(line => {
        const [sha, filename] = line.trim().split(/\s+/);
        return [filename.replace(/^\*/, ""), sha];
    }),
);

const PLATFORMS = [
    { repoName: "electron_linux_x64", archive: "linux-x64.zip" },
    { repoName: "electron_linux_arm64", archive: "linux-arm64.zip" },
    { repoName: "electron_darwin_x64", archive: "darwin-x64.zip" },
    { repoName: "electron_darwin_arm64", archive: "darwin-arm64.zip" },
];

let moduleBazelContent = await fs.readFile(moduleBazelPath, "utf-8");
for (const { repoName, archive } of PLATFORMS) {
    const filename = `electron-v${electronVersion}-${archive}`;
    const sha256 = shaByFilename.get(filename);
    if (!sha256) {
        throw new Error(`SHASUMS256.txt for electron v${electronVersion} has no entry for ${filename}`);
    }
    const url = `https://github.com/electron/electron/releases/download/v${electronVersion}/${filename}`;

    // buildifier alphabetises attributes (build_file_content, sha256, url), so
    // match the whole block by name and substitute url/sha256 within it
    // independently, rather than assuming a fixed attribute order.
    const blockRe = new RegExp(`http_archive\\(\\s*name = "${repoName}",[\\s\\S]*?\\n\\)`);
    const blockMatch = moduleBazelContent.match(blockRe);
    if (!blockMatch) {
        throw new Error(`Could not find http_archive block for ${repoName} in MODULE.bazel`);
    }
    const updatedBlock = blockMatch[0]
        .replace(/url\s*=\s*"[^"]*"/, `url = "${url}"`)
        .replace(/sha256\s*=\s*"[^"]*"/, `sha256 = "${sha256}"`);
    moduleBazelContent = moduleBazelContent.slice(0, blockMatch.index)
        + updatedBlock
        + moduleBazelContent.slice(blockMatch.index + blockMatch[0].length);
}
await fs.writeFile(moduleBazelPath, moduleBazelContent, "utf-8");

await fs.writeFile(
    pinPath,
    JSON.stringify({ vscodeVersion, electronVersion }, null, 4) + "\n",
    "utf-8",
);

console.log(`Pinned Electron ${electronVersion} for VS Code ${vscodeVersion}.`);
