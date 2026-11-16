# Rollup External Dynamic Import Folding

This directory holds the canonical source patch (`fold-external-dynamic-imports.patch`) against
upstream [`rollup/rollup`](https://github.com/rollup/rollup) that adds **external dynamic import
folding** to Rollup, along with documentation on its design, configuration, output transformations,
and patch regeneration workflow.

---

## Background & Motivation

Rollup (`rollup/rollup#4952`) already inspects `const { ... } = await import(...)` patterns to tree-shake
unused exports from dynamically imported internal modules. However, when a module in a chunk uses a
destructured dynamic import of an **external** module — for example, a lazy fallback path like:

```js
try {
    ({ default: _wasmModule } = await import("./chunks/virtual_wasm-source-helper.js"));
} catch {
    const { readFile } = await import("node:fs/promises");
    const _bytes = await readFile(new URL("assets/wasm_bg.wasm", import.meta.url));
    _wasmModule = await WebAssembly.compile(_bytes);
}
```

and the same output chunk _already_ contains a top-level static `import` from that external module
(e.g., `import * as fsp from "node:fs/promises"` or `import { stat } from "node:fs/promises"`),
emitting a separate `await import("node:fs/promises")` inside the chunk is redundant: the external
module is already loaded synchronously when the chunk initializes.

Folding destructured `await import("<external>")` bindings into the chunk's existing static
`import` declaration:

1. Eliminates the runtime `await import(...)` call and `VariableDeclaration` when all destructured
   bindings can be satisfied by the static import.
2. Rewrites references to the destructured local bindings directly to the top-level imported
   `ExternalVariable` bindings, respecting Rollup's scope-level identifier deconfliction.
3. Removes the external module from the chunk's `dynamicImports` metadata when no dynamic imports
   to that module remain.

---

## Configuration (`foldExternalDynamicImports`)

The feature is controlled by the `foldExternalDynamicImports` output option on `OutputOptions` /
`NormalizedOutputOptions`:

```ts
interface OutputOptions {
    foldExternalDynamicImports?: boolean | "all" | undefined;
}
```

| Value              | Behavior                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `true` _(default)_ | Folds destructured properties from `await import("<external>")` **only** when the chunk already statically imports `<external>` **and** that specific exported binding is already imported in the chunk.     |
| `"all"`            | Folds **all** eligible destructured properties from `await import("<external>")` whenever the chunk already has _any_ static import from `<external>`, adding missing named specifiers to the static import. |
| `false`            | Disables external dynamic import folding completely; `await import("<external>")` declarations are left untouched.                                                                                           |

In [`build_defs/rollup_bundle/src/main.ts`](../../build_defs/rollup_bundle/src/main.ts),
`foldExternalDynamicImports: "all"` is enabled so that any external module already statically
imported by a chunk (even via namespace `import * as fsp from "node:fs/promises"` or with a
different set of named imports) absorbs destructured `await import(...)` bindings for that module.

---

## How Configurations Change Outputs

Suppose a chunk bundles two modules that both reference `"node:fs/promises"` (marked `external`):

```js
// main.js
import { readFile } from "node:fs/promises";
import { loadBoth, loadText } from "./dep.js";

export async function run(path) {
    return [await readFile(path, "utf8"), await loadText(path), await loadBoth(path)];
}

// dep.js
export async function loadText(path) {
    const { readFile } = await import("node:fs/promises");
    return readFile(path, "utf8");
}

export async function loadBoth(path) {
    const { readFile: rf, writeFile } = await import("node:fs/promises");
    await writeFile(path, "data");
    return rf(path, "utf8");
}
```

### 1. Default (`foldExternalDynamicImports: true`)

Only `readFile` is already a named static import in the chunk; `writeFile` is not.

- In `loadText`, `const { readFile } = await import("node:fs/promises")` has all of its properties
  folded, so the entire declaration is elided.
- In `loadBoth`, `readFile: rf` is folded into the top-level `readFile` import, while `writeFile`
  remains on `await import("node:fs/promises")`:

```js
import { readFile } from "node:fs/promises";

async function loadText(path) {
    return readFile(path, "utf8");
}

async function loadBoth(path) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, "data");
    return readFile(path, "utf8");
}

async function run(path) {
    return [await readFile(path, "utf8"), await loadText(path), await loadBoth(path)];
}

export { run };
```

### 2. `"all"` (`foldExternalDynamicImports: "all"`)

Because the chunk already statically imports `'node:fs/promises'`, both `readFile` and `writeFile`
are folded into the top-level static `import` declaration, and both `await import(...)`
declarations are completely elided:

```js
import { readFile, writeFile } from "node:fs/promises";

async function loadText(path) {
    return readFile(path, "utf8");
}

async function loadBoth(path) {
    await writeFile(path, "data");
    return readFile(path, "utf8");
}

async function run(path) {
    return [await readFile(path, "utf8"), await loadText(path), await loadBoth(path)];
}

export { run };
```

### 3. `false` (`foldExternalDynamicImports: false`)

No folding takes place:

```js
import { readFile } from "node:fs/promises";

async function loadText(path) {
    const { readFile } = await import("node:fs/promises");
    return readFile(path, "utf8");
}

async function loadBoth(path) {
    const { readFile: rf, writeFile } = await import("node:fs/promises");
    await writeFile(path, "data");
    return rf(path, "utf8");
}

async function run(path) {
    return [await readFile(path, "utf8"), await loadText(path), await loadBoth(path)];
}

export { run };
```

---

## Design Considerations

1. **Chunk-Scoped Static Import Requirement**:
   Folding only triggers when `this.imports` on the `Chunk` already contains at least one
   `ExternalVariable` from the target `ExternalModule`. If an external module is _only_ ever
   imported dynamically in a chunk, Rollup will not hoist it to a top-level static `import`,
   preserving lazy loading semantics for optional/conditional external dependencies.

2. **Placement in the Chunk Linking Pipeline**:
   `Chunk.foldExternalDynamicImports()` runs in `Bundle.generate()` after `chunk.generateExports()`
   and `chunk.inlineTransitiveImports()`, and after `chunk.generateFacades()`. Running at this point
   ensures:
   - `this.facadeChunkByModule` is already populated before `this.getIncludedDynamicImports()`
     caches `this.includedDynamicImports`.
   - Any transitive static imports hoisted into the chunk by `inlineTransitiveImports()` are visible
     in `this.imports`.

3. **Safety Guards on AST Patterns & Bindings**:
   A dynamic import is eligible for folding only when:
   - Its `resolution` is an `ExternalModule` with no import `phase` (`source`/`defer`) and matching
     import attributes (`!doAttributesDiffer(...)`).
   - Its AST parent chain is `ImportExpression` -> `AwaitExpression` -> `VariableDeclarator.init`
     inside a non-`using`/`await using` `VariableDeclaration`, with `declarator.id` being an
     `ObjectPattern`.
   - Each folded property in the `ObjectPattern` is a non-computed `Property` whose value is a plain
     `Identifier` (no nested patterns, default values, or `RestElement`s).
   - The bound `LocalVariable` has a single declaration, is never reassigned
     (`!localVariable.isReassigned && !localVariable.isTargetOfAssignment`), and is not exported
     from the chunk.

4. **Variable Aliasing & Scope Deconfliction**:
   - Folded `LocalVariable`s delegate their rendered name to the chunk's `ExternalVariable` via
     `localVariable.renderLikeHoisted(targetExternalVariable)`.
   - `Variable.getNamingVariable()` delegates to `this.renderedLikeHoisted` when
     `this.renderedLikeHoisted.module?.info.isExternal` is true, so non-ESM formats (such as CJS
     where `renderBaseName` is set on the external namespace) also resolve property accesses
     properly.
   - `ChildScope.deconflict()` and `deconflictTopLevelVariables()` skip allocating a redundant safe
     name for a `LocalVariable` that has `getHoistedVariable()` set, preventing the folded local
     variable from claiming the base identifier name and forcing the top-level `ExternalVariable` to
     be renamed to `foo$1`.
   - Every `ChildScope` strictly inside `ModuleScope` from the destructured binding and its
     references up to `ModuleScope` records `targetExternalVariable` in `accessedOutsideVariables`,
     so inner-scope bindings with conflicting names (e.g., `const readFile$1 = ...` or shadowing
     declarations) are deconflicted against the hoisted static import.

5. **Multi-Output Render Idempotency**:
   Because a single Rollup build can call `bundle.generate()` / `bundle.write()` multiple times with
   different output options or formats, AST node flags (`isFoldedDynamicImportProperty`,
   `isFoldedDynamicImportDeclarator`), `renderLikeHoisted` links, and `accessedOutsideVariables`
   entries are applied at the start of `Chunk.renderModules()` via `foldedDynamicImportSetup` and
   restored before `renderModules()` returns via `foldedDynamicImportCleanups`.

---

## Regenerating the Patch When Rollup Updates

Rollup publishes pre-bundled CJS (`dist/shared/rollup.js`) and ESM (`dist/es/shared/node-entry.js`)
files to npm. Because upstream changes shift line numbers and chunk ordering in `dist/`,
[`/.github/workflows/update_rollup_patch.mjs`](../../.github/workflows/update_rollup_patch.mjs)
automates rebuilding `patches/rollup@<version>.patch` from
[`fold-external-dynamic-imports.patch`](./fold-external-dynamic-imports.patch).

### Automatic Regeneration (CI / Local)

When `rollup` is bumped in [`build_defs/rollup_bundle/package.json`](../../build_defs/rollup_bundle/package.json),
run:

```sh
node .github/workflows/update_rollup_patch.mjs
```

In CI, the `renovate_tasks` job in [`/.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
runs this script automatically on Renovate PRs. When the version in
`build_defs/rollup_bundle/package.json` matches the `rollup@<version>` entry in
[`pnpm-workspace.yaml`](../../pnpm-workspace.yaml), the script exits immediately as a no-op (pass
`--force` to rebuild anyway).

### Handling Merge Conflicts

If an upstream Rollup release modifies lines adjacent to our hunks and `git apply --3way` cannot
auto-merge cleanly:

1. `update_rollup_patch.mjs` stops, preserves the cloned Rollup worktree (default
   `/tmp/rollup-patch-build`), and prints the conflicted file paths.
2. Resolve the conflict markers in `/tmp/rollup-patch-build/src/...` and mark them resolved
   (`git -C /tmp/rollup-patch-build add <file>`).
3. Resume the script with `--continue`:
   ```sh
   node .github/workflows/update_rollup_patch.mjs --continue
   ```
   This refreshes [`fold-external-dynamic-imports.patch`](./fold-external-dynamic-imports.patch)
   from the resolved worktree, builds Rollup's `dist/` bundles with the upstream release's
   `SOURCE_DATE_EPOCH`, and commits the new `patches/rollup@<version>.patch` via `pnpm patch-commit`.
