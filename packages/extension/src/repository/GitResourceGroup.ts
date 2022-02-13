import { SourceControlResourceGroup } from "vscode";
import { Resource } from "./Resource.js";

export interface GitResourceGroup extends SourceControlResourceGroup {
    resourceStates: Resource[];
}
