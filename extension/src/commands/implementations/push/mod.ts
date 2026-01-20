import type { ScmCommand } from "../../helpers.js";
import * as pushForce from "./push-force.js";
import * as pushTags from "./push-tags.js";
import * as pushToForce from "./push-to-force.js";
import * as pushTo from "./push-to.js";
import * as pushWithTagsForce from "./push-with-tags-force.js";
import * as pushWithTags from "./push-with-tags.js";
import * as push from "./push.js";

export function createCommands(): ScmCommand[] {
    return [
        push.createCommand(),
        pushForce.createCommand(),
        pushTags.createCommand(),
        pushTo.createCommand(),
        pushToForce.createCommand(),
        pushWithTags.createCommand(),
        pushWithTagsForce.createCommand(),
    ];
}
