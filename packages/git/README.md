# Monolithic Git Interop

An interop for JS to enable scalable Git interactions. This relies on the Git CLI.

## Usage

This library heavily leans into type safety, managed error handling, and function purity. This means usage typically involves more boilerplate, but produces a more reliable result.

e.g. to create the `GitContext` which all logic is built around;

```ts
import { fromEnvironment } from "monolithic-git-interop/cli";
import { createServices } from "monolithic-git-interop/services/nodejs";
import { isOk, unwrap } from "monolithic-git-interop/util/result";

const res = await fromEnvironment(process.env, {
    env: undefined,
    // in milliseconds
    timeout: 30_000,
}, createServices());
if (isOk(res)) {
    const context = unwrap(res);
    // Down to business...
}
```

Taking services as an input like this makes testing a lot easier, but helps to decouple the library from NodeJS. In theory, this library can be used in any modern JS runtime (Deno, evergreen browsers, Electron). With polyfills and downlevel compilation it should be possible to run with this fairly far.

Now lets try something simple. Lets get the git version!

```ts
import { version } from "monolithic-git-interop/api/version";
import { isOk, unwrap } from "monolithic-git-interop/util/result";

const res = await version(context);
if (isOk(res)) {
    console.log(`Git Version is ${unwrap(res)}`);
}
```

Of course, we technically already have it via `context.version`. That said, getting a fresh copy may prove useful in environments where `git` can be updated during application lifetime.

Not everything under `monolithic-git-interop/api/*` is so simple to consume, with usage patterns varying according to command behaviour and output. See API docs for examples.

## API

TODO

## Origins

This package was created to power git interactions within the Monolithic Git extension for VSCode.
