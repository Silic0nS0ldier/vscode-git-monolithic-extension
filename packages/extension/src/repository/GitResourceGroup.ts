import type { SourceControlResourceGroup } from "vscode";
import type { Resource } from "./Resource.js";

export interface GitResourceGroup extends SourceControlResourceGroup {
    resourceStates: Resource[];
}
