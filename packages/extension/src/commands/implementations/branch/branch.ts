import { ScmCommand } from "../../helpers.js";
import { branch } from "./helpers.js";

export function createCommand(): ScmCommand {
    return {
        commandId: "git.branch",
        method: branch,
        options: {
            repository: true,
        },
    };
}
