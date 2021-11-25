import { Model } from "../../../model.js";
import { ScmCommand } from "../../helpers.js";
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

export function createCommands(model: Model): ScmCommand[] {
	return [
		commit.createCommand(model),
		commitAll.createCommand(model),
		commitAllAmend.createCommand(model),
		commitAllAmendNoVerify.createCommand(model),
		commitAllNoVerify.createCommand(model),
		commitAllSigned.createCommand(model),
		commitAllSignedNoVerify.createCommand(model),
		commitEmpty.createCommand(model),
		commitEmptyNoVerify.createCommand(model),
		commitNoVerify.createCommand(model),
		commitStaged.createCommand(model),
		commitStagedAmend.createCommand(model),
		commitStagedAmendNoVerify.createCommand(model),
		commitStagedNoVerify.createCommand(model),
		commitStagedSigned.createCommand(model),
		commitStagedSignedNoVerify.createCommand(model),
	];
}
