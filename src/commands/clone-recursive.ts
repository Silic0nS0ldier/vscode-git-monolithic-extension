import { ScmCommand } from "../commands.js";

export function createCommand(
	cloneRepository: (url?: string, parentPath?: string, options?: { recursive?: boolean }) => Promise<void>,
): ScmCommand {
	async function cloneRecursive(url?: string, parentPath?: string): Promise<void> {
		await cloneRepository(url, parentPath, { recursive: true });
	};

	return {
		commandId: 'git.cloneRecursive',
		key: cloneRecursive.name,
		method: cloneRecursive,
		options: {},
	};
}

