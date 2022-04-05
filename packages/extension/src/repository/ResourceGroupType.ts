export type ResourceGroupTypeOptions = "Merge" | "Index" | "WorkingTree" | "Untracked";
export const ResourceGroupType: Record<ResourceGroupTypeOptions, ResourceGroupTypeOptions> = {
    Merge: "Merge",
    Index: "Index",
    WorkingTree: "WorkingTree",
    Untracked: "Untracked",
};
