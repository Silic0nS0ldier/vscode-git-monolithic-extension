import { Uri, workspace } from "vscode";

export function createEmojifier(extensionUri: Uri): (message: string) => Promise<string> {
    let loading: Promise<Record<string, string>> | undefined;
    async function load(): Promise<Record<string, string>> {
        const bytes = await workspace.fs.readFile(Uri.joinPath(extensionUri, "resources", "emojis.json"));
        const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (
            !parsed || typeof parsed !== "object" || Array.isArray(parsed)
            || Object.values(parsed).some(value => typeof value !== "string")
        ) {
            throw new Error("Invalid bundled emoji mapping");
        }
        return Object.fromEntries(Object.entries(parsed));
    }
    return async message => {
        loading ??= load();
        const emojis = await loading;
        return message.replace(/:([-+_a-z0-9]+):/gu, (original, code: string) => emojis[code] ?? original);
    };
}
