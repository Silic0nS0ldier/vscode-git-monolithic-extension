import { readFile } from "node:fs/promises";

// Drift guard for the VS Code version floor: the extension cannot require, or compile
// against, a build newer than the code-server release that hosts `//integration_tests`.

const [moduleBazelPath, packageJsonPath, extensionPackageJsonPath] = process.argv.slice(2);
if (!moduleBazelPath || !packageJsonPath || !extensionPackageJsonPath) {
    console.error("usage: check-code-server-pin.mjs <MODULE.bazel> <vsix package.json> <extension package.json>");
    process.exit(1);
}

const moduleBazelContent = await readFile(moduleBazelPath, "utf-8");
const releaseMatch = moduleBazelContent.match(/_CODE_SERVER_RELEASE = "(?<release>\d+)\.(?<rest>\d+\.\d+)"/);
if (!releaseMatch) {
    console.error(`Could not find _CODE_SERVER_RELEASE in ${moduleBazelPath}`);
    process.exit(1);
}
// code-server 4.x.y bundles Code 1.x.y.
const bundledVscodeVersion = `1.${releaseMatch.groups.rest}`;

const pkg = JSON.parse(await readFile(packageJsonPath, "utf-8"));
const engineRange = pkg.engines?.vscode;
const match = engineRange?.match(/\d+\.\d+\.\d+/);
if (!match) {
    console.error(`Could not parse a minimum version out of engines.vscode: "${engineRange}"`);
    process.exit(1);
}
const minVscodeVersion = match[0];

if (minVscodeVersion !== bundledVscodeVersion) {
    console.error(
        `engines.vscode is out of sync with code-server: ${packageJsonPath} requires ${engineRange} `
            + `(minimum ${minVscodeVersion}), but the pinned code-server release bundles `
            + `VS Code ${bundledVscodeVersion}.`,
    );
    console.error("Remediation: node ./.github/workflows/update_bazel_code_server.mjs");
    process.exit(1);
}

// `@types/vscode` decides which APIs typecheck, so a version above the host lets the
// extension call APIs the host does not implement. It is not published for every VS Code
// release, so it only has to stay at or below the bundled build, not match it.
const extensionPkg = JSON.parse(await readFile(extensionPackageJsonPath, "utf-8"));
const typesPin = extensionPkg.devDependencies?.["@types/vscode"];
if (!/^\d+\.\d+\.\d+$/.test(typesPin ?? "")) {
    console.error(
        `@types/vscode must be pinned to an exact version in ${extensionPackageJsonPath}, found "${typesPin}". `
            + "A range lets a later install resolve past the host's API surface.",
    );
    process.exit(1);
}

const toParts = version => version.split(".").map(Number);
const compare = (a, b) => {
    const [aParts, bParts] = [toParts(a), toParts(b)];
    for (let i = 0; i < 3; i++) {
        if (aParts[i] !== bParts[i]) {
            return aParts[i] - bParts[i];
        }
    }
    return 0;
};

if (compare(typesPin, bundledVscodeVersion) > 0) {
    console.error(
        `@types/vscode is ahead of code-server: ${extensionPackageJsonPath} pins ${typesPin}, but the pinned `
            + `code-server release bundles VS Code ${bundledVscodeVersion}. Compiling against a newer API surface `
            + "than the host lets the extension call APIs that do not exist at runtime.",
    );
    console.error("Remediation: node ./.github/workflows/update_bazel_code_server.mjs");
    process.exit(1);
}

console.log(
    `OK: engines.vscode (${engineRange}) matches the pinned code-server release, `
        + `and @types/vscode (${typesPin}) is not ahead of it.`,
);
