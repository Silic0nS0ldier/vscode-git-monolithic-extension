import { commands, MessageOptions, OutputChannel, Uri, window, workspace } from "vscode";
import { GitErrorCodes } from "../api/git.js";
import { Model } from "../model.js";
import { TelemetryReporter } from "../package-patches/vscode-extension-telemetry.js";
import { FinalRepository } from "../repository/repository-class/mod.js";
import { localize } from "../util.js";
import { CommandErrorOutputTextDocumentContentProvider, ScmCommandOptions } from "./helpers.js";

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
            let repositoryPromise: Promise<FinalRepository | undefined>;

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

        return result.catch(async err => {
            const options: MessageOptions = {
                modal: true,
            };

            let message: string;
            let type: "error" | "warning" = "error";

            const choices = new Map<string, () => void>();
            const openOutputChannelChoice = localize("open git log", "Open Git Log");
            choices.set(openOutputChannelChoice, () => outputChannel.show());

            const showCommandOutputChoice = localize("show command output", "Show Command Output");
            if (err.stderr) {
                choices.set(showCommandOutputChoice, async () => {
                    const timestamp = new Date().getTime();
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
                    message = localize("clean repo", "Please clean your repository working tree before checkout.");
                    break;
                case GitErrorCodes.PushRejected:
                    message = localize(
                        "cant push",
                        "Can't push refs to remote. Try running 'Pull' first to integrate your changes.",
                    );
                    break;
                case GitErrorCodes.Conflict:
                    message = localize("merge conflicts", "There are merge conflicts. Resolve them before committing.");
                    type = "warning";
                    options.modal = false;
                    break;
                case GitErrorCodes.StashConflict:
                    message = localize("stash merge conflicts", "There were merge conflicts while applying the stash.");
                    type = "warning";
                    options.modal = false;
                    break;
                case GitErrorCodes.AuthenticationFailed:
                    const regex = /Authentication failed for '(.*)'/i;
                    const match = regex.exec(err.stderr || String(err));

                    message = match
                        ? localize("auth failed specific", "Failed to authenticate to git remote:\n\n{0}", match[1])
                        : localize("auth failed", "Failed to authenticate to git remote.");
                    break;
                case GitErrorCodes.NoUserNameConfigured:
                case GitErrorCodes.NoUserEmailConfigured:
                    message = localize(
                        "missing user info",
                        "Make sure you configure your 'user.name' and 'user.email' in git.",
                    );
                    choices.set(
                        localize("learn more", "Learn More"),
                        () =>
                            commands.executeCommand(
                                "vscode.open",
                                Uri.parse("https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup"),
                            ),
                    );
                    break;
                default:
                    const hint = (err.stderr || err.message || String(err))
                        .replace(/^error: /mi, "")
                        .replace(/^> husky.*$/mi, "")
                        .split(/[\r\n]/)
                        .filter((line: string) => !!line)[0];

                    message = hint
                        ? localize("git error details", "Git: {0}", hint)
                        : localize("git error", "Git error");

                    break;
            }

            if (!message) {
                console.error(err);
                return;
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
        });
    };

    return result;
}
