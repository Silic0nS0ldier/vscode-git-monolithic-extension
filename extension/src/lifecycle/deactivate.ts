export const deactivateTasks: { (): Promise<unknown> }[] = [];

export async function deactivate(): Promise<void> {
    const results = await Promise.allSettled(deactivateTasks.map(task => task()));
    const errors: unknown[] = results.filter((r) => r.status === "rejected").map(r => r.reason as unknown);
    if (errors.length > 0) {
        throw new AggregateError(errors, "Failed to deactivate cleanly");
    }
}
