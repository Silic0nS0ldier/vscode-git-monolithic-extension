// @ts-check

import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import logging from "./build_defs/lint/eslint-plugin-logging.mjs";

// TODO: Adopt type-aware linting (`tseslint.configs.recommendedTypeChecked`), which needs each lint action to see its
// tsconfig and type dependencies.
export default defineConfig(
    // TODO: Lint again once typescript-eslint can parse source phase imports (`import source`).
    globalIgnores(["packages/wasm/src/mod.ts"]),
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        linterOptions: {
            reportUnusedDisableDirectives: "error",
        },
        rules: {
            // Mirror the exemptions of TypeScript's `noUnusedLocals`/`noUnusedParameters`.
            "@typescript-eslint/no-unused-vars": ["error", {
                argsIgnorePattern: "^_",
                destructuredArrayIgnorePattern: "^_",
                ignoreUsingDeclarations: true,
            }],
        },
    },
    {
        files: ["extension/src/**"],
        plugins: { logging },
        rules: {
            "logging/message-content": "error",
            "logging/no-output-channel-append": "error",
        },
    },
);
