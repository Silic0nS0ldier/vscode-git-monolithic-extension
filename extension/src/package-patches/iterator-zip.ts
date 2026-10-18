// `core-js-pure/es/iterator/zip.js` also pulls in every `Iterator.prototype` helper polyfill, which the bundler
// cannot drop (CJS side-effects). Load only the `Iterator.zip` module and read it from core-js's export namespace.
// TODO(Silic0nS0ldier): Switch to native `Iterator.zip` once the extension host is on Electron >=45
// (V8 >=15.3); it is behind `--js-joint-iteration` in Electron 43/44.
// No upstream issue tracks Electron 45 yet; closest is https://github.com/microsoft/vscode/issues/338363 (Electron 44).
import "core-js-pure/modules/es.iterator.zip.js";
import corePath from "core-js-pure/internals/path.js";

export const zip = corePath.Iterator.zip;
