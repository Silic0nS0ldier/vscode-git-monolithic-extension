// @ts-check
import * as Path from "node:path";
import * as URL from "node:url";

const buildToolsPkg = Path.join(URL.fileURLToPath(import.meta.url), "../..");
export const extensionPkg = Path.resolve(buildToolsPkg, "../extension/");
export const stagingAreaPkg = Path.resolve(buildToolsPkg, "../staging-area/");
export const gitPkg = Path.resolve(buildToolsPkg, "../git/");
export const repoRoot = Path.resolve(buildToolsPkg, "../..");
