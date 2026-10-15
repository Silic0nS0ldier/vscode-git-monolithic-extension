export type { Backend, BackendError, RawEvent } from "./backend/mod.js";
export { createNodeBackend } from "./backend/node.js";
export { gitignore, type GitignoreOptions } from "./ignore/gitignore.js";
export {
    type DirectoryVisit,
    ignoreAll,
    ignoreNothing,
    ignorePaths,
    type Ignorer,
    type IgnoreScope,
} from "./ignore/mod.js";
export {
    type AbsolutePath,
    absolutePath,
    type Brand,
    type EntryKind,
    type FileName,
    fileName,
    join,
    type PathError,
    type RelativePath,
} from "./path.js";
export type { ChangeSet } from "./watch/changes.js";
export {
    type CloseReason,
    watch,
    type Watcher,
    type WatchError,
    type WatcherState,
    type WatchEvent,
    type WatchOptions,
    type WatchSetupError,
} from "./watch/mod.js";
