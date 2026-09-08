import fs from "node:fs/promises";

const repoRoot = new URL("../../", import.meta.url);
const rustToolchainPath = new URL("rust-toolchain.toml", repoRoot);
const moduleBazelPath = new URL("MODULE.bazel", repoRoot);

// `@rules_rust` ships a hardcoded table of artifact hashes (`rust/private/known_shas.bzl`) that
// only covers the versions current at its own release. When the pinned version is missing from it
// the toolchain repositories are fetched without a hash, which makes them unreproducible and locks
// them out of the repository cache — a cold download on every CI run. Supplying `sha256s` restores
// both, and regenerating it here keeps it correct across Renovate-driven version bumps.

const EXEC_TRIPLES = [
    "aarch64-apple-darwin",
    "aarch64-unknown-linux-gnu",
    "x86_64-apple-darwin",
    "x86_64-unknown-linux-gnu",
];

const TARGET_TRIPLES = ["wasm32-unknown-unknown"];

const EXEC_TOOLS = ["cargo", "clippy", "llvm-tools", "rust-std", "rustc"];

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

const manifestUrl = `https://static.rust-lang.org/dist/channel-rust-${rustVersion}.toml`;
const manifestRes = await fetch(manifestUrl);
if (!manifestRes.ok) {
    throw new Error(`Failed to fetch ${manifestUrl}: ${manifestRes.status}`);
}
const manifest = await manifestRes.text();

// A hand-rolled scan avoids a TOML parser dependency: every artifact in the release manifest is
// described by an `xz_url` line immediately followed by its `xz_hash`.
const artifactShas = new Map();
let pendingArtifact = null;
for (const line of manifest.split("\n")) {
    const urlMatch = line.match(/^xz_url\s*=\s*"[^"]*\/([^/"]+)"\s*\r?$/);
    if (urlMatch) {
        pendingArtifact = urlMatch[1];
        continue;
    }
    const hashMatch = line.match(/^xz_hash\s*=\s*"([0-9a-f]{64})"\s*\r?$/);
    if (hashMatch && pendingArtifact) {
        artifactShas.set(pendingArtifact, hashMatch[1]);
    }
    pendingArtifact = null;
}

const wantedArtifacts = new Set();
for (const execTriple of EXEC_TRIPLES) {
    for (const tool of EXEC_TOOLS) {
        wantedArtifacts.add(`${tool}-${rustVersion}-${execTriple}.tar.xz`);
    }
}
for (const targetTriple of TARGET_TRIPLES) {
    wantedArtifacts.add(`rust-std-${rustVersion}-${targetTriple}.tar.xz`);
}

const sha256sEntries = [];
for (const artifact of Array.from(wantedArtifacts).sort()) {
    const sha256 = artifactShas.get(artifact);
    if (!sha256) {
        throw new Error(`${manifestUrl} has no xz artifact named ${artifact}`);
    }
    sha256sEntries.push(`        "${artifact}": "${sha256}",`);
}
const sha256sAttr = `sha256s = {\n${sha256sEntries.join("\n")}\n    }`;

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

let updatedBlock = blockMatch[0].replace(versionsRe, `versions = ["${rustVersion}"]`);
const existingSha256sRe = /sha256s\s*=\s*\{[^}]*\}/;
updatedBlock = existingSha256sRe.test(updatedBlock)
    ? updatedBlock.replace(existingSha256sRe, sha256sAttr)
    // buildifier alphabetises attributes, so insert ahead of `versions`.
    : updatedBlock.replace(versionsRe, match => `${sha256sAttr},\n    ${match}`);

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
