// Lists who uses each member of the repository object (`AbstractRepository`) and each public method of the git-layer
// `Repository` class in extension/src/git.ts, resolved with the type checker rather than by name. See ../SKILL.md.
//
// Usage: node .github/skills/shrink-extension-core/scripts/repository-callers.mjs [--files]
//   --files   Also list the command modules using each member, not just how many there are.
//
// Needs the workspace's npm dependencies installed (`pnpm install`), for `typescript` and the extension's types.

import { createRequire } from "node:module";
import * as path from "node:path";
import { parseArgs } from "node:util";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const SRC = path.join(ROOT, "extension/src") + path.sep;
const ABSTRACT = path.join(SRC, "repository/repository-class/AbstractRepository.ts");
const GIT = path.join(SRC, "git.ts");
const COMMANDS = "commands/implementations/";

const { values: args } = parseArgs({ options: { files: { type: "boolean", default: false } } });
const ts = createRequire(path.join(ROOT, "package.json"))("typescript");

const config = ts.getParsedCommandLineOfConfigFile(path.join(ROOT, "extension/tsconfig.json"), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: diagnostic => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
});
const isSource = file => file.startsWith(SRC) && !/\.(test|stub)\.ts$/.test(file);
const program = ts.createProgram(config.fileNames.filter(isSource), config.options);
const checker = program.getTypeChecker();

const users = { abstract: new Map(), git: new Map() };
function record(kind, name, file) {
    if (!users[kind].has(name)) {
        users[kind].set(name, new Set());
    }
    users[kind].get(name).add(file.slice(SRC.length));
}

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
// `__type` is the brand `isAbstractRepository` reads after an `in` check, which the checker does not attribute here.
const abstractMembers = literal.members
    .filter(member => member.name && member.name.getText() !== "__type")
    .map(member => member.name.getText());

const gitClass = program.getSourceFile(GIT).statements.find(statement =>
    ts.isClassDeclaration(statement) && statement.name?.text === "Repository"
);
const gitMethods = gitClass.members
    .filter(member => member.name && !ts.isPrivateIdentifier(member.name) && !ts.isConstructorDeclaration(member))
    .map(member => member.name.getText());

function report(title, kind, names, whenNone) {
    console.log(`${title}\n  ${"name".padEnd(26)} commands  other users (paths relative to extension/src)`);
    for (const name of [...names].sort()) {
        const files = [...(users[kind].get(name) ?? [])].sort();
        const commands = files.filter(file => file.startsWith(COMMANDS));
        const others = files.filter(file => !file.startsWith(COMMANDS));
        const otherText = files.length === 0 ? whenNone : others.join(", ") || "-";
        console.log(`  ${name.padEnd(26)} ${String(commands.length).padStart(8)}  ${otherText}`);
        if (args.files) {
            for (const file of commands) {
                console.log(`  ${"".padEnd(37)}${file}`);
            }
        }
    }
}

report(`AbstractRepository members (${path.relative(ROOT, ABSTRACT)})`, "abstract", abstractMembers, "UNUSED");
console.log();
report(`git-layer Repository methods (${path.relative(ROOT, GIT)})`, "git", gitMethods, "(only the class itself)");
