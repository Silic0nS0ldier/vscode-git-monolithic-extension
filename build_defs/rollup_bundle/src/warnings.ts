import type { RollupLog } from "rollup";

export function isDependencyCycle(warning: RollupLog): boolean {
    return warning.code === "CIRCULAR_DEPENDENCY"
        && warning.ids !== undefined
        && warning.ids.length > 0
        && warning.ids.every(id => /(?:^|[/\\])node_modules[/\\]/.test(id));
}
