// Lists who uses each repository member and git-layer method, resolved with the type checker.
// Run with --help for usage.

import { createRequire } from "node:module";
import * as path from "node:path";
import { parseArgs } from "node:util";

const SCRIPT = ".github/skills/shrink-extension-core/scripts/repository-callers.mjs";

const USAGE = `Usage: node ${SCRIPT} [options]

Lists the users of each member of the repository object (AbstractRepository) and of each public method of the
git-layer Repository class in extension/src/git.ts, resolved with the type checker rather than by name. Users under
extension/src/commands/implementations/ and extension/src/repository/operations/ are counted as prunable; any other
user is listed by its path relative to extension/src, and makes the member core.

Needs the workspace's npm dependencies (pnpm install), for typescript.

Options:
  --member <name>  Report only this member or method. Repeatable.
  --files          Also list the prunable users of each.
  --json           Print one JSON object to stdout instead of text.
  -h, --help       Show this help.

Exit codes:
  0  listed
  2  usage error, such as an unknown option or member

Examples:
  node ${SCRIPT} --member move --files
  node ${SCRIPT} --json
`;

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const SRC = path.join(ROOT, "extension/src") + path.sep;
const ABSTRACT = path.join(SRC, "repository/repository-class/AbstractRepository.ts");
const GIT = path.join(SRC, "git.ts");
/** Modules only bundled with a command that uses them; see ../SKILL.md. */
const PRUNABLE = ["commands/implementations/", "repository/operations/"];
const isPrunable = file => PRUNABLE.some(prefix => file.startsWith(prefix));

/** Exits with 2. */
class UsageError extends Error {}

function parse() {
    try {
        return parseArgs({
            options: {
                member: { type: "string", multiple: true, default: [] },
                files: { type: "boolean", default: false },
                json: { type: "boolean", default: false },
                help: { type: "boolean", short: "h", default: false },
            },
        }).values;
    } catch (error) {
        throw new UsageError(`${error.message}\nRun with --help for usage.`);
    }
}

// The build type-checks with TypeScript 7 (`@typescript/native`); the workspace's `typescript` package, the only one
// with this API, is 6, whose lib lacks what the extension uses from newer ones.
const LIB_SHIM = `interface IteratorConstructor {
    zip(iterables: any, options?: any): IteratorObject<any[]>;
}
`;

function analyse() {
    const ts = createRequire(path.join(ROOT, "package.json"))("typescript");
    const config = ts.getParsedCommandLineOfConfigFile(path.join(ROOT, "extension/tsconfig.json"), {}, {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: diagnostic => {
            throw new UsageError(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
        },
    });
    const isSource = file => file.startsWith(SRC) && !/\.(test|stub)\.ts$/.test(file);
    const shim = path.join(SRC, "__lib-shim__.d.ts");
    const host = ts.createCompilerHost(config.options);
    const { fileExists, getSourceFile } = host;
    host.fileExists = file => file === shim || fileExists.call(host, file);
    host.getSourceFile = (file, ...rest) =>
        file === shim
            ? ts.createSourceFile(file, LIB_SHIM, ts.ScriptTarget.Latest)
            : getSourceFile.call(host, file, ...rest);
    const program = ts.createProgram([...config.fileNames.filter(isSource), shim], config.options, host);
    const checker = program.getTypeChecker();
    const typeErrors = ts.getPreEmitDiagnostics(program)
        .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
        .map(diagnostic => {
            const where = diagnostic.file
                ? `${path.relative(ROOT, diagnostic.file.fileName)}:`
                    + (diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1)
                : "(global)";
            return `${where} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
        });

    const users = { abstract: new Map(), git: new Map() };
    const record = (kind, name, file) => {
        if (!users[kind].has(name)) {
            users[kind].set(name, new Set());
        }
        users[kind].get(name).add(file.slice(SRC.length));
    };

    for (const sourceFile of program.getSourceFiles()) {
        if (!isSource(sourceFile.fileName)) {
            continue;
        }
        const visit = node => {
            if (ts.isPropertyAccessExpression(node)) {
                for (const declaration of checker.getSymbolAtLocation(node.name)?.declarations ?? []) {
                    const declaredIn = declaration.getSourceFile().fileName;
                    if (declaredIn === ABSTRACT && sourceFile.fileName !== ABSTRACT) {
                        record("abstract", node.name.text, sourceFile.fileName);
                    }
                    const owner = declaredIn === GIT ? ts.findAncestor(declaration, ts.isClassDeclaration) : undefined;
                    // Calls the class makes on itself say nothing about who needs the method.
                    if (owner?.name?.text === "Repository" && !ts.findAncestor(node, n => n === owner)) {
                        record("git", node.name.text, sourceFile.fileName);
                    }
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
    }

    const alias = program.getSourceFile(ABSTRACT).statements.find(statement =>
        ts.isTypeAliasDeclaration(statement) && statement.name.text === "AbstractRepository"
    );
    const literal = ts.isIntersectionTypeNode(alias.type) ? alias.type.types[0] : alias.type;
    // `__type` is the brand `isAbstractRepository` reads after an `in` check, which the checker does not attribute.
    const abstractMembers = literal.members
        .filter(member => member.name && member.name.getText() !== "__type")
        .map(member => member.name.getText());
    const gitClass = program.getSourceFile(GIT).statements.find(statement =>
        ts.isClassDeclaration(statement) && statement.name?.text === "Repository"
    );
    const gitMethods = gitClass.members
        .filter(member => member.name && !ts.isPrivateIdentifier(member.name) && !ts.isConstructorDeclaration(member))
        .map(member => member.name.getText());

    const rows = (kind, names) =>
        [...names].sort().map(name => {
            const files = [...(users[kind].get(name) ?? [])].sort();
            return { name, prunable: files.filter(isPrunable), core: files.filter(file => !isPrunable(file)) };
        });
    return {
        typeErrors,
        abstractRepository: rows("abstract", abstractMembers),
        gitRepository: rows("git", gitMethods),
    };
}

function filter(result, members) {
    if (members.length === 0) {
        return result;
    }
    const known = [...result.abstractRepository, ...result.gitRepository].map(row => row.name);
    for (const member of members) {
        if (!known.includes(member)) {
            const close = [...new Set(known)].filter(name => name.toLowerCase().includes(member.toLowerCase()));
            throw new UsageError(
                `"${member}" is neither a member of AbstractRepository nor a method of the git-layer Repository; it `
                    + "may already have moved to extension/src/repository/operations/."
                    + (close.length ? ` Did you mean: ${close.slice(0, 5).join(", ")}?` : ""),
            );
        }
    }
    const keep = row => members.includes(row.name);
    return {
        ...result,
        abstractRepository: result.abstractRepository.filter(keep),
        gitRepository: result.gitRepository.filter(keep),
    };
}

function printTable(title, rows, whenUnused, files) {
    if (rows.length === 0) {
        return;
    }
    console.log(`${title}\n  ${"name".padEnd(26)} prunable  core users`);
    for (const { name, prunable, core } of rows) {
        const coreText = prunable.length + core.length === 0 ? whenUnused : core.join(", ") || "-";
        console.log(`  ${name.padEnd(26)} ${String(prunable.length).padStart(8)}  ${coreText}`);
        if (files) {
            for (const file of prunable) {
                console.log(`  ${"".padEnd(37)}${file}`);
            }
        }
    }
}

function main() {
    const args = parse();
    if (args.help) {
        process.stdout.write(USAGE);
        return 0;
    }
    const result = filter(analyse(), args.member);
    if (result.typeErrors.length > 0) {
        const count = result.typeErrors.length;
        console.error(
            `warning: ${count} type error${count === 1 ? "" : "s"}, so some users may be missing. Fix them, or check `
                + `they come from TypeScript 6 (used here) lacking something the build's TypeScript 7 has:\n  `
                + result.typeErrors.slice(0, 3).join("\n  "),
        );
    }
    if (args.json) {
        console.log(JSON.stringify(result, null, 2));
        return 0;
    }
    printTable(
        `AbstractRepository members (${path.relative(ROOT, ABSTRACT)}); paths are relative to extension/src`,
        result.abstractRepository,
        "UNUSED",
        args.files,
    );
    if (result.abstractRepository.length && result.gitRepository.length) {
        console.log();
    }
    printTable(
        `git-layer Repository methods (${path.relative(ROOT, GIT)}); paths are relative to extension/src`,
        result.gitRepository,
        "(only the class itself)",
        args.files,
    );
    return 0;
}

try {
    process.exitCode = main();
} catch (error) {
    if (!(error instanceof UsageError)) {
        throw error;
    }
    console.error(`error: ${error.message}`);
    process.exitCode = 2;
}
