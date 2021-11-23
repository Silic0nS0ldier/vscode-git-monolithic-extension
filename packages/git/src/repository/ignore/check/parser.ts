// Parses output of `git check-ignore -v -z` and returns only those paths
// that are actually ignored by git.
// Matches to a negative pattern (starting with '!') are filtered out.
// See also https://git-scm.com/docs/git-check-ignore#_output.
export function parseIgnoreCheck(raw: string): string[] {
	const ignored = [];
	const elements = raw.split('\0');
	for (let i = 0; i < elements.length; i += 4) {
		const pattern = elements[i + 2];
		const path = elements[i + 3];
		if (pattern && !pattern.startsWith('!')) {
			ignored.push(path);
		}
	}
	return ignored;
}