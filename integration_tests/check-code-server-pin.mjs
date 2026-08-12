import { readFile } from "node:fs/promises";

// Drift guard for the VS Code version floor: the extension cannot require a build newer
// than the code-server release that hosts `//integration_tests`.

const [moduleBazelPath, packageJsonPath] = process.argv.slice(2);
if (!moduleBazelPath || !packageJsonPath) {
    console.error("usage: check-code-server-pin.mjs <MODULE.bazel> <package.json>");
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

console.log(`OK: engines.vscode (${engineRange}) matches the pinned code-server release.`);
