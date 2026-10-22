// @ts-check

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// TODO: Adopt type-aware linting (`tseslint.configs.recommendedTypeChecked`), which needs each lint action to see its
// tsconfig and type dependencies.
export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.recommended,
);
