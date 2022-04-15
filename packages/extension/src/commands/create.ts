import { commands, MessageOptions, OutputChannel, Uri, window, workspace } from "vscode";
import { GitErrorCodes } from "../api/git.js";
import { GitError } from "../git/error.js";
import {
    authFailed,
    cantPush,
    cleanRepo,
    fallthroughError,
    gitError,
    learnMore,
    mergeConflicts,
    missingUserInfo,
    openGitLog,
    showCommandOutput,
    stashMergeConflicts,
} from "../i18n/mod.js";
import { prettyPrint } from "../logging/pretty-print.js";
import type { Model } from "../model.js";
import type { TelemetryReporter } from "../package-patches/vscode-extension-telemetry.js";
import type { AbstractRepository } from "../repository/repository-class/AbstractRepository.js";
import type { CommandErrorOutputTextDocumentContentProvider, ScmCommandOptions } from "./helpers.js";

// TODO Remove argument injection logic, it complicates code and hides potential errors
export function createCommand(
    model: Model,
    telemetryReporter: TelemetryReporter,
    outputChannel: OutputChannel,
    commandErrors: CommandErrorOutputTextDocumentContentProvider,
    id: string,
    method: Function,
    options: ScmCommandOptions,
): (...args: any[]) => any {
    const result = (...args: any[]) => {
        let result: Promise<any>;

        if (!options.repository) {
            result = Promise.resolve(method(...args));
        } else {
            // try to guess the repository based on the first argument
            const repository = model.getRepository(args[0]);
            let repositoryPromise: Promise<AbstractRepository | undefined>;

            if (repository) {
                repositoryPromise = Promise.resolve(repository);
            } else if (model.repositories.length === 1) {
                repositoryPromise = Promise.resolve(model.repositories[0]);
            } else {
                repositoryPromise = model.pickRepository();
            }

            result = repositoryPromise.then(repository => {
                if (!repository) {
                    return Promise.resolve();
                }

                return Promise.resolve(method(repository, ...args.slice(1)));
            });
        }

        /* __GDPR__
			"git.command" : {
				"command" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
        telemetryReporter.sendTelemetryEvent("git.command", { command: id });

        return result.catch(err => handleError(err, outputChannel, commandErrors));
    };

    return result;
}

async function handleError(
    rawErr: unknown,
    outputChannel: OutputChannel,
    commandErrors: CommandErrorOutputTextDocumentContentProvider,
) {
    const err = rawErr instanceof Error
        ? rawErr
        : new Error("Error running command", { cause: rawErr as Error });

    outputChannel.appendLine("[ERROR] " + await prettyPrint(err));

    const options: MessageOptions = {
        modal: true,
    };
    let message = fallthroughError();
    let type: "error" | "warning" = "error";
    const choices = new Map<string, () => void>();

    if (err instanceof GitError) {
        const openOutputChannelChoice = openGitLog();
        choices.set(openOutputChannelChoice, () => outputChannel.show());

        if (err.stderr) {
            const showCommandOutputChoice = showCommandOutput();
            choices.set(showCommandOutputChoice, async () => {
                const timestamp = new Date().getTime();
                // TODO Hard coded URL may break in the future
                const uri = Uri.parse(`git-output:/git-error-${timestamp}`);

                let command = "git";

                if (err.gitArgs) {
                    command = `${command} ${err.gitArgs.join(" ")}`;
                } else if (err.gitCommand) {
                    command = `${command} ${err.gitCommand}`;
                }

                commandErrors.set(uri, `> ${command}\n${err.stderr}`);

                try {
                    const doc = await workspace.openTextDocument(uri);
                    await window.showTextDocument(doc);
                } finally {
                    commandErrors.delete(uri);
                }
            });
        }

        switch (err.gitErrorCode) {
            case GitErrorCodes.DirtyWorkTree:
                message = cleanRepo();
                break;
            case GitErrorCodes.PushRejected:
                message = cantPush();
                break;
            case GitErrorCodes.Conflict:
                message = mergeConflicts();
                type = "warning";
                options.modal = false;
                break;
            case GitErrorCodes.StashConflict:
                message = stashMergeConflicts();
                type = "warning";
                options.modal = false;
                break;
            case GitErrorCodes.AuthenticationFailed:
                const regex = /Authentication failed for '(.*)'/i;
                const match = regex.exec(err.stderr || String(err));
                message = authFailed(match?.[1]);
                break;
            case GitErrorCodes.NoUserNameConfigured:
            case GitErrorCodes.NoUserEmailConfigured:
                message = missingUserInfo();
                choices.set(
                    learnMore(),
                    () =>
                        commands.executeCommand(
                            "vscode.open",
                            Uri.parse("https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup"),
                        ),
                );
                break;
            default:
                const hint: string | undefined = (err.stderr || err.message || String(err))
                    .replace(/^error: /mi, "")
                    // TODO Ideally we don't target specific tools like Husky
                    .replace(/^> husky.*$/mi, "")
                    .split(/[\r\n]/)
                    .filter((line: string) => !!line)[0];

                message = gitError(hint);
                break;
        }
    }

    const allChoices = Array.from(choices.keys());
    const result = type === "error"
        ? await window.showErrorMessage(message, options, ...allChoices)
        : await window.showWarningMessage(message, options, ...allChoices);

    if (result) {
        const resultFn = choices.get(result);

        if (resultFn) {
            resultFn();
        }
    }
}
