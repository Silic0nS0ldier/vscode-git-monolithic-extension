import * as cp from "node:child_process";
import { IFileStatus, SpawnOptions } from "../git.js";
import { cpErrorHandler, getGitErrorCode, GitError } from "./error.js";

export async function getStatus(
	stream: (args: string[], options?: SpawnOptions) => cp.ChildProcess,
	opts?: { limit?: number, ignoreSubmodules?: boolean },
): Promise<{ status: IFileStatus[]; didHitLimit: boolean; }> {
	const parser = new GitStatusParser();
	const env = { GIT_OPTIONAL_LOCKS: '0' };
	// TODO Seperate lookup of untracked files (which is super slow)
	// -uno (no untracked)
	const args = ['status', '-z', '-u'];

	if (opts?.ignoreSubmodules) {
		args.push('--ignore-submodules');
	}

	const child = stream(args, { env });
	child.stdout?.setEncoding('utf8');
	child.stderr?.setEncoding('utf8');

	const stderrData: string[] = [];
	child.stderr?.on('data', raw => stderrData.push(raw as string));
	const limit = opts?.limit ?? 5000;

	return await new Promise((c, e) => {
		child.on('error', cpErrorHandler(e));

		const onExit = (exitCode: number) => {
			if (exitCode !== 0) {
				const stderr = stderrData.join('');
				// TODO Ensure this propagates to child.on('error', ...)
				throw new GitError({
					message: 'Failed to execute git',
					stderr,
					exitCode,
					gitErrorCode: getGitErrorCode(stderr),
					gitCommand: 'status',
					gitArgs: args
				});
			}

			c({ status: parser.status, didHitLimit: false });
		};
		child.on('exit', onExit);

		const onStdoutData = (raw: string) => {
			parser.update(raw);

			if (parser.status.length > limit) {
				child.removeListener('exit', onExit);
				child.stdout?.removeListener('data', onStdoutData);
				child.kill();

				c({ status: parser.status.slice(0, limit), didHitLimit: true });
			}
		};
		child.stdout?.on('data', onStdoutData);
	});
}

class GitStatusParser {

	private lastRaw = '';
	private result: IFileStatus[] = [];

	get status(): IFileStatus[] {
		return this.result;
	}

	update(raw: string): void {
		let i = 0;
		let nextI: number | undefined;

		raw = this.lastRaw + raw;

		while ((nextI = this.parseEntry(raw, i)) !== undefined) {
			i = nextI;
		}

		this.lastRaw = raw.substr(i);
	}

	private parseEntry(raw: string, i: number): number | undefined {
		if (i + 4 >= raw.length) {
			return;
		}

		let lastIndex: number;
		const entry: IFileStatus = {
			x: raw.charAt(i++),
			y: raw.charAt(i++),
			rename: undefined,
			path: ''
		};

		// space
		i++;

		if (entry.x === 'R' || entry.x === 'C') {
			lastIndex = raw.indexOf('\0', i);

			if (lastIndex === -1) {
				return;
			}

			entry.rename = raw.substring(i, lastIndex);
			i = lastIndex + 1;
		}

		lastIndex = raw.indexOf('\0', i);

		if (lastIndex === -1) {
			return;
		}

		entry.path = raw.substring(i, lastIndex);

		// If path ends with slash, it must be a nested git repo
		if (entry.path[entry.path.length - 1] !== '/') {
			this.result.push(entry);
		}

		return lastIndex + 1;
	}
}
