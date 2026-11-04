// @ts-check

import { RuleTester } from "eslint";
import { describe, it } from "node:test";
import plugin from "./eslint-plugin-logging.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester();

const tracingImport = `import { trace, debug, info, warn, error } from "../tracing.js";\n`;

ruleTester.run("no-output-channel-append", plugin.rules["no-output-channel-append"], {
    valid: [
        `outputChannel.info("Repository opened");`,
        `params.append("key", "value");`,
        `formData.append("file", blob);`,
    ],
    invalid: [
        {
            code: `outputChannel.appendLine("Repository opened");`,
            errors: [{ messageId: "noAppend", data: { method: "appendLine" } }],
        },
        {
            code: `class A { #outputChannel; f() { this.#outputChannel.appendLine("x"); } }`,
            errors: [{ messageId: "noAppend" }],
        },
        {
            code: `options.outputChannel.append("partial");`,
            errors: [{ messageId: "noAppend", data: { method: "append" } }],
        },
        {
            code: `const services = createServices(msg => channel.appendLine(msg));`,
            errors: [{ messageId: "noAppend" }],
        },
    ],
});

ruleTester.run("message-content", plugin.rules["message-content"], {
    valid: [
        tracingImport + `info("Monolithic Git for VSCode is starting...");`,
        tracingImport + `warn("Git Monolithic is inactive because \`git.enabled\` is true.");`,
        tracingImport + `error(\`Failed to process config change: \${inspect(err)}\`);`,
        tracingImport + `warn(i18n.Translations.notSupported());`,
        tracingImport + `info("an error occurred while tracing");`,
        tracingImport + `info("Failed" + suffix);`,
        tracingImport + `info(\`Line one\\n  at frame (file.js:1:1)\`);`,
        tracingImport + `info(\`Total \${count} I/O operations\`);`,
        // Not a logger; only `tracing.js` imports and output channels are checked.
        `import { error } from "./other.js";\nerror("[ERROR] boom");`,
        `console.error("ERROR: boom");`,
        `function f(info) { info("WARN: shadowed"); }`,
        tracingImport + `function f(info) { info("WARN: shadowed"); }`,
    ],
    invalid: [
        {
            code: tracingImport + `warn("[WARN] " + inspect(err));`,
            errors: [{ messageId: "redundantLevel", data: { keyword: "[WARN]" } }],
        },
        {
            code: tracingImport + `trace(\`TRACE: \${path} changed\`);`,
            errors: [{ messageId: "redundantLevel", data: { keyword: "TRACE:" } }],
        },
        {
            code: tracingImport + `error("error: something broke");`,
            errors: [{ messageId: "redundantLevel", data: { keyword: "error:" } }],
        },
        {
            code: tracingImport + `debug("[debug] [wt] Change");`,
            errors: [{ messageId: "redundantLevel", data: { keyword: "[debug]" } }],
        },
        {
            code: tracingImport + `error(\`Error checking file permissions for \${filePath}\`);`,
            errors: [{ messageId: "levelKeyword", data: { keyword: "Error" } }],
        },
        {
            code: tracingImport + `warn(\`\${id} watcher refresh() called after dispose, WARN\`);`,
            errors: [{ messageId: "levelKeyword", data: { keyword: "WARN" } }],
        },
        {
            code: tracingImport + `info("Request failed, error: timeout");`,
            errors: [{ messageId: "levelKeyword", data: { keyword: "error:" } }],
        },
        {
            code: tracingImport + `info(\`\${prefix}[ERROR] boom\`);`,
            errors: [{ messageId: "levelKeyword", data: { keyword: "[ERROR]" } }],
        },
        {
            code: tracingImport + `info("Summary\\nI found 3 repositories");`,
            errors: [{ messageId: "levelLetter", data: { keyword: "I" } }],
        },
        {
            code: tracingImport + `info("Summary\\n" + "- E is unset");`,
            errors: [{ messageId: "levelLetter", data: { keyword: "E" } }],
        },
        {
            code: `import * as tracing from "../tracing.js";\ntracing.info("INFO: hello");`,
            errors: [{ messageId: "redundantLevel", data: { keyword: "INFO:" } }],
        },
        {
            code: `outputChannel.warn("[warning] careful");`,
            errors: [{ messageId: "redundantLevel", data: { keyword: "[warning]" } }],
        },
        {
            code: `class A { #outputChannel; f() { this.#outputChannel.error("FATAL crash"); } }`,
            errors: [{ messageId: "levelKeyword", data: { keyword: "FATAL" } }],
        },
    ],
});
