import type { Plugin } from "rollup";

/**
 * TypeScript emits `(this && this.__helper) || function ...` even in ESM.
 * Rollup correctly rewrites these guards to undefined; only their diagnostics
 * are noise. Keep warnings for every other use of top-level `this`.
 */
export function typescriptHelperWarningsPlugin(): Plugin {
    const helperPositions = new Map<string, Set<number>>();

    return {
        name: "typescript-helper-warnings",
        transform(code, id) {
            const positions = new Set<number>();
            helperPositions.set(id, positions);
            if (!code.includes("this")) return null;

            for (const statement of this.parse(code).body) {
                if (statement.type !== "VariableDeclaration") continue;
                for (const { id: binding, init } of statement.declarations) {
                    if (
                        binding.type !== "Identifier" || !binding.name.startsWith("__")
                        || init?.type !== "LogicalExpression" || init.operator !== "||"
                        || init.right.type !== "FunctionExpression"
                    ) continue;

                    const guard = init.left;
                    if (
                        guard.type !== "LogicalExpression" || guard.operator !== "&&"
                        || guard.left.type !== "ThisExpression"
                        || guard.right.type !== "MemberExpression" || guard.right.computed
                        || guard.right.object.type !== "ThisExpression"
                        || guard.right.property.type !== "Identifier"
                        || guard.right.property.name !== binding.name
                    ) continue;

                    if ("start" in guard.left && typeof guard.left.start === "number") {
                        positions.add(guard.left.start);
                    }
                    if ("start" in guard.right.object && typeof guard.right.object.start === "number") {
                        positions.add(guard.right.object.start);
                    }
                }
            }
            return null;
        },
        onLog(level, log) {
            if (
                level === "warn" && log.code === "THIS_IS_UNDEFINED"
                && log.id !== undefined && log.pos !== undefined
                && helperPositions.get(log.id)?.has(log.pos)
            ) return false;
            return null;
        },
    };
}
