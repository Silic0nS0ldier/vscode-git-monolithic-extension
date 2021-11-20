import { ScmCommand } from "../../../commands.js";
import { Repository } from "../../../repository.js";
import { PushOptions, PushType } from "./helpers.js";

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
		method: pushTo,
		options: {
			repository: true,
		},
	};
}

