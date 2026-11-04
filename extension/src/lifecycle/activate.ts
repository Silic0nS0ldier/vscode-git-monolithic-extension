import type { TelemetryReporter } from "@vscode/extension-telemetry";
import * as os from "node:os";
import * as path from "node:path";
import { setTimeout } from "node:timers/promises";
import { inspect } from "node:util";
import {
    commands,
    Disposable,
    env,
    type ExtensionContext,
    languages,
    type OutputChannel,
    Uri,
    version as vscodeVersion,
    window,
    workspace,
    type WorkspaceFolder,
} from "vscode";
import { Askpass } from "../askpass.js";
import { makeCommandId } from "../commands/helpers.js";
import { pruned } from "../commands/pruned.js";
import { registerCommands } from "../commands/register.js";
import * as selected from "../commands/selection.gen.js";
import { addDecorations } from "../decorationProvider.js";
import { GitFileSystemProvider } from "../fileSystemProvider.js";
import { Git } from "../git.js";
import { findGit, type IGit } from "../git/find.js";
import * as i18n from "../i18n/mod.js";
import { Model } from "../model.js";
import { GitProtocolHandler } from "../protocolHandler.js";
import { registerTerminalEnvironmentManager } from "../terminal.js";
import { error, info, setOutputChannel, unsetOutputChannel, warn } from "../tracing.js";
import { createInlayHintsProvider } from "../ui/inlay-hints-provider.js";
import * as config from "../util/config.js";
import { filterEvent } from "../util/events.js";
import { hasDotGit } from "../util/has-dot-git.js";
import { isExpectedError } from "../util/is-expected-error.js";
import { deactivateTasks } from "./deactivate.js";

export async function activate(context: ExtensionContext): Promise<void> {
    // TODO Many parts of the extension reference this `outputChannel` instance, need to be mindful that noting uses it after disposal.
    const outputChannel = window.createOutputChannel("Git Monolithic", { log: true });
    setOutputChannel(outputChannel);

    info("Monolithic Git for VSCode is starting...");

    const disposables: Disposable[] = [];
    context.subscriptions.push(
        new Disposable(() => {
            Disposable.from(...disposables).dispose();
            unsetOutputChannel();
        }),
    );

    commands.registerCommand(
        makeCommandId("showOutput"),
        selected.showOutput ? () => outputChannel.show() : () => pruned("showOutput").method(),
    );
    disposables.push(outputChannel);

    // Repoter disabled, for now
    // const { name, version, aiKey } = require('../package.json') as { name: string, version: string, aiKey: string };
    // const telemetryReporter = new TelemetryReporter(name, version, aiKey);
    const telemetryReporter = new Proxy<TelemetryReporter>({} as TelemetryReporter, {
        get() {
            return () => {};
        },
    });

    // TODO Recommend user disables built-in Git extension if repository is massive
    let extensionEnablementState: boolean = config.enabled() && !config.builtinGitEnabled();

    // Serialize config change processing to prevent race conditions
    let configChangeQueue = Promise.resolve();

    const onConfigChange = filterEvent(
        workspace.onDidChangeConfiguration,
        e => config.affected(e) || config.builtinGitEnabled.affected(e),
    );
    onConfigChange(() => {
        const lastQueue = configChangeQueue;
        async function handleConfigChange() {
            // Wait for previous task to complete
            await lastQueue.catch(() => {/* Ignore errors from previous task */});

            try {
                const newState = config.enabled() && !config.builtinGitEnabled();

                if (newState === extensionEnablementState) {
                    return;
                }

                extensionEnablementState = newState;

                if (extensionEnablementState) {
                    info("Config changed, activating Git Monolithic extension...");
                    await enableExtension(context, outputChannel, telemetryReporter);
                } else {
                    info("Config changed, deactivating Git Monolithic extension...");
                    disableExtension();
                }
            } catch (err) {
                error(`Failed to process config change: ${inspect(err)}`);
            }

            // Running of disposals does not handle async tasks and behaviour around errors is unknown
            // To reduce the risk of incomplete disposals (which can prevent re-activation) we wait a few seconds
            await setTimeout(5000);
        }

        configChangeQueue = handleConfigChange();
    });

    if (extensionEnablementState) {
        info("Activating Git Monolithic extension...");
        await enableExtension(context, outputChannel, telemetryReporter);
    } else if (!config.enabled()) {
        warn("Git Monolithic is inactive because `git_monolithic.enabled` is false.");
    } else {
        warn(
            "Git Monolithic is inactive because VSCode's builtin git extension is enabled. "
                + "Set `git.enabled` to false to use Git Monolithic.",
        );
    }

    deactivateTasks.push(() => telemetryReporter.dispose());
    deactivateTasks.push(async () => disableExtension());
}

let extensionDisposable: Disposable | undefined;

async function enableExtension(
    context: ExtensionContext,
    outputChannel: OutputChannel,
    telemetryReporter: TelemetryReporter,
): Promise<void> {
    try {
        const [model, modelDisposable] = await createModel(context, outputChannel, telemetryReporter);
        const inlayHintsProvider = createInlayHintsProvider(model);
        const fileInlayDisposable = languages.registerInlayHintsProvider({ scheme: "file" }, inlayHintsProvider);

        extensionDisposable = Disposable.from(modelDisposable, fileInlayDisposable);
    } catch (err) {
        if (!isExpectedError(err, Error, e => /Git installation not found/.test(e.message))) {
            throw err;
        }

        warn(inspect(err));

        commands.executeCommand("setContext", "git_monolithic.context.missing", true);
        warnAboutMissingGit();
    }
}

function disableExtension(): void {
    extensionDisposable?.dispose();
    extensionDisposable = undefined;
}

async function createModel(
    context: ExtensionContext,
    outputChannel: OutputChannel,
    telemetryReporter: TelemetryReporter,
): Promise<[Model, Disposable]> {
    const disposables: Disposable[] = [];
    const pathValue = config.path();
    let pathHints = Array.isArray(pathValue) ? pathValue : pathValue ? [pathValue] : [];

    const { isTrusted } = workspace;

    if (!isTrusted && pathHints.length !== 0) {
        // Filter out any non-absolute paths
        pathHints = pathHints.filter(p => path.isAbsolute(p));
    }

    const gitInfo = await findGit(pathHints);
    info(i18n.Translations.usingGit(gitInfo.version, gitInfo.path));

    const askpass = await Askpass.create();
    disposables.push(askpass);

    const environment = askpass.getEnv();
    disposables.push(registerTerminalEnvironmentManager(context, environment));

    const git = new Git({
        context: gitInfo.context,
        env: environment,
        gitPath: gitInfo.path,
        userAgent:
            `git/${gitInfo.version} (${os.version()} ${os.release()}; ${os.platform()} ${os.arch()}) vscode/${vscodeVersion} (${env.appName})`,
        version: gitInfo.version,
    });

    const model = new Model(git, context.globalState);
    disposables.push(model);

    const onRepository = async (): Promise<void> =>
        void await commands.executeCommand<unknown>(
            "setContext",
            "git_monolithic.context.openRepositoryCount",
            `${model.repositories.length}`,
        );
    model.onDidOpenRepository(onRepository, null, disposables);
    model.onDidCloseRepository(onRepository, null, disposables);
    onRepository();

    const disposeCommands = registerCommands(model, git, outputChannel, telemetryReporter);
    disposables.push(
        disposeCommands,
        // TODO This is a really funky pattern that relies on side effects
        // Find a better way
        new GitFileSystemProvider(model),
        addDecorations(model),
        new GitProtocolHandler(),
    );

    checkGitVersion(gitInfo);

    return [model, Disposable.from(...disposables)];
}

async function warnAboutMissingGit(): Promise<void> {
    const shouldIgnore = config.ignoreMissingGitWarning();

    if (shouldIgnore) {
        return;
    }

    if (!workspace.workspaceFolders) {
        return;
    }

    const areGitRepositories = await Promise.all(workspace.workspaceFolders.map(isGitRepository));

    if (areGitRepositories.every(isGitRepository => !isGitRepository)) {
        return;
    }

    const download = i18n.Translations.downloadGit();
    const neverShowAgain = i18n.Translations.neverShowAgain();
    const choice = await window.showWarningMessage(
        i18n.Translations.notFound(),
        download,
        neverShowAgain,
    );

    if (choice === download) {
        // TODO Address hard coded URL
        commands.executeCommand("vscode.open", Uri.parse("https://git-scm.com/"));
    } else if (choice === neverShowAgain) {
        await config.ignoreMissingGitWarning.update(true, true);
    }
}

async function isGitRepository(folder: WorkspaceFolder): Promise<boolean> {
    if (folder.uri.scheme !== "file") {
        return false;
    }

    return await hasDotGit(folder.uri.fsPath);
}

async function checkGitVersion(info: IGit): Promise<void> {
    await checkGitv1(info);

    if (process.platform === "win32") {
        await checkGitWindows(info);
    }
}

async function checkGitv1(info: IGit): Promise<void> {
    const shouldIgnore = config.ignoreLegacyWarning();

    if (shouldIgnore) {
        return;
    }

    if (!/^[01]/.test(info.version)) {
        return;
    }

    const update = i18n.Translations.updateGit();
    const neverShowAgain = i18n.Translations.neverShowAgain();

    const choice = await window.showWarningMessage(
        i18n.Translations.git20(info.version),
        update,
        neverShowAgain,
    );

    if (choice === update) {
        // TODO Repeated
        commands.executeCommand("vscode.open", Uri.parse("https://git-scm.com/"));
    } else if (choice === neverShowAgain) {
        await config.ignoreLegacyWarning.update(true, true);
    }
}

async function checkGitWindows(info: IGit): Promise<void> {
    if (!/^2\.(25|26)\./.test(info.version)) {
        return;
    }

    const shouldIgnore = config.ignoreWindowsGit27Warning();

    if (shouldIgnore) {
        return;
    }

    const update = i18n.Translations.updateGit();
    const neverShowAgain = i18n.Translations.neverShowAgain();
    const choice = await window.showWarningMessage(
        i18n.Translations.git2526(info.version),
        update,
        neverShowAgain,
    );

    if (choice === update) {
        // TODO Repeated
        commands.executeCommand("vscode.open", Uri.parse("https://git-scm.com/"));
    } else if (choice === neverShowAgain) {
        await config.ignoreWindowsGit27Warning.update(true, true);
    }
}
