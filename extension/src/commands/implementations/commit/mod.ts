import type { ScmCommand } from "../../helpers.js";
import * as commitAllAmendNoVerify from "./commit-all-amend-no-verify.js";
import * as commitAllAmend from "./commit-all-amend.js";
import * as commitAllNoVerify from "./commit-all-no-verify.js";
import * as commitAllSignedNoVerify from "./commit-all-signed-no-verify.js";
import * as commitAllSigned from "./commit-all-signed.js";
import * as commitAll from "./commit-all.js";
import * as commitEmptyNoVerify from "./commit-empty-no-verify.js";
import * as commitEmpty from "./commit-empty.js";
import * as commitNoVerify from "./commit-no-verify.js";
import * as commitStagedAmendNoVerify from "./commit-staged-amend-no-verify.js";
import * as commitStagedAmend from "./commit-staged-amend.js";
import * as commitStagedNoVerify from "./commit-staged-no-verify.js";
import * as commitStagedSignedNoVerify from "./commit-staged-signed-no-verify.js";
import * as commitStagedSigned from "./commit-staged-signed.js";
import * as commitStaged from "./commit-staged.js";
import * as commit from "./commit.js";

export function createCommands(): ScmCommand[] {
    return [
        commit.createCommand(),
        commitAll.createCommand(),
        commitAllAmend.createCommand(),
        commitAllAmendNoVerify.createCommand(),
        commitAllNoVerify.createCommand(),
        commitAllSigned.createCommand(),
        commitAllSignedNoVerify.createCommand(),
        commitEmpty.createCommand(),
        commitEmptyNoVerify.createCommand(),
        commitNoVerify.createCommand(),
        commitStaged.createCommand(),
        commitStagedAmend.createCommand(),
        commitStagedAmendNoVerify.createCommand(),
        commitStagedNoVerify.createCommand(),
        commitStagedSigned.createCommand(),
        commitStagedSignedNoVerify.createCommand(),
    ];
}
