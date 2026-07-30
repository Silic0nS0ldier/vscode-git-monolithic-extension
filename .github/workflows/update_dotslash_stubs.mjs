import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { tools } from "../../.devcontainer/dotslash-tools.mjs";

const outDir = path.join(import.meta.dirname, "../../.devcontainer/dotslash");

/** @param {string} template @param {string} version */
function expand(template, version) {
    return template
        .replaceAll("{versionNoV}", version.replace(/^v/, ""))
        .replaceAll("{version}", version);
}

for (const [name, tool] of Object.entries(tools)) {
    /** @type {Record<string, unknown>} */
    const platforms = {};
    for (const [platform, artifact] of Object.entries(tool.platforms)) {
        const url = expand(artifact.url, tool.version);
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
        }
        const body = new Uint8Array(await res.arrayBuffer());
        platforms[platform] = {
            size: body.byteLength,
            hash: "sha256",
            digest: createHash("sha256").update(body).digest("hex"),
            ...(artifact.format ? { format: artifact.format } : {}),
            path: expand(artifact.path, tool.version),
            providers: [{ url }],
        };
    }

    const stub = `#!/usr/bin/env dotslash\n${JSON.stringify({ name, platforms }, null, 2)}\n`;
    const file = path.join(outDir, name);
    await fs.writeFile(file, stub, "utf-8");
    await fs.chmod(file, 0o755);
}
