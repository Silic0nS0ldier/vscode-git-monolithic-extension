declare module 'node:fs' {
	export * from 'fs';
}

declare module 'node:child_process' {
	export * from 'child_process';
}

declare module 'node:path' {
	import path = require('path');
	export = path;
}

declare module 'node:assert' {
	import assert = require('assert');
	export = assert;
}

declare module 'node:events' {
	import events = require('events');
	export = events;
}

declare module 'node:stream' {
	import stream = require('stream');
	export = stream;
}