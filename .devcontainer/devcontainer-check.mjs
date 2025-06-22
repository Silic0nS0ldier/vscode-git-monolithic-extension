import * as fs from "node:fs/promises";

let str = await fs.readFile("./devcontainer.json", "utf-8");
const devcontainerJson = JSON.parse(str);
const actual = devcontainerJson.image;

str = await fs.readFile("./multi_platform.json.sha256", "utf-8");
const expectedImage = "ghcr.io/silic0ns0ldier/vscode-git-monolithic-extension/devcontainer";
const expectedSha256 = str.split(":")[1].trim();
const expected = `${expectedImage}:${expectedSha256}`;

if (actual !== expected) {
    console.error(`Actual  : ${actual}`);
    console.error(`Expected: ${expected}`);
    console.error("Please update image in devcontainer.json");
    process.exit(1);
}
