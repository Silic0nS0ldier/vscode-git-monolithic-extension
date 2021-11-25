import { GitExtension } from "../api/git.js";
import { registerTerminalEnvironmentManager } from '../terminal.js';
import { GitProtocolHandler } from '../protocolHandler.js';
import { GitExtensionImpl } from '../api/extension.js';
import { findGit, Git, IGit } from '../git.js';
import { Model } from '../model.js';
import { registerCommands } from "../commands/register.js";
import { GitFileSystemProvider } from '../fileSystemProvider.js';
import { GitDecorations } from '../decorationProvider.js';
import { Askpass } from '../askpass.js';
import { toDisposable, filterEvent, eventToPromise, localize } from '../util.js';
import { env, ExtensionContext, workspace, window, Disposable, commands, Uri, OutputChannel, version as vscodeVersion, WorkspaceFolder } from 'vscode';
import { registerAPICommands } from '../api/api1.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { deactivateTasks } from "./deactivate.js";
import { TelemetryReporter } from "../package-patches/vscode-extension-telemetry.js";

export async function activate(context: ExtensionContext): Promise<GitExtension> {
	console.warn('git ext starting');
	const disposables: Disposable[] = [];
	context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));

	const outputChannel = window.createOutputChannel('Git');
	commands.registerCommand('git.showOutput', () => outputChannel.show());
	disposables.push(outputChannel);

	// Repoter disabled, for now
	// const { name, version, aiKey } = require('../package.json') as { name: string, version: string, aiKey: string };
	// const telemetryReporter = new TelemetryReporter(name, version, aiKey);
	const telemetryReporter = new Proxy<TelemetryReporter>({} as any, {
		get() {
			return () => {};
		}
	});
	deactivateTasks.push(() => telemetryReporter.dispose());

	const config = workspace.getConfiguration('git', null);
	const enabled = config.get<boolean>('enabled');

	if (!enabled) {
		const onConfigChange = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git'));
		const onEnabled = filterEvent(onConfigChange, () => workspace.getConfiguration('git', null).get<boolean>('enabled') === true);
		const result = new GitExtensionImpl();

		eventToPromise(onEnabled).then(async () => result.model = await createModel(context, outputChannel, telemetryReporter, disposables));
		context.subscriptions.push(registerAPICommands(result));
		return result;
	}

	try {
		const model = await createModel(context, outputChannel, telemetryReporter, disposables);
		const result = new GitExtensionImpl(model);
		context.subscriptions.push(registerAPICommands(result));
		return result;
	} catch (err) {
		if (!/Git installation not found/.test(err.message || '')) {
			throw err;
		}

		console.warn(err.message);
		outputChannel.appendLine(err.message);

		commands.executeCommand('setContext', 'git.missing', true);
		warnAboutMissingGit();

		const result = new GitExtensionImpl();
		context.subscriptions.push(registerAPICommands(result));
		return result;
	}
}

async function createModel(context: ExtensionContext, outputChannel: OutputChannel, telemetryReporter: TelemetryReporter, disposables: Disposable[]): Promise<Model> {
	const pathValue = workspace.getConfiguration('git').get<string | string[]>('path');
	let pathHints = Array.isArray(pathValue) ? pathValue : pathValue ? [pathValue] : [];

	const { isTrusted, workspaceFolders = [] } = workspace;
	const excludes = isTrusted ? [] : workspaceFolders.map(f => path.normalize(f.uri.fsPath).replace(/[\r\n]+$/, ''));

	if (!isTrusted && pathHints.length !== 0) {
		// Filter out any non-absolute paths
		pathHints = pathHints.filter(p => path.isAbsolute(p));
	}

	const info = await findGit(pathHints, gitPath => {
		outputChannel.appendLine(localize('validating', "Validating found git in: {0}", gitPath));
		if (excludes.length === 0) {
			return true;
		}

		const normalized = path.normalize(gitPath).replace(/[\r\n]+$/, '');
		const skip = excludes.some(e => normalized.startsWith(e));
		if (skip) {
			outputChannel.appendLine(localize('skipped', "Skipped found git in: {0}", gitPath));
		}
		return !skip;
	});

	const askpass = await Askpass.create(outputChannel, context.storagePath);
	disposables.push(askpass);

	const environment = askpass.getEnv();
	disposables.push(registerTerminalEnvironmentManager(context, environment));


	const git = new Git({
		gitPath: info.path,
		userAgent: `git/${info.version} (${(os as any).version?.() ?? os.type()} ${os.release()}; ${os.platform()} ${os.arch()}) vscode/${vscodeVersion} (${env.appName})`,
		version: info.version,
		env: environment,
	});
	const model = new Model(git, askpass, context.globalState, outputChannel);
	disposables.push(model);

	const onRepository = () => commands.executeCommand('setContext', 'gitOpenRepositoryCount', `${model.repositories.length}`);
	model.onDidOpenRepository(onRepository, null, disposables);
	model.onDidCloseRepository(onRepository, null, disposables);
	onRepository();

	outputChannel.appendLine(localize('using git', "Using git {0} from {1}", info.version, info.path));

	const onOutput = (str: string) => {
		const lines = str.split(/\r?\n/mg);

		while (/^\s*$/.test(lines[lines.length - 1])) {
			lines.pop();
		}

		outputChannel.appendLine(lines.join('\n'));
	};
	git.onOutput.addListener('log', onOutput);
	disposables.push(toDisposable(() => git.onOutput.removeListener('log', onOutput)));

	const disposeCommands = registerCommands(model, git, outputChannel, telemetryReporter);
	disposables.push(
		disposeCommands,
		// TODO This is a really funky pattern that relies on side effects
		// Find a better way
		new GitFileSystemProvider(model),
		new GitDecorations(model),
		new GitProtocolHandler(),
		//new GitTimelineProvider(model, cc)
	);

	checkGitVersion(info);

	return model;
}

async function warnAboutMissingGit(): Promise<void> {
	const config = workspace.getConfiguration('git');
	const shouldIgnore = config.get<boolean>('ignoreMissingGitWarning') === true;

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

	const download = localize('downloadgit', "Download Git");
	const neverShowAgain = localize('neverShowAgain', "Don't Show Again");
	const choice = await window.showWarningMessage(
		localize('notfound', "Git not found. Install it or configure it using the 'git.path' setting."),
		download,
		neverShowAgain
	);

	if (choice === download) {
		commands.executeCommand('vscode.open', Uri.parse('https://git-scm.com/'));
	} else if (choice === neverShowAgain) {
		await config.update('ignoreMissingGitWarning', true, true);
	}
}

async function isGitRepository(folder: WorkspaceFolder): Promise<boolean> {
	if (folder.uri.scheme !== 'file') {
		return false;
	}

	const dotGit = path.join(folder.uri.fsPath, '.git');

	try {
		const dotGitStat = await new Promise<fs.Stats>((c, e) => fs.stat(dotGit, (err, stat) => err ? e(err) : c(stat)));
		return dotGitStat.isDirectory();
	} catch (err) {
		return false;
	}
}

async function checkGitVersion(info: IGit): Promise<void> {
	await checkGitv1(info);

	if (process.platform === 'win32') {
		await checkGitWindows(info);
	}
}

async function checkGitv1(info: IGit): Promise<void> {
	const config = workspace.getConfiguration('git');
	const shouldIgnore = config.get<boolean>('ignoreLegacyWarning') === true;

	if (shouldIgnore) {
		return;
	}

	if (!/^[01]/.test(info.version)) {
		return;
	}

	const update = localize('updateGit', "Update Git");
	const neverShowAgain = localize('neverShowAgain', "Don't Show Again");

	const choice = await window.showWarningMessage(
		localize('git20', "You seem to have git {0} installed. Code works best with git >= 2", info.version),
		update,
		neverShowAgain
	);

	if (choice === update) {
		commands.executeCommand('vscode.open', Uri.parse('https://git-scm.com/'));
	} else if (choice === neverShowAgain) {
		await config.update('ignoreLegacyWarning', true, true);
	}
}

async function checkGitWindows(info: IGit): Promise<void> {
	if (!/^2\.(25|26)\./.test(info.version)) {
		return;
	}

	const config = workspace.getConfiguration('git');
	const shouldIgnore = config.get<boolean>('ignoreWindowsGit27Warning') === true;

	if (shouldIgnore) {
		return;
	}

	const update = localize('updateGit', "Update Git");
	const neverShowAgain = localize('neverShowAgain', "Don't Show Again");
	const choice = await window.showWarningMessage(
		localize('git2526', "There are known issues with the installed Git {0}. Please update to Git >= 2.27 for the git features to work correctly.", info.version),
		update,
		neverShowAgain
	);

	if (choice === update) {
		commands.executeCommand('vscode.open', Uri.parse('https://git-scm.com/'));
	} else if (choice === neverShowAgain) {
		await config.update('ignoreWindowsGit27Warning', true, true);
	}
}
