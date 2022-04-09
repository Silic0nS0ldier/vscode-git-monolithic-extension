#!/usr/bin/env node

import path from "node:path";

async function main() {
    const avaDir = path.join(await import.meta.resolve("real-ava"), "..");
    const avaCli = await import.meta.resolve("./lib/cli.js", avaDir);
    const { default: run } = await import(avaCli);
    run();
}

main();
