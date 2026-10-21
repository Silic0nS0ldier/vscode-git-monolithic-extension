# monolithic-vscode-manifest

Models a VSCode extension manifest (`package.json`), its `package.nls.json` string table, and the command
registrations and references in the extension's TypeScript source, then checks that they agree.

Everything is text in, data out, and unparsable input becomes a `parse-error` diagnostic rather than an exception.
Parsing uses the TypeScript 7.1 API (`typescript/sync` + `typescript/ast`), which runs the compiler out of process: the
`parse*`/`scanSource` functions take an `API` instance, and `checkProject` creates (and disposes) one itself.
Every declaration, reference and diagnostic carries a `Location` (file, UTF-16 offsets, 1-based line/column), so
the same model can later back editor features such as go-to-definition, hover and completion for the manifest.

| Module     | Purpose                                                                            |
| ---------- | ---------------------------------------------------------------------------------- |
| `manifest` | `parseManifest` — commands, menu items, keybindings, submenus, `%key%` uses.       |
| `nls`      | `parseNls` — string table entries.                                                 |
| `sources`  | `scanSource` — `registerCommand`/id-factory registrations, `executeCommand` etc.   |
| `check`    | `check`/`checkProject` — diagnostics; `formatDiagnostic` for `file:line:col` text. |
| `json`     | JSON tree with locations (TypeScript's JSON parser).                               |
| `location` | `Location` and offset → line/column conversion.                                    |

Source scanning only understands string literals; ids built at runtime are invisible to it.
