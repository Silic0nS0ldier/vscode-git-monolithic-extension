import test from "ava";
import type { StatusOptions } from "monolithic-git-interop/api/status/mod";
import {
    readWorkingTreeStatus,
    type StatusConfig,
    statusOptions,
    type WorkingTreeStatusDeps,
} from "./working-tree-status.js";

const UNSET: StatusConfig = { "diff.ignoreSubmodules": undefined, "status.showUntrackedFiles": undefined };

/** Records each call in order, answering `status` with `untracked` and `expand` from `expansions`. */
function recordingDeps(
    untracked: string[],
    config: StatusConfig = UNSET,
    expand: (folders: string[]) => Promise<string[]> = async folders => folders.map(f => `${f}file.txt`),
) {
    const calls: (["status", StatusOptions] | ["expand", string[]])[] = [];
    let statusSettled = false;
    const deps: WorkingTreeStatusDeps<string> = {
        config: async () => config,
        expand: async folders => {
            calls.push(["expand", folders]);
            if (!statusSettled) {
                throw new Error("expanded before status settled");
            }
            return expand(folders);
        },
        status: async opts => {
            calls.push(["status", opts]);
            await Promise.resolve();
            statusSettled = true;
            return { head: "HEAD", status: [], untracked };
        },
    };
    return { calls, deps };
}

test("Uses the mode git's untracked cache serves: all only when configured, normal otherwise", t => {
    const cases: [value: string | undefined, untracked: "normal" | "all"][] = [
        [undefined, "normal"],
        ["normal", "normal"],
        ["no", "normal"],
        ["all", "all"],
    ];
    for (const [value, untracked] of cases) {
        t.is(statusOptions({ ...UNSET, "status.showUntrackedFiles": value }, false).untracked, untracked, value);
    }
});

test("Hides untracked content in submodules unless the user's diff.ignoreSubmodules already hides more", t => {
    for (
        const [value, hide] of [[undefined, true], ["none", true], ["untracked", false], ["dirty", false], [
            "all",
            false,
        ]] as const
    ) {
        t.is(statusOptions({ ...UNSET, "diff.ignoreSubmodules": value }, false).hideUntrackedInSubmodules, hide, value);
    }
});

test("Passes the ignore submodules setting through", t => {
    t.true(statusOptions(UNSET, true).ignoreSubmodules);
    t.false(statusOptions(UNSET, false).ignoreSubmodules);
});

test("Runs one status, then lists only the collapsed folders' files, once status has settled", async t => {
    const { calls, deps } = recordingDeps(["root.txt", "new/", "partial/beside.txt", ":colon/"]);

    const result = await readWorkingTreeStatus(deps, false);

    t.is(result.head, "HEAD");
    t.deepEqual(await result.untracked, {
        files: ["root.txt", "partial/beside.txt", "new/file.txt", ":colon/file.txt"],
    });
    t.deepEqual(calls, [
        ["status", { hideUntrackedInSubmodules: true, ignoreSubmodules: false, untracked: "normal" }],
        ["expand", ["new/", ":colon/"]],
    ]);
});

test("Lists nothing more when no folder is collapsed", async t => {
    const { calls, deps } = recordingDeps(["root.txt"]);

    const result = await readWorkingTreeStatus(deps, false);

    t.deepEqual(await result.untracked, { files: ["root.txt"] });
    t.is(calls.length, 1);
});

test("In all mode, a dir/ entry is a nested repository and is listed as it is", async t => {
    const { calls, deps } = recordingDeps(["new/file.txt", "vendor/lib/"], {
        ...UNSET,
        "status.showUntrackedFiles": "all",
    });

    const result = await readWorkingTreeStatus(deps, false);

    t.deepEqual(await result.untracked, { files: ["new/file.txt", "vendor/lib/"] });
    t.deepEqual(calls, [["status", { hideUntrackedInSubmodules: true, ignoreSubmodules: false, untracked: "all" }]]);
});

test("A failure to list a folder's files only fails the untracked files", async t => {
    const failure = new Error("timed out");
    const { deps } = recordingDeps(["new/"], UNSET, async () => {
        throw failure;
    });

    const result = await readWorkingTreeStatus(deps, false);

    t.is(result.head, "HEAD");
    t.deepEqual(await result.untracked, { reason: failure });
});

test("A failing status fails the whole read", async t => {
    const failure = new Error("timed out");
    const deps: WorkingTreeStatusDeps<string> = {
        config: async () => UNSET,
        expand: async () => t.fail("nothing to expand") as never,
        status: async () => {
            throw failure;
        },
    };

    await t.throwsAsync(readWorkingTreeStatus(deps, false), { is: failure });
});

test("Turns off optional locks when optionalLocks reports false", async t => {
    const { calls, deps } = recordingDeps([]);
    await readWorkingTreeStatus({ ...deps, optionalLocks: async () => false }, false);

    t.deepEqual(calls, [[
        "status",
        { hideUntrackedInSubmodules: true, ignoreSubmodules: false, optionalLocks: false, untracked: "normal" },
    ]]);
});
