/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Disposable, OutputChannel, Uri, workspace, TextDocumentContentProvider } from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { Git } from './git.js';
import { Model } from './model.js';
import { registerCommands } from './commands/register.js';
import { createCommand } from './commands/create.js';


export interface ScmCommandOptions {
	repository?: boolean;
	diff?: boolean;
}

export interface ScmCommand {
	commandId: string;
	method: Function;
	options: ScmCommandOptions;
}

export class CommandErrorOutputTextDocumentContentProvider implements TextDocumentContentProvider {

	private items = new Map<string, string>();

	set(uri: Uri, contents: string): void {
		this.items.set(uri.path, contents);
	}

	delete(uri: Uri): void {
		this.items.delete(uri.path);
	}

	provideTextDocumentContent(uri: Uri): string | undefined {
		return this.items.get(uri.path);
	}
}

export function createCommands(
	git: Git,
	model: Model,
	outputChannel: OutputChannel,
	telemetryReporter: TelemetryReporter
): Disposable {
	const cmds = registerCommands(
		model,
		git,
		outputChannel,
		telemetryReporter,
	);

	const commandErrors = new CommandErrorOutputTextDocumentContentProvider();

	const disposables = cmds.map(({ commandId, method, options }) => {
		const command = createCommand(
			model,
			telemetryReporter,
			outputChannel,
			commandErrors,
			commandId,
			method,
			options,
		);

		// if (options.diff) {
		// 	return commands.registerDiffInformationCommand(commandId, command);
		// } else {
		// 	return commands.registerCommand(commandId, command);
		// }
		return commands.registerCommand(commandId, command);
	});

	disposables.push(workspace.registerTextDocumentContentProvider('git-output', commandErrors));

	return Disposable.from(...disposables);
}
