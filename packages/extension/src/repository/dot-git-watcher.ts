import path from 'node:path';
import { Disposable, Event, EventEmitter, OutputChannel, Uri } from 'vscode';
import { Log, LogLevel } from '../log.js';
import { Repository } from '../repository.js';
import { anyEvent } from '../util.js';
import { watch } from '../watch.js';

// TODO This may destroy transient watchers which don't need to be
function updateTransientWatchers(
	repository: Repository,
	emitter: EventEmitter<Uri>,
	outputChannel: OutputChannel,
): Disposable {
	const disposables: Disposable[] = [];

	if (!repository.HEAD?.upstream) {
		return Disposable.from();
	}

	const { name, remote } = repository.HEAD.upstream;
	const upstreamPath = path.join(repository.dotGit, 'refs', 'remotes', remote, name);

	try {
		const upstreamWatcher = watch([upstreamPath], [], outputChannel);
		disposables.push(upstreamWatcher);
		upstreamWatcher.event(emitter.fire, emitter, disposables);
	} catch (err) {
		if (Log.logLevel <= LogLevel.Error) {
			outputChannel.appendLine(`Warning: Failed to watch ref '${upstreamPath}', is most likely packed.`);
		}
	}

	return Disposable.from(...disposables);
}

export function createDotGitWatcher(
	repository: Repository,
	outputChannel: OutputChannel,
): { event: Event<Uri> } & Disposable {
	const emitter = new EventEmitter<Uri>();

	// Watch specific files for meaningful git events
	// This is a lot more efficient then watching everything, and avoids workarounds for aids like watchman as an fsmonitor
	const rootWatcher = watch(
		[
			// Where we are
			path.join(repository.dotGit, 'HEAD'),
			// What we are tracking
			path.join(repository.dotGit, 'index'),
			// Graph of what we know
			path.join(repository.dotGit, 'refs'),
			// Current commit message
			path.join(repository.dotGit, 'COMMIT_EDITMSG'),
			// How we do things
			path.join(repository.dotGit, 'config'),
		],
		// Don't propagate events if index being modified
		[path.join(repository.dotGit, 'index.lock')],
		outputChannel,
	);

	let transientDisposable: Disposable = updateTransientWatchers(repository, emitter, outputChannel);;

	const onDidRunGitStatusDisposable = repository.onDidRunGitStatus(
		() => {
			transientDisposable.dispose();
			transientDisposable = updateTransientWatchers(repository, emitter, outputChannel)
		},
	);

	const disposable = Disposable.from(
		emitter,
		rootWatcher,
		onDidRunGitStatusDisposable,
		{ dispose: () => transientDisposable.dispose() },
	);

	return {
		event: anyEvent(rootWatcher.event, emitter.event),
		dispose: () => disposable.dispose(),
	}
}
