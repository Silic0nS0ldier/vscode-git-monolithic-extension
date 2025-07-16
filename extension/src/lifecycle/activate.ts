import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { inspect } from "node:util";
import {
    commands,
    Disposable,
    env,
    type ExtensionContext,
    type OutputChannel,
    Uri,
    version as vscodeVersion,
    window,
    workspace,
    type WorkspaceFolder,
    extensions,
    languages,
} from "vscode";
import { registerAPICommands } from "../api/api1.js";
import { GitExtensionImpl } from "../api/extension.js";
import type { GitExtension } from "../api/git.js";
import { Askpass } from "../askpass.js";
import { registerCommands } from "../commands/register.js";
import { addDecorations } from "../decorationProvider.js";
import { GitFileSystemProvider } from "../fileSystemProvider.js";
import { Git } from "../git.js";
import { findGit, type IGit } from "../git/find.js";
import * as i18n from "../i18n/mod.js";
import { Model } from "../model.js";
import type { TelemetryReporter } from "@vscode/extension-telemetry";
import { GitProtocolHandler } from "../protocolHandler.js";
import { registerTerminalEnvironmentManager } from "../terminal.js";
import * as config from "../util/config.js";
import { toDisposable } from "../util/disposals.js";
import { eventToPromise, filterEvent } from "../util/events.js";
import { isExpectedError } from "../util/is-expected-error.js";
import { deactivateTasks } from "./deactivate.js";
import { createInlayHintsProvider } from "../ui/inlay-hints-provider.js";

export async function activate(context: ExtensionContext): Promise<GitExtension> {
    const outputChannel = window.createOutputChannel("Git Monolithic");

    outputChannel.appendLine("Monolithic Git for VSCode is starting...");

    {
        const builtinGitExtension = extensions.getExtension("vscode.git");
        if (builtinGitExtension) {
            outputChannel.appendLine("Builtin git extension is enabled, this is not supported.");
            const result = await window.showErrorMessage(
                "Builtin git extension is enabled.",
                {
                    modal: true,
                    detail: "The builtin Git (Git SCM Integration) conflicts with Monolithic Git and should be disabled.",
                },
                "Show Extension",
            );
            if (result === "Show Extension") {
                commands.executeCommand("workbench.extensions.search", "@builtin git")
            }
        }
    }

    const disposables: Disposable[] = [];
    context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));

    commands.registerCommand("git.showOutput", () => outputChannel.show());
    disposables.push(outputChannel);

    // Repoter disabled, for now
    // const { name, version, aiKey } = require('../package.json') as { name: string, version: string, aiKey: string };
    // const telemetryReporter = new TelemetryReporter(name, version, aiKey);
    const telemetryReporter = new Proxy<TelemetryReporter>({} as any, {
        get() {
            return () => {};
        },
    });
    deactivateTasks.push(() => telemetryReporter.dispose());

    const enabled = config.enabled();

    if (!enabled) {
        const onConfigChange = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration("git"));
        const onEnabled = filterEvent(
            onConfigChange,
            () => config.enabled(),
        );
        const result = new GitExtensionImpl();

        eventToPromise(onEnabled).then(async () =>
            result.model = await createModel(context, outputChannel, telemetryReporter, disposables)
        );
        context.subscriptions.push(registerAPICommands(result));
        return result;
    }

    try {
        const model = await createModel(context, outputChannel, telemetryReporter, disposables);
        const inlayHintsProvider = createInlayHintsProvider(model, outputChannel);
        languages.registerInlayHintsProvider({ scheme: "file" }, inlayHintsProvider);
        languages.registerInlayHintsProvider({ scheme: "git" }, inlayHintsProvider);
        const result = new GitExtensionImpl(model);
        context.subscriptions.push(registerAPICommands(result));
        return result;
    } catch (err) {
        if (!isExpectedError(err, Error, e => /Git installation not found/.test(e.message))) {
            throw err;
        }

        outputChannel.appendLine("[WARN] " + inspect(err));

        commands.executeCommand("setContext", "git.missing", true);
        warnAboutMissingGit();

        const result = new GitExtensionImpl();
        context.subscriptions.push(registerAPICommands(result));
        return result;
    }
}

async function createModel(
    context: ExtensionContext,
    outputChannel: OutputChannel,
    telemetryReporter: TelemetryReporter,
    disposables: Disposable[],
): Promise<Model> {
    const pathValue = config.path();
    let pathHints = Array.isArray(pathValue) ? pathValue : pathValue ? [pathValue] : [];

    const { isTrusted } = workspace;

    if (!isTrusted && pathHints.length !== 0) {
        // Filter out any non-absolute paths
        pathHints = pathHints.filter(p => path.isAbsolute(p));
    }

    const info = await findGit(outputChannel, pathHints);
    outputChannel.appendLine(i18n.Translations.usingGit(info.version, info.path));

    // TODO Migrate to context.storageUri
    const askpass = await Askpass.create(outputChannel, context.storagePath);
    disposables.push(askpass);

    const environment = askpass.getEnv();
    disposables.push(registerTerminalEnvironmentManager(context, environment));

    const git = new Git({
        context: info.context,
        env: environment,
        gitPath: info.path,
        userAgent:
            `git/${info.version} (${os.version()} ${os.release()}; ${os.platform()} ${os.arch()}) vscode/${vscodeVersion} (${env.appName})`,
        version: info.version,
        outputChannel,
    });
    const onOutput = (str: string): void => {
        const lines = str.split(/\r?\n/mg);

        while (/^\s*$/.test(lines[lines.length - 1])) {
            lines.pop();
        }

        outputChannel.appendLine(lines.join("\n"));
    };
    git.onOutput.addListener("log", onOutput);

    const model = new Model(git, askpass, context.globalState, outputChannel);
    disposables.push(model);

    const onRepository = async (): Promise<void> =>
        void await commands.executeCommand<unknown>(
            "setContext",
            "gitOpenRepositoryCount",
            `${model.repositories.length}`,
        );
    model.onDidOpenRepository(onRepository, null, disposables);
    model.onDidCloseRepository(onRepository, null, disposables);
    onRepository();

    disposables.push(toDisposable(() => git.onOutput.removeListener("log", onOutput)));

    const disposeCommands = registerCommands(model, git, outputChannel, telemetryReporter);
    disposables.push(
        disposeCommands,
        // TODO This is a really funky pattern that relies on side effects
        // Find a better way
        new GitFileSystemProvider(model),
        addDecorations(model),
        new GitProtocolHandler(outputChannel),
        // new GitTimelineProvider(model, cc)
    );

    checkGitVersion(info);

    return model;
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
        await config.legacy().update("ignoreMissingGitWarning", true, true);
    }
}

async function isGitRepository(folder: WorkspaceFolder): Promise<boolean> {
    if (folder.uri.scheme !== "file") {
        return false;
    }

    const dotGit = path.join(folder.uri.fsPath, ".git");

    try {
        const dotGitStat = await new Promise<fs.Stats>((c, e) =>
            fs.stat(dotGit, (err, stat) => err ? e(err) : c(stat))
        );
        return dotGitStat.isDirectory();
    } catch (err) {
        return false;
    }
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
        await config.legacy().update("ignoreLegacyWarning", true, true);
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
        await config.legacy().update("ignoreWindowsGit27Warning", true, true);
    }
}
