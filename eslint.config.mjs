// @ts-check

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// TODO: Adopt type-aware linting (`tseslint.configs.recommendedTypeChecked`), which needs each lint action to see its
// tsconfig and type dependencies.
export default defineConfig(
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
);
