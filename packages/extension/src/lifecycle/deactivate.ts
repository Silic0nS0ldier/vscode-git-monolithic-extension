export const deactivateTasks: { (): Promise<any>; }[] = [];

export async function deactivate(): Promise<void> {
	// TODO Promise.allSettled and AggregateError
	for (const task of deactivateTasks) {
		await task();
	}
}
