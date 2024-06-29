export type ResourceGroupTypeOptions = "Index" | "Merge" | "Untracked" | "WorkingTree";
export const ResourceGroupType: Record<ResourceGroupTypeOptions, ResourceGroupTypeOptions> = {
    Index: "Index",
    Merge: "Merge",
    Untracked: "Untracked",
    WorkingTree: "WorkingTree",
};
