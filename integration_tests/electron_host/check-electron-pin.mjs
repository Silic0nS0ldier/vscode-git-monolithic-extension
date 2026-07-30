import { readFile } from "node:fs/promises";

// Drift guard for `../electron-pin.json`.

const [pinPath, packageJsonPath] = process.argv.slice(2);
if (!pinPath || !packageJsonPath) {
    console.error("usage: check-electron-pin.mjs <electron-pin.json> <package.json>");
    process.exit(1);
}

const pin = JSON.parse(await readFile(pinPath, "utf-8"));
const pkg = JSON.parse(await readFile(packageJsonPath, "utf-8"));

const engineRange = pkg.engines?.vscode;
if (!engineRange) {
    console.error(`${packageJsonPath} has no engines.vscode field`);
    process.exit(1);
}

const match = engineRange.match(/\d+\.\d+\.\d+/);
if (!match) {
    console.error(`Could not parse a minimum version out of engines.vscode: "${engineRange}"`);
    process.exit(1);
}
const minVscodeVersion = match[0];

if (pin.vscodeVersion !== minVscodeVersion) {
    console.error(
        `electron-pin.json is out of date: pinned for VS Code ${pin.vscodeVersion}, `
            + `but ${packageJsonPath} requires ${engineRange} (minimum ${minVscodeVersion}).`,
    );
    console.error("Remediation: node ./.github/workflows/update_bazel_electron.mjs");
    process.exit(1);
}

console.log(`OK: electron-pin.json (VS Code ${pin.vscodeVersion}, Electron ${pin.electronVersion}) is up to date.`);
