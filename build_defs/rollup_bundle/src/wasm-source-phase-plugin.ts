import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Plugin } from "rollup";

/**
 * Rollup plugin that keeps `.wasm` files out of the bundle and copies them to
 * the output directory alongside the JS chunks. Import specifiers of `.wasm`
 * files are rewritten to a relative path pointing at the copied file.
 *
 * This is designed to be used together with source-phase imports
 * (`import source W from "./foo.wasm"`), which as of Rollup 4.60 are only
 * supported for external modules. See rollup/rollup#6279.
 *
 * The specifier rewrite happens in two steps because Rollup's `resolveId` hook
 * doesn't know the final asset filename yet:
 *   1. `resolveId` emits the WASM as an asset and returns a placeholder id
 *      marked as external. Rollup preserves the placeholder verbatim in the
 *      generated `import` statement.
 *   2. `renderChunk` swaps each placeholder for the final asset path relative
 *      to the chunk that references it.
 *
 * The placeholder uses `<<<` / `>>>` delimiters, which cannot appear in a
 * Rollup file-reference id (URL-safe base64 with `-` replaced by `$`).
 *
 * `resolveId` is invoked more than once for the same file — e.g., once with
 * the relative specifier from the importing module and once with the resolved
 * absolute path (via @rollup/plugin-commonjs's internal `commonjs--resolver`).
 * The refId cache is keyed by the resolved on-disk path so all invocations
 * for the same file return the same placeholder.
 */
export function wasmSourcePhasePlugin(): Plugin {
    const refIdByResolved = new Map<string, string>();
    const PLACEHOLDER_RE = /<<<WASM_ASSET_REFID_([A-Za-z0-9_$]+)_ENDASSET>>>/g;
    const buildPlaceholder = (refId: string) => `<<<WASM_ASSET_REFID_${refId}_ENDASSET>>>`;
    return {
        name: "wasm-source-phase",
        async resolveId(source, importer, opts) {
            if (!source.endsWith(".wasm")) return null;
            const resolved = await this.resolve(source, importer, { ...opts, skipSelf: true });
            if (!resolved) return null;
            // If the file has already been emitted as an asset, always return
            // the same placeholder so every import site points at the sidecar
            // (regardless of whether Rollup considers this resolution external).
            let refId = refIdByResolved.get(resolved.id);
            if (refId === undefined) {
                if (resolved.external) return resolved;
                const buf = await fs.readFile(resolved.id);
                refId = this.emitFile({
                    type: "asset",
                    name: path.basename(resolved.id),
                    source: buf,
                });
                refIdByResolved.set(resolved.id, refId);
            }
            return {
                id: buildPlaceholder(refId),
                external: true,
            };
        },
        renderChunk(code, chunk) {
            let matched = false;
            const out = code.replace(PLACEHOLDER_RE, (_full, refId: string) => {
                matched = true;
                const assetFileName = this.getFileName(refId);
                let rel = path.relative(path.dirname(chunk.fileName), assetFileName);
                if (!rel.startsWith(".")) rel = "./" + rel;
                return rel;
            });
            return matched ? { code: out, map: null } : null;
        },
    };
}
