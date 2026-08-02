import { createHash } from "node:crypto";
import fs from "node:fs/promises";

const repoRoot = new URL("../../", import.meta.url);
const cargoTomlPath = new URL("Cargo.toml", repoRoot);
const lockfilePath = new URL("multitool.lock.json", repoRoot);

// multitool platform -> wasm-bindgen release target triple. musl builds are static, so they
// run regardless of the host glibc.
const TARGETS = [
    { os: "linux", cpu: "arm64", triple: "aarch64-unknown-linux-musl" },
    { os: "linux", cpu: "x86_64", triple: "x86_64-unknown-linux-musl" },
    { os: "macos", cpu: "arm64", triple: "aarch64-apple-darwin" },
    { os: "macos", cpu: "x86_64", triple: "x86_64-apple-darwin" },
];

const cargoTomlContent = await fs.readFile(cargoTomlPath, "utf-8");
const versionMatch = cargoTomlContent.match(/^\s*wasm-bindgen\s*=\s*"=?([^"]*)"/m);
if (!versionMatch) {
    throw new Error("Could not find a `wasm-bindgen` entry in Cargo.toml");
}
const version = versionMatch[1];
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    // The CLI has to match the crate exactly, so a range cannot be resolved to one release.
    throw new Error(`Cargo.toml must pin an exact wasm-bindgen version, got "${version}"`);
}

const binaries = [];
for (const { os, cpu, triple } of TARGETS) {
    const name = `wasm-bindgen-${version}-${triple}`;
    const url = `https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${version}/${name}.tar.gz`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
    }
    binaries.push({
        kind: "archive",
        url,
        file: `${name}/wasm-bindgen`,
        sha256: createHash("sha256").update(new Uint8Array(await res.arrayBuffer())).digest("hex"),
        os,
        cpu,
    });
}

const lockfile = JSON.parse(await fs.readFile(lockfilePath, "utf-8"));
if (!lockfile["wasm-bindgen"]) {
    throw new Error("multitool.lock.json has no `wasm-bindgen` tool");
}
lockfile["wasm-bindgen"].binaries = binaries;
await fs.writeFile(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`, "utf-8");

console.log(`Pinned wasm-bindgen ${version} in multitool.lock.json.`);
