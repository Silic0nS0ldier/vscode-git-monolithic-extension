import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
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

export function createCommands() {
    return [
        selected.commit ? commit.createCommand() : pruned("commit"),
        selected.commitAll ? commitAll.createCommand() : pruned("commitAll"),
        selected.commitAllAmend ? commitAllAmend.createCommand() : pruned("commitAllAmend"),
        selected.commitAllAmendNoVerify
            ? commitAllAmendNoVerify.createCommand()
            : pruned("commitAllAmendNoVerify"),
        selected.commitAllNoVerify ? commitAllNoVerify.createCommand() : pruned("commitAllNoVerify"),
        selected.commitAllSigned ? commitAllSigned.createCommand() : pruned("commitAllSigned"),
        selected.commitAllSignedNoVerify
            ? commitAllSignedNoVerify.createCommand()
            : pruned("commitAllSignedNoVerify"),
        selected.commitEmpty ? commitEmpty.createCommand() : pruned("commitEmpty"),
        selected.commitEmptyNoVerify ? commitEmptyNoVerify.createCommand() : pruned("commitEmptyNoVerify"),
        selected.commitNoVerify ? commitNoVerify.createCommand() : pruned("commitNoVerify"),
        selected.commitStaged ? commitStaged.createCommand() : pruned("commitStaged"),
        selected.commitStagedAmend ? commitStagedAmend.createCommand() : pruned("commitStagedAmend"),
        selected.commitStagedAmendNoVerify
            ? commitStagedAmendNoVerify.createCommand()
            : pruned("commitStagedAmendNoVerify"),
        selected.commitStagedNoVerify ? commitStagedNoVerify.createCommand() : pruned("commitStagedNoVerify"),
        selected.commitStagedSigned ? commitStagedSigned.createCommand() : pruned("commitStagedSigned"),
        selected.commitStagedSignedNoVerify
            ? commitStagedSignedNoVerify.createCommand()
            : pruned("commitStagedSignedNoVerify"),
    ];
}
