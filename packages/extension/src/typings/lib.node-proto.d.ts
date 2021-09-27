declare module 'node:fs' {
	export * from 'fs';
}

declare module 'node:querystring' {
	export * from 'querystring';
}

declare module 'node:os' {
	export * from 'os';
}

declare module 'node:crypto' {
	export * from 'crypto';
}

declare module 'node:http' {
	export * from 'http';
}

declare module 'node:string_decoder' {
	export * from 'string_decoder';
}

declare module 'node:child_process' {
	export * from 'child_process';
}

declare module 'node:util' {
	export * from 'util';
}

declare module 'node:events' {
	import events = require('events');
	export = events;
}

declare module 'node:path' {
	import path = require('path');
	export = path;
}

declare module 'node:stream' {
	import stream = require('stream');
	export = stream;
}