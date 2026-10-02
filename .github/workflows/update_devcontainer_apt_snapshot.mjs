import fs from "node:fs/promises";

// The apt snapshot must match the state `devcontainers_base_ubuntu` was built from, otherwise
// packages it already ships are overlaid with different versions. Its build time is stamped
// into the image config, so derive the snapshot from that.

const repoRoot = new URL("../../", import.meta.url);
const moduleBazelPath = new URL("MODULE.bazel", repoRoot);

let moduleBazelContent = await fs.readFile(moduleBazelPath, "utf-8");

const pullMatch = moduleBazelContent.match(
    /oci\.pull\(\s*name = "devcontainers_base_ubuntu",[\s\S]*?digest = "(?<digest>sha256:[0-9a-f]{64})"[\s\S]*?image = "mcr\.microsoft\.com\/(?<repository>[^":]+)/,
);
if (!pullMatch) {
    throw new Error("Could not find the devcontainers_base_ubuntu oci.pull in MODULE.bazel");
}
const { digest, repository } = pullMatch.groups;

const registry = `https://mcr.microsoft.com/v2/${repository}`;
const fetchJson = async (url, accept) => {
    const res = await fetch(url, { headers: { accept } });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status}`);
    }
    return res.json();
};

// Every platform is built in the same run, so any one carries the timestamp.
const index = await fetchJson(
    `${registry}/manifests/${digest}`,
    "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
);
const platformManifest = index.manifests?.find(m => m.platform?.os === "linux" && m.platform?.architecture === "amd64");
if (!platformManifest) {
    throw new Error(`${repository}@${digest} has no linux/amd64 manifest`);
}
const manifest = await fetchJson(
    `${registry}/manifests/${platformManifest.digest}`,
    "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
);
const config = await fetchJson(`${registry}/blobs/${manifest.config.digest}`, "application/json");

const label = config.config?.Labels?.["dev.containers.timestamp"];
const builtAt = new Date(label);
if (Number.isNaN(builtAt.getTime())) {
    throw new Error(`${repository}@${digest} has no usable dev.containers.timestamp label: "${label}"`);
}
// snapshot.ubuntu.com serves the newest snapshot at or before the requested instant.
const snapshot = builtAt.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

const snapshotRe = /(https:\/\/snapshot\.ubuntu\.com\/ubuntu\/)\d{8}T\d{6}Z/g;
if (!snapshotRe.test(moduleBazelContent)) {
    throw new Error("Could not find a snapshot.ubuntu.com URL in MODULE.bazel");
}
moduleBazelContent = moduleBazelContent.replace(snapshotRe, `$1${snapshot}`);
await fs.writeFile(moduleBazelPath, moduleBazelContent, "utf-8");

console.log(`Pinned apt snapshot ${snapshot} to ${repository}@${digest} (built ${label}).`);
