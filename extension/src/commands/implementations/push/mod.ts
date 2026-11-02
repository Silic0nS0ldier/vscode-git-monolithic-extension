import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as pushForce from "./push-force.js";
import * as pushTags from "./push-tags.js";
import * as pushToForce from "./push-to-force.js";
import * as pushTo from "./push-to.js";
import * as pushWithTagsForce from "./push-with-tags-force.js";
import * as pushWithTags from "./push-with-tags.js";
import * as push from "./push.js";

export function createCommands() {
    return [
        selected.push ? push.createCommand() : pruned("push"),
        selected.pushForce ? pushForce.createCommand() : pruned("pushForce"),
        selected.pushTags ? pushTags.createCommand() : pruned("pushTags"),
        selected.pushTo ? pushTo.createCommand() : pruned("pushTo"),
        selected.pushToForce ? pushToForce.createCommand() : pruned("pushToForce"),
        selected.pushWithTags ? pushWithTags.createCommand() : pruned("pushWithTags"),
        selected.pushWithTagsForce ? pushWithTagsForce.createCommand() : pruned("pushWithTagsForce"),
    ];
}
