/// <reference lib="esnext.modulesource" />
// Compiles the sidecar `.wasm` file at module load and initialises the wasm-bindgen glue synchronously, so consumers
// can use the exports without an explicit init step. The Rollup `wasm-source-phase` plugin copies the `.wasm` file
// next to the bundled chunks.
import { initSync } from "./wasm/wasm.js";
import source wasm from "./wasm/wasm_bg.wasm";

export * from "./wasm/wasm.js";

initSync({ module: wasm });
