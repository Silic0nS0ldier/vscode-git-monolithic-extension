import { ConfigurationScope, Uri, workspace, WorkspaceConfiguration } from "vscode";

function getConfig(): WorkspaceConfiguration {
    return workspace.getConfiguration("git", null);
}

function getWorkspaceConfig(scope: ConfigurationScope): WorkspaceConfiguration {
    return workspace.getConfiguration("git", scope);
}

export function enabled(): boolean {
    return getConfig().get<boolean>("enabled", true);
}

export function autoRepositoryDetection(): boolean | "subFolders" | "openEditors" {
    return getConfig().get<boolean | "subFolders" | "openEditors">("autoRepositoryDetection", true);
}

export function scanRepositories(workspaceFolder: Uri): string[] {
    let config: WorkspaceConfiguration;
    if (workspace.isTrusted) {
        config = getWorkspaceConfig(workspaceFolder);
    } else {
        config = getConfig();
    }

    return config.get<string[]>("scanRepositories", []);
}
