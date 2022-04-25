/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from "node:path";
import updateGrammar from "vscode-grammar-updater";
import { extensionPkg } from "./util/paths.js";

// vscode-grammer-updater assumes it is running in target package
process.chdir(extensionPkg);

updateGrammar.update(
    "textmate/git.tmbundle",
    "Syntaxes/Git%20Commit%20Message.tmLanguage",
    path.join(extensionPkg, "syntaxes/git-commit.tmLanguage.json"),
);
updateGrammar.update(
    "textmate/git.tmbundle",
    "Syntaxes/Git%20Rebase%20Message.tmLanguage",
    path.join(extensionPkg, "syntaxes/git-rebase.tmLanguage.json"),
);
updateGrammar.update(
    "textmate/diff.tmbundle",
    "Syntaxes/Diff.plist",
    path.join(extensionPkg, "syntaxes/diff.tmLanguage.json"),
);

console.log("NOTE It is normal for this to exit with a cannot get version error.");
