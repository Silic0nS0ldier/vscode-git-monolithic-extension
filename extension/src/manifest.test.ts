import test from "ava";
import { checkProject, formatDiagnostic } from "monolithic-vscode-manifest/check";
import { globSync, readFileSync } from "node:fs";

/**
 * Pre-existing problems, as `<code> <subject>`. Entries must be removed once fixed; stale entries fail the test.
 */
const KNOWN_ISSUES = new Set([
    "unreachable-command git_monolithic.openResource",
    "unreachable-command git_monolithic.restoreCommitTemplate",
    "unused-nls-key config.discardAllScope",
    "unused-nls-key config.alwaysShowStagedChangesResourceGroup",
    "unused-nls-key config.untrackedChanges",
    "unused-nls-key config.untrackedChanges.mixed",
    "unused-nls-key config.untrackedChanges.separate",
    "unused-nls-key config.untrackedChanges.hidden",
    "unused-nls-key submenu.explorer",
    "unused-nls-key submenu.commit.amend",
    "unused-nls-key submenu.commit.signoff",
    "unused-nls-key view.workbench.scm.missing",
    "unused-nls-key view.workbench.scm.disabled",
    "unused-nls-key view.workbench.scm.empty",
    "unused-nls-key view.workbench.scm.folder",
    "unused-nls-key view.workbench.scm.workspace",
    "unused-nls-key view.workbench.scm.emptyWorkspace",
    "unused-nls-key view.workbench.cloneRepository",
    "unused-nls-key view.workbench.learnMore",
]);

function read(file: string): { file: string; text: string } {
    return { file, text: readFileSync(file, "utf8") };
}

test("The manifest agrees with the commands the extension registers and references", t => {
    const sources = globSync("src/**/*.ts", { exclude: f => f.endsWith(".test.ts") || f.endsWith(".stub.ts") });
    t.true(sources.length > 0, "No sources found; are they in the test's data?");

    const diagnostics = checkProject({
        manifest: read("vsix/package.json"),
        nls: read("vsix/package.nls.json"),
        sources: sources.sort().map(read),
        options: { commandPrefix: "git_monolithic.", idFactories: ["makeCommandId"] },
    });

    const found = new Set(diagnostics.map(d => `${d.code} ${d.subject}`));
    const unexpected = diagnostics.filter(d => !KNOWN_ISSUES.has(`${d.code} ${d.subject}`)).map(formatDiagnostic);
    const stale = [...KNOWN_ISSUES].filter(issue => !found.has(issue));

    t.deepEqual(unexpected, [], "New manifest problems");
    t.deepEqual(stale, [], "Fixed problems still listed in KNOWN_ISSUES");
});
