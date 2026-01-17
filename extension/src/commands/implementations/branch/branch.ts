import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { branch } from "./helpers.js";

export function createCommand(): ScmCommand {
    return {
        commandId: makeCommandId("branch"),
        method: branch,
        options: {
            repository: true,
        },
    };
}
