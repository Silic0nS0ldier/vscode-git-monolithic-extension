// @ts-check
import { builtinModules, createRequire } from "node:module";

/**
 * @typedef {{
 *     moduleDirectory: string,
 * }} Options
 * @param {Options} options
 * @returns {import("rollup").Plugin}
 */
export function nodeResolve(options) {
    return {
        name: "node-resolve",
        // TODO Mark how module was resolved. Once resolved via require, only require can be used
        // Ideally we'd follow the scope of the importer
        async resolveId(source, importer) {
            if (!importer) {
                return source;
            }
            if (/^node:/.test(source) || builtinModules.includes(source)) {
                return false;
            }
            try {
                // As ESM?
                let result = await import.meta.resolve(source, "file://" + importer);
                result = result.replace(/file:\/\//, "");
                return result;
            } catch (esmErr) {
                // Maybe CJS?
                try {
                    const r = createRequire(importer);
                    return r.resolve(source);
                } catch (cjsErr) {
                    throw new Error(`Failed to resolve module ${source} from ${importer}`, { cause: [esmErr, cjsErr] });
                }
            }
        },
    };
}
