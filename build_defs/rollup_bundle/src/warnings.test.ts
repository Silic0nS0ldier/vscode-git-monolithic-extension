import assert from "node:assert/strict";
import { test } from "node:test";
import { isDependencyCycle } from "./warnings.js";

test("Circular dependencies entirely within npm packages are ignored", () => {
    assert.equal(
        isDependencyCycle({
            code: "CIRCULAR_DEPENDENCY",
            message: "Circular dependency",
            ids: [
                "../../../node_modules/.aspect_rules_js/@actions+core@3.0.1/node_modules/@actions/core/lib/core.js",
                "../../../node_modules/.aspect_rules_js/@actions+core@3.0.1/node_modules/@actions/core/lib/oidc-utils.js",
            ],
        }),
        true,
    );
    assert.equal(
        isDependencyCycle({
            code: "CIRCULAR_DEPENDENCY",
            message: "Circular dependency",
            ids: ["C:\\repo\\node_modules\\semver\\classes\\range.js", "node_modules/semver/classes/comparator.js"],
        }),
        true,
    );
});

test("Cycles involving project code remain visible", () => {
    for (
        const ids of [
            ["src/main.js", "src/utils.js"],
            ["node_modules/dependency/index.js", "src/main.js"],
            ["src/my_node_modules/index.js"],
            ["src/node_modules.js"],
        ]
    ) {
        assert.equal(isDependencyCycle({ code: "CIRCULAR_DEPENDENCY", message: "Circular dependency", ids }), false);
    }
});

test("Circular dependency warnings without module IDs remain visible", () => {
    assert.equal(isDependencyCycle({ code: "CIRCULAR_DEPENDENCY", message: "Circular dependency" }), false);
    assert.equal(isDependencyCycle({ code: "CIRCULAR_DEPENDENCY", message: "Circular dependency", ids: [] }), false);
});

test("Other dependency warnings remain visible", () => {
    for (const code of ["UNRESOLVED_IMPORT", "THIS_IS_UNDEFINED", undefined]) {
        assert.equal(
            isDependencyCycle({ code, message: "Warning", ids: ["node_modules/dependency/index.js"] }),
            false,
        );
    }
});
