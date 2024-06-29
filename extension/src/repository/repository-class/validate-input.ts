export {};
// import { workspace } from "vscode";
// import { localize } from "../../util.js";

// export function validateInput(text: string, position: number): SourceControlInputBoxValidation | undefined {
//     if (this.rebaseCommit) {
//         if (this.rebaseCommit.message !== text) {
//             return {
//                 message: localize(
//                     "commit in rebase",
//                     "It's not possible to change the commit message in the middle of a rebase. Please complete the rebase operation and use interactive rebase instead.",
//                 ),
//                 type: SourceControlInputBoxValidationType.Warning,
//             };
//         }
//     }

//     const config = workspace.getConfiguration("git");
//     const setting = config.get<"always" | "warn" | "off">("inputValidation");

//     if (setting === "off") {
//         return;
//     }

//     if (/^\s+$/.test(text)) {
//         return {
//             message: localize(
//                 "commitMessageWhitespacesOnlyWarning",
//                 "Current commit message only contains whitespace characters",
//             ),
//             type: SourceControlInputBoxValidationType.Warning,
//         };
//     }

//     let lineNumber = 0;
//     let start = 0, end;
//     let match: RegExpExecArray | null;
//     const regex = /\r?\n/g;

//     while ((match = regex.exec(text)) && position > match.index) {
//         start = match.index + match[0].length;
//         lineNumber++;
//     }

//     end = match ? match.index : text.length;

//     const line = text.substring(start, end);

//     let threshold = config.get<number>("inputValidationLength", 50);

//     if (lineNumber === 0) {
//         const inputValidationSubjectLength = config.get<number | null>("inputValidationSubjectLength", null);

//         if (inputValidationSubjectLength !== null) {
//             threshold = inputValidationSubjectLength;
//         }
//     }

//     if (line.length <= threshold) {
//         if (setting !== "always") {
//             return;
//         }

//         return {
//             message: localize("commitMessageCountdown", "{0} characters left in current line", threshold - line.length),
//             type: SourceControlInputBoxValidationType.Information,
//         };
//     } else {
//         return {
//             message: localize(
//                 "commitMessageWarning",
//                 "{0} characters over {1} in current line",
//                 line.length - threshold,
//                 threshold,
//             ),
//             type: SourceControlInputBoxValidationType.Warning,
//         };
//     }
// }
