import fs from "node:fs/promises";

const mapping = {
    "darwin_arm64": "darwin-arm64.tar.xz",
    "darwin_amd64": "darwin-x64.tar.xz",
    "linux_arm64": "linux-arm64.tar.xz",
    "linux_ppc64le": "linux-ppc64le.tar.xz",
    "linux_s390x": "linux-s390x.tar.xz",
    "linux_amd64": "linux-x64.tar.xz",
    "windows_amd64": "win-x64.zip",
};

const devcontainerPathArg = process.argv[2];
const moduleBazelArg = process.argv[3];
const devcontainerJson = JSON.parse(
    await fs.readFile(`${devcontainerPathArg}`, "utf-8")
);
const nodejsVersion = devcontainerJson.features["ghcr.io/devcontainers/features/node:1"].version;

const res = await fetch(`https://nodejs.org/dist/v${nodejsVersion}/SHASUMS256.txt`);
const text = await res.text();
const lines = text.split("\n").filter(Boolean);
const artifacts = new Map(
    lines.map(line => {
        const [sha, filename] = line.split(/\s+/);
        return [filename, sha];
    })
);

const processed = new Map();
for (const k in mapping) {
    const v = mapping[k];
    const key = `${nodejsVersion}-${k}`;
    const artifactName = `node-v${nodejsVersion}-${v}`;
    const artifactDir = artifactName.replace(/\.tar\.xz$/, "").replace(/\.zip$/, "");
    const artifactSha = artifacts.get(artifactName);
    processed.set(key, [artifactName, artifactDir, artifactSha]);
}

const moduleBazelContent = await fs.readFile(moduleBazelArg, "utf-8");
const updatedModuleBazelContent = moduleBazelContent.replace(/node\.toolchain\(.*},\n\)/s, `\
node.toolchain(
    node_repositories = {
        ${Array.from(processed.entries())
            .map(([key, [artifactName, artifactDir, artifactSha]]) => `"${key}": ("${artifactName}", "${artifactDir}", "${artifactSha}"),`)
            .join("\n        ")}
    },
    node_version = "${nodejsVersion}",
)`);
await fs.writeFile(moduleBazelArg, updatedModuleBazelContent, "utf-8");
