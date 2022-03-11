import type { GitContext } from "../../cli/context.js";
import { ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, ok, Result, unwrap } from "../../func-result.js";
import { isWindows } from "../../helpers/platform-matchers.js";
import { trySemverCheck } from "../version/mod.js";

type ShowToplevelServices = {
    os: {
        platform: string;
    };
};

export async function showToplevel(
    git: GitContext,
    cwd: string,
    services: ShowToplevelServices,
): Promise<Result<string, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, ["rev-parse", "--show-toplevel"]);

    if (isErr(result)) {
        return result;
    }

    // Keep trailing spaces which are part of the directory name
    const repoRoot = unwrap(result).trimLeft().replace(/[\r\n]+$/, "");

    if (isWindows(services.os.platform) && trySemverCheck(git.version, ">=2.25")) {
        // On Git 2.25+ if you call `rev-parse --show-toplevel` on a mapped drive, instead of getting the mapped drive path back, you get the UNC path for the mapped drive.
        // So we will try to normalize it back to the mapped drive path, if possible
        return err(createError(ERROR_GENERIC, "Handling for Git >=2.25 on Windows not implemented."));
        // const repoUri = Uri.file(repoPath);
        // const pathUri = Uri.file(repositoryPath);
        // if (repoUri.authority.length !== 0 && pathUri.authority.length === 0) {
        //     let match = /(?<=^\/?)([a-zA-Z])(?=:\/)/.exec(pathUri.path);
        //     if (match !== null) {
        //         const [, letter] = match;

        //         try {
        //             const networkPath = await new Promise<string | undefined>(resolve =>
        //                 realpath.native(
        //                     `${letter}:\\`,
        //                     { encoding: "utf8" },
        //                     (err, resolvedPath) => resolve(err !== null ? undefined : resolvedPath),
        //                 )
        //             );
        //             if (networkPath !== undefined) {
        //                 return path.normalize(
        //                     repoUri.fsPath.replace(
        //                         networkPath,
        //                         `${letter.toLowerCase()}:${networkPath.endsWith("\\") ? "\\" : ""}`,
        //                     ),
        //                 );
        //             }
        //         } catch {}
        //     }

        //     return path.normalize(pathUri.fsPath);
        // }
    }

    return ok(repoRoot);
}
