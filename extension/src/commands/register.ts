import { commands, Disposable, type OutputChannel, workspace } from "vscode";
import type { Git } from "../git.js";
import type { Model } from "../model.js";
import type { CommandName } from "./command-names.gen.js";
import { createCommand } from "./create.js";
import { CommandErrorOutputTextDocumentContentProvider, type ScmCommand } from "./helpers.js";
import { pruned } from "./pruned.js";
import * as selected from "./selection.gen.js";

import type { TelemetryReporter } from "@vscode/extension-telemetry";
import * as branch from "./implementations/branch/mod.js";
import * as checkout from "./implementations/checkout/mod.js";
import * as cherryPick from "./implementations/cherry-pick.js";
import * as clean from "./implementations/clean/mod.js";
import * as clone from "./implementations/clone/mod.js";
import * as close from "./implementations/close.js";
import * as commit from "./implementations/commit/mod.js";
import * as fetch from "./implementations/fetch/mod.js";
import * as ignore from "./implementations/ignore.js";
import * as init from "./implementations/init.js";
import * as merge from "./implementations/merge.js";
import * as open from "./implementations/open/mod.js";
import * as publish from "./implementations/publish/publish.js";
import * as pull from "./implementations/pull/mod.js";
import * as push from "./implementations/push/mod.js";
import * as rebase from "./implementations/rebase/mod.js";
import * as refresh from "./implementations/refresh.js";
import * as remote from "./implementations/remote/mod.js";
import * as rename from "./implementations/rename.js";
import * as revealInExplorer from "./implementations/reveal-in-explorer.js";
import * as setLogLevel from "./implementations/set-log-level.js";
import * as stage from "./implementations/stage/mod.js";
import * as stash from "./implementations/stash/mod.js";
import * as sync from "./implementations/sync/mod.js";
import * as tag from "./implementations/tag/mod.js";
import * as undoCommit from "./implementations/undo-commit.js";
import * as unstage from "./implementations/unstage/mod.js";

/** Commands registered outside `registerCommands`, e.g. because they must work before Git is found. */
type RegisteredElsewhere = "showOutput";

type NameOf<C> = C extends ScmCommand<infer N> ? N : never;
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type Unregistered<C> = Exclude<CommandName, NameOf<C> | RegisteredElsewhere>;
/** Factories typed with several names (e.g. a `ScmCommand<CommandName>[]` annotation) would hide missing ones. */
type Widened<C> = C extends unknown ? (true extends IsUnion<NameOf<C>> ? C : never) : never;

/**
 * Fails to compile, naming the commands, unless every command declared in the manifest is in `cmds` with its own
 * literal name.
 */
function allCommands<C extends ScmCommand<CommandName>>(
    cmds:
        & C[]
        & ([Unregistered<C>] extends [never] ? unknown : { missingCommands: Unregistered<C> })
        & ([Widened<C>] extends [never] ? unknown : { widenedCommands: Widened<C> }),
): ScmCommand<CommandName>[] {
    return cmds;
}

export function registerCommands(
    model: Model,
    git: Git,
    outputChannel: OutputChannel,
    telemetryReporter: TelemetryReporter,
): Disposable {
    const cmds = allCommands([
        ...branch.createCommands(),
        ...checkout.createCommands(),
        selected.cherryPick ? cherryPick.createCommand() : pruned("cherryPick"),
        ...clean.createCommands(model, outputChannel),
        ...clone.createCommands(telemetryReporter, git),
        selected.close ? close.createCommand(model) : pruned("close"),
        ...commit.createCommands(),
        ...fetch.createCommands(),
        selected.ignore ? ignore.createCommand(model, outputChannel) : pruned("ignore"),
        selected.init ? init.createCommand(git, model) : pruned("init"),
        selected.merge ? merge.createCommand() : pruned("merge"),
        ...open.createCommands(model, outputChannel),
        selected.publish ? publish.createCommand() : pruned("publish"),
        ...pull.createCommands(),
        ...push.createCommands(),
        ...rebase.createCommands(),
        selected.refresh ? refresh.createCommand() : pruned("refresh"),
        ...remote.createCommands(),
        selected.rename ? rename.createCommand() : pruned("rename"),
        selected.revealInExplorer ? revealInExplorer.createCommand() : pruned("revealInExplorer"),
        selected.setLogLevel ? setLogLevel.createCommand(outputChannel) : pruned("setLogLevel"),
        ...stage.createCommands(model, outputChannel),
        ...stash.createCommands(),
        ...sync.createCommands(),
        ...tag.createCommands(),
        selected.undoCommit ? undoCommit.createCommand() : pruned("undoCommit"),
        ...unstage.createCommands(model, outputChannel),
    ]);

    const commandErrors = new CommandErrorOutputTextDocumentContentProvider();

    const disposables: Disposable[] = [];

    try {
        for (const { commandId, method, options } of cmds) {
            const command = createCommand(
                model,
                telemetryReporter,
                outputChannel,
                commandErrors,
                commandId,
                method,
                options,
            );

            disposables.push(commands.registerCommand(commandId, command));
        }

        disposables.push(workspace.registerTextDocumentContentProvider("gitm-output", commandErrors));
    } catch (err) {
        // Cleanup: dispose all successfully registered commands before re-throwing
        Disposable.from(...disposables).dispose();
        throw err;
    }

    return Disposable.from(...disposables);
}
