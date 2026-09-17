/** What HEAD is doing, for the labels that describe it. */
export type HeadStateOptions = "Attached" | "Detached" | "Rebasing";
export const HeadState = {
    Attached: "Attached",
    Detached: "Detached",
    Rebasing: "Rebasing",
} satisfies Record<HeadStateOptions, HeadStateOptions>;
