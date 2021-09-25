import { ScmCommand } from "../commands.js";

export function createCommand(
	cloneRepository: (url?: string, parentPath?: string, options?: { recursive?: boolean }) => Promise<void>,
): ScmCommand {
	async function clone(url?: string, parentPath?: string): Promise<void> {
		await cloneRepository(url, parentPath);
	};

	return {
		commandId: 'git.clone',
		key: clone.name,
		method: clone,
		options: {},
	};
}

