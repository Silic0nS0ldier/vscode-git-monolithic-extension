import { Repository } from "../../git.js";

export async function getInputTemplate(repository: Repository): Promise<string> {
    const commitMessage = (await Promise.all([repository.getMergeMessage(), repository.getSquashMessage()])).find(
        msg => !!msg,
    );

    if (commitMessage) {
        return commitMessage;
    }

    return await repository.getCommitTemplate();
}