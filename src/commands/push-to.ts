import { PushOptions, PushType, ScmCommand } from "../commands.js";
import { Repository } from "../repository.js";

export function createCommand(
	pushFn: (repository: Repository, pushOptions: PushOptions) => Promise<void>,
): ScmCommand {
	async function pushTo(repository: Repository, remote?: string, refspec?: string, setUpstream?: boolean): Promise<void> {
		await pushFn(repository, {
			pushType: PushType.PushTo,
			pushTo: {
				remote,
				refspec,
				setUpstream,
			},
		});
	};

	return {
		commandId: 'git.pushTo',
		key: pushTo.name,
		method: pushTo,
		options: {
			repository: true,
		},
	};
}

