import { PushOptions, PushType, ScmCommand } from "../../commands.js";
import { Repository } from "../../repository.js";

export function createCommand(
	pushFn: (repository: Repository, pushOptions: PushOptions) => Promise<void>,
): ScmCommand {
	async function pushToForce(repository: Repository, remote?: string, refspec?: string, setUpstream?: boolean): Promise<void> {
		await pushFn(repository, {
			pushType: PushType.PushTo,
			pushTo: {
				remote,
				refspec,
				setUpstream,
			},
			forcePush: true,
		});
	};

	return {
		commandId: 'git.pushToForce',
		method: pushToForce,
		options: {
			repository: true,
		},
	};
}

