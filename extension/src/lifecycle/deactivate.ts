export const deactivateTasks: { (): Promise<any> }[] = [];

export async function deactivate(): Promise<void> {
    const results = await Promise.allSettled(deactivateTasks.map(task => task()));
    const errors = results.filter((r) => r.status === "rejected").map(r => r.reason);
    if (errors.length > 0) {
        throw new AggregateError(errors, "Failed to deactivate cleanly");
    }
}
