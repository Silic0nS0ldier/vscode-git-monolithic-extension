import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Uri } from "vscode";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsRootPath = path.join(__dirname, "../../resources/icons");

export function getIconUri(iconName: string, theme: string): Uri {
    return Uri.file(path.join(iconsRootPath, theme, `${iconName}.svg`));
}
