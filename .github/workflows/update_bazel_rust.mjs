import fs from "node:fs/promises";

const repoRoot = new URL("../../", import.meta.url);
const rustToolchainPath = new URL("rust-toolchain.toml", repoRoot);
const moduleBazelPath = new URL("MODULE.bazel", repoRoot);

const rustToolchainContent = await fs.readFile(rustToolchainPath, "utf-8");
const channelMatch = rustToolchainContent.match(/^\s*channel\s*=\s*"([^"]*)"/m);
if (!channelMatch) {
    throw new Error("Could not find a `channel` entry in rust-toolchain.toml");
}
const rustVersion = channelMatch[1];
if (!/^\d+\.\d+\.\d+$/.test(rustVersion)) {
    // rules_rust needs an exact version; named channels like "stable" cannot be mirrored.
    throw new Error(`rust-toolchain.toml channel must be an exact version, got "${rustVersion}"`);
}

const moduleBazelContent = await fs.readFile(moduleBazelPath, "utf-8");
const blockRe = /rust\.toolchain\(\n[\s\S]*?\n\)/;
const blockMatch = moduleBazelContent.match(blockRe);
if (!blockMatch) {
    throw new Error("Could not find the `rust.toolchain(...)` block in MODULE.bazel");
}
const versionsRe = /versions\s*=\s*\[[^\]]*\]/;
if (!versionsRe.test(blockMatch[0])) {
    throw new Error("`rust.toolchain(...)` in MODULE.bazel has no `versions` attribute");
}
const updatedBlock = blockMatch[0].replace(versionsRe, `versions = ["${rustVersion}"]`);
if (updatedBlock === blockMatch[0]) {
    console.log(`MODULE.bazel already pins Rust ${rustVersion}; nothing to do.`);
    process.exit(0);
}

await fs.writeFile(
    moduleBazelPath,
    moduleBazelContent.slice(0, blockMatch.index)
        + updatedBlock
        + moduleBazelContent.slice(blockMatch.index + blockMatch[0].length),
    "utf-8",
);

console.log(`Pinned Rust ${rustVersion} in MODULE.bazel.`);
