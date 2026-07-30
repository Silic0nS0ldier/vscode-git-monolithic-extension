import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Plugin } from "rollup";

/**
 * Matches a static source-phase import of a `.wasm` file, e.g.
 * `import source W from "./foo.wasm";`. Only the static declaration form is
 * matched — `import.source(...)` is left alone because `import` is followed by
 * `.` rather than whitespace.
 */
const SOURCE_PHASE_IMPORT_RE = /\bimport\s+source\s+([A-Za-z_$][\w$]*)\s+from\s*("[^"]+\.wasm"|'[^']+\.wasm')/g;

/**
 * Rollup plugin that keeps `.wasm` files out of the bundle and copies them to
 * the output directory alongside the JS chunks, as sidecar assets.
 *
 * Source is authored with source-phase imports
 * (`import source W from "./foo.wasm"`), which as of Rollup 4.60 are only
 * supported for external modules (see rollup/rollup#6279). That syntax must
 * also never reach the entry chunk: a host that can't parse it fails while
 * *parsing*, which no `try`/`catch` can intercept. So each `.wasm` import is
 * rewritten to resolve its `WebAssembly.Module` at runtime:
 *   1. `transform` strips the `source` keyword so nothing downstream has to
 *      understand the syntax while building the graph.
 *   2. `resolveId`/`load` replace the `.wasm` module with a loader module that
 *      dynamically imports a separate helper chunk holding the `import source`,
 *      falling back to reading and compiling the sidecar if that import throws
 *      (e.g. a `SyntaxError` on a host without source-phase support). Keeping
 *      the syntax behind a dynamic import is what makes it fault tolerant.
 *
 * The specifier rewrite happens in two steps because Rollup's `resolveId` hook
 * doesn't know the final asset filename yet:
 *   1. the helper module imports a placeholder id marked external, which Rollup
 *      preserves verbatim in the generated `import source` statement;
 *   2. `renderChunk` swaps each placeholder for the final asset path relative
 *      to the chunk that references it.
 *
 * The placeholder uses `<<<` / `>>>` delimiters, which cannot appear in a
 * Rollup file-reference id (URL-safe base64 with `-` replaced by `$`).
 */
export function wasmSourcePhasePlugin(): Plugin {
    const refIdByHelperId = new Map<string, string>();
    // Prefixed with `virtual:` rather than Rollup's conventional `\0` because
    // the loader id is emitted into an `import()` specifier, and a null byte in
    // a path throws in `node:fs`. Ids may still arrive `\0`-prefixed from other
    // plugins, so normalise before comparing.
    const normalizeVirtualId = (id: string) => (id.startsWith("\0") ? id.slice(1) : id);
    const LOADER_PREFIX = "virtual:wasm-loader:";
    const SOURCE_HELPER_PREFIX = "virtual:wasm-source-helper:";
    const PLACEHOLDER_RE = /<<<WASM_ASSET_REFID_([A-Za-z0-9_$]+)_ENDASSET>>>/g;
    const buildPlaceholder = (refId: string) => `<<<WASM_ASSET_REFID_${refId}_ENDASSET>>>`;
    return {
        name: "wasm-source-phase",
        transform: {
            // Must run before anything parses the module, since source-phase
            // syntax isn't universally understood.
            order: "pre",
            handler(code) {
                const out = code.replace(
                    SOURCE_PHASE_IMPORT_RE,
                    (_full, binding: string, specifier: string) => `import ${binding} from ${specifier}`,
                );
                return out === code ? null : { code: out, map: null };
            },
        },
        async resolveId(source, importer, opts) {
            const normalizedSource = normalizeVirtualId(source);
            if (normalizedSource.startsWith(LOADER_PREFIX) || normalizedSource.startsWith(SOURCE_HELPER_PREFIX)) {
                return source;
            }
            // The helper's source-phase import targets the placeholder directly;
            // keep it external so Rollup preserves it for `renderChunk` to rewrite.
            if (normalizedSource.startsWith("<<<WASM_ASSET_REFID_")) {
                return { id: normalizedSource, external: true };
            }
            if (!normalizedSource.endsWith(".wasm")) return null;

            const resolved = await this.resolve(source, importer, { ...opts, skipSelf: true });
            if (!resolved || resolved.external) return resolved;
            const normalizedResolvedId = normalizeVirtualId(resolved.id);
            if (
                normalizedResolvedId.startsWith(LOADER_PREFIX) || normalizedResolvedId.startsWith(SOURCE_HELPER_PREFIX)
            ) {
                return resolved;
            }

            return `${LOADER_PREFIX}${resolved.id}`;
        },
        async load(id) {
            const normalizedId = normalizeVirtualId(id);

            if (normalizedId.startsWith(LOADER_PREFIX)) {
                const wasmPath = normalizedId.slice(LOADER_PREFIX.length);
                const buf = await fs.readFile(wasmPath);
                const refId = this.emitFile({
                    type: "asset",
                    name: path.basename(wasmPath),
                    source: buf,
                });
                const helperId = `${SOURCE_HELPER_PREFIX}${refId}`;
                refIdByHelperId.set(helperId, refId);

                return [
                    `let _wasmModule;`,
                    `try {`,
                    `    ({ default: _wasmModule } = await import(${JSON.stringify(helperId)}));`,
                    `} catch {`,
                    `    const { readFile } = await import("node:fs/promises");`,
                    // `ROLLUP_FILE_URL_*` expands to a URL *string*, and `readFile` treats a
                    // string as a filesystem path, so it must be wrapped back into a `URL`.
                    `    const _bytes = await readFile(new URL(import.meta.ROLLUP_FILE_URL_${refId}));`,
                    `    _wasmModule = await WebAssembly.compile(_bytes);`,
                    `}`,
                    `export default _wasmModule;`,
                    ``,
                ].join("\n");
            }

            if (normalizedId.startsWith(SOURCE_HELPER_PREFIX)) {
                const refId = refIdByHelperId.get(normalizedId);
                if (!refId) return null;
                return [
                    `import source W from ${JSON.stringify(buildPlaceholder(refId))};`,
                    // Assigning first is required: re-exporting the binding directly lets
                    // Rollup collapse it to `export { "*source" as default } from ...`,
                    // which drops the source phase.
                    `const _wasmModule = W;`,
                    `export { _wasmModule as default };`,
                    ``,
                ].join("\n");
            }

            return null;
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
