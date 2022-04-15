import { parseIgnoreCheck } from "monolithic-git-interop/api/repository/ignore/check/parser";
import { GitErrorCodes } from "../../api/git.js";
import type { Repository } from "../../git.js";
import { GitError } from "../../git/error.js";
import { isDescendant } from "../../util/paths.js";
import { Operation } from "../Operations.js";
import type { RunFn } from "./run.js";

export function checkIgnore(
    run: RunFn<Set<string>>,
    repoRoot: string,
    repository: Repository,
    filePaths: string[],
): Promise<Set<string>> {
    return run(Operation.CheckIgnore, () => {
        return new Promise<Set<string>>((resolve, reject) => {
            const filteredFilePaths = filePaths
                .filter(filePath => isDescendant(repoRoot, filePath));

            if (filteredFilePaths.length === 0) {
                // nothing left
                return resolve(new Set<string>());
            }

            // https://git-scm.com/docs/git-check-ignore#git-check-ignore--z
            const child = repository.stream(["check-ignore", "-v", "-z", "--stdin"], {
                stdio: [null, null, null],
            });
            child.stdin!.end(filteredFilePaths.join("\0"), "utf8");

            const onExit = (exitCode: number) => {
                if (exitCode === 1) {
                    // nothing ignored
                    resolve(new Set<string>());
                } else if (exitCode === 0) {
                    resolve(new Set<string>(parseIgnoreCheck(data)));
                } else {
                    if (/ is in submodule /.test(stderr)) {
                        reject(
                            new GitError({
                                exitCode,
                                gitErrorCode: GitErrorCodes.IsInSubmodule,
                                stderr,
                                stdout: data,
                            }),
                        );
                    } else {
                        reject(
                            new GitError({
                                exitCode,
                                stderr,
                                stdout: data,
                            }),
                        );
                    }
                }
            };

            let data = "";
            const onStdoutData = (raw: string) => {
                data += raw;
            };

            child.stdout!.setEncoding("utf8");
            child.stdout!.on("data", onStdoutData);

            let stderr: string = "";
            child.stderr!.setEncoding("utf8");
            child.stderr!.on("data", raw => stderr += raw);

            child.on("error", reject);
            child.on("exit", onExit);
        });
    });
}
