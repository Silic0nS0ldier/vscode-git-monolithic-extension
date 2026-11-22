import { Session } from "node:inspector";
import * as os from "node:os";
import { performance } from "node:perf_hooks";
import { inspect } from "node:util";
import {
    commands,
    env,
    type ExtensionContext,
    StatusBarAlignment,
    type StatusBarItem,
    Uri,
    version as vscodeVersion,
    window,
    workspace,
} from "vscode";
import { makeCommandId } from "../commands/helpers.js";
import type { Git } from "../git.js";
import { optionalLocksDisabled } from "../git/optional-locks.js";
import * as i18n from "../i18n/mod.js";
import type { Model } from "../model.js";
import { error, info } from "../tracing.js";
import * as config from "../util/config.js";
import { type DiagnosticActivity, diagnosticActivity } from "./activity.js";
import { createEventLoopMonitor, type EventLoopMonitor } from "./event-loop.js";

const PROFILE_LIMIT_MS = 5 * 60 * 1_000;

type CpuProfileState =
    | {
        readonly state: "recording";
        readonly startedAt: string;
    }
    | {
        readonly durationMs: number;
        readonly file: string;
        readonly startedAt: string;
        readonly state: "saved";
        readonly stoppedAt: string;
    };

interface ActiveCpuProfile {
    readonly session: Session;
    readonly startedAt: number;
    readonly status: StatusBarItem;
    readonly stem: string;
    timer?: NodeJS.Timeout;
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

function fileTimestamp(): string {
    return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function packageVersion(context: ExtensionContext): string {
    const packageJson: unknown = context.extension.packageJSON;
    if (
        typeof packageJson === "object" && packageJson !== null
        && "version" in packageJson && typeof packageJson.version === "string"
    ) {
        return packageJson.version;
    }
    return "unknown";
}

function describeActivity(activity: DiagnosticActivity): object {
    return {
        durationMs: round(activity.durationMs),
        id: activity.id,
        kind: activity.kind,
        label: activity.label,
        outcome: activity.outcome,
        pid: activity.pid,
        repository: activity.repository,
        startedAt: new Date(activity.startedAt).toISOString(),
    };
}

async function enableProfiler(session: Session): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        session.post("Profiler.enable", failure => failure ? reject(failure) : resolve());
    });
}

async function startProfiler(session: Session): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        session.post("Profiler.start", failure => failure ? reject(failure) : resolve());
    });
}

async function stopProfiler(session: Session): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        session.post("Profiler.stop", (failure, result) => {
            if (failure) {
                reject(failure);
            } else {
                resolve(JSON.stringify(result.profile));
            }
        });
    });
}

export class DiagnosticsManager {
    readonly #context: ExtensionContext;
    readonly #eventLoop: EventLoopMonitor;
    readonly #git: Git;
    readonly #model: Model;
    #activeProfile: ActiveCpuProfile | undefined;
    #fileSequence = 0;
    #stoppingProfile: Promise<void> | undefined;

    constructor(context: ExtensionContext, model: Model, git: Git) {
        this.#context = context;
        this.#git = git;
        this.#model = model;
        this.#eventLoop = createEventLoopMonitor();
    }

    async collect(): Promise<void> {
        if (this.#stoppingProfile) {
            await this.#stoppingProfile;
            return;
        }
        if (this.#activeProfile) {
            await this.#stopCpuProfile();
            return;
        }

        const snapshot = i18n.Translations.diagnosticsSnapshot();
        const profile = i18n.Translations.diagnosticsStartProfile();
        const choice = await window.showQuickPick(
            [
                {
                    description: i18n.Translations.diagnosticsSnapshotDescription(),
                    label: snapshot,
                    value: "snapshot" as const,
                },
                {
                    description: i18n.Translations.diagnosticsProfileDescription(),
                    label: profile,
                    value: "profile" as const,
                },
            ],
            {
                placeHolder: i18n.Translations.diagnosticsPlaceholder(),
            },
        );

        if (choice?.value === "snapshot") {
            await this.#saveReport(undefined, this.#newStem());
        } else if (choice?.value === "profile") {
            await this.#startCpuProfile();
        }
    }

    #newStem(): string {
        return `git-monolithic-${fileTimestamp()}-${this.#fileSequence++}`;
    }

    #reportDirectory(): Uri {
        return Uri.joinPath(this.#context.globalStorageUri, "performance-diagnostics");
    }

    async #startCpuProfile(): Promise<void> {
        const session = new Session();
        const stem = this.#newStem();
        const startedAt = Date.now();
        const status = window.createStatusBarItem(StatusBarAlignment.Left, 0);
        status.command = makeCommandId("collectDiagnostics");
        status.text = i18n.Translations.diagnosticsProfilingStatus();
        status.tooltip = i18n.Translations.diagnosticsProfilingTooltip();

        session.connect();
        try {
            await enableProfiler(session);
            await startProfiler(session);
        } catch (failure) {
            session.disconnect();
            status.dispose();
            throw failure;
        }

        const profile: ActiveCpuProfile = { session, startedAt, status, stem };
        this.#activeProfile = profile;
        status.show();
        profile.timer = setTimeout(() => {
            void this.#stopCpuProfile().catch(failure => {
                error(`Automatic performance profile save failed: ${inspect(failure)}`);
                void window.showWarningMessage(i18n.Translations.diagnosticsAutoSaveFailed());
            });
        }, PROFILE_LIMIT_MS);
        profile.timer.unref();

        try {
            await this.#saveReport({
                startedAt: new Date(startedAt).toISOString(),
                state: "recording",
            }, stem);
        } catch (failure) {
            this.#activeProfile = undefined;
            clearTimeout(profile.timer);
            status.dispose();
            try {
                await stopProfiler(session);
            } catch (cleanupFailure) {
                throw new AggregateError([failure, cleanupFailure], "Could not save or discard the CPU profile");
            } finally {
                session.disconnect();
            }
            throw failure;
        }

        void window.showInformationMessage(i18n.Translations.diagnosticsProfileStarted());
    }

    async #stopCpuProfile(): Promise<void> {
        if (this.#stoppingProfile) {
            return await this.#stoppingProfile;
        }
        const profile = this.#activeProfile;
        if (!profile) return;

        this.#stoppingProfile = this.#finishCpuProfile(profile);
        try {
            await this.#stoppingProfile;
        } finally {
            this.#stoppingProfile = undefined;
        }
    }

    async #finishCpuProfile(profile: ActiveCpuProfile): Promise<void> {
        clearTimeout(profile.timer);
        let profileJson: string;
        try {
            profileJson = await stopProfiler(profile.session);
        } finally {
            profile.session.disconnect();
            profile.status.dispose();
            if (this.#activeProfile === profile) this.#activeProfile = undefined;
        }

        const stoppedAt = Date.now();
        const profileFile = `${profile.stem}.cpuprofile`;
        const directory = this.#reportDirectory();
        await workspace.fs.createDirectory(directory);
        await workspace.fs.writeFile(
            Uri.joinPath(directory, profileFile),
            new TextEncoder().encode(profileJson),
        );
        await this.#saveReport({
            durationMs: stoppedAt - profile.startedAt,
            file: profileFile,
            startedAt: new Date(profile.startedAt).toISOString(),
            state: "saved",
            stoppedAt: new Date(stoppedAt).toISOString(),
        }, profile.stem);
    }

    async #saveReport(cpuProfile: CpuProfileState | undefined, stem: string): Promise<void> {
        const report = this.#buildReport(cpuProfile);
        const serialized = JSON.stringify(report, null, 2) + "\n";
        const directory = this.#reportDirectory();
        const reportUri = Uri.joinPath(directory, `${stem}.json`);

        await workspace.fs.createDirectory(directory);
        await workspace.fs.writeFile(reportUri, new TextEncoder().encode(serialized));

        const document = await workspace.openTextDocument(reportUri);
        await window.showTextDocument(document, { preview: false });
        info(`Saved performance diagnostics report ${stem}.`);

        const copy = i18n.Translations.diagnosticsCopyReport();
        const reveal = i18n.Translations.diagnosticsRevealFiles();
        void Promise.resolve(window.showInformationMessage(
            i18n.Translations.diagnosticsReportSaved(),
            copy,
            reveal,
        )).then(async choice => {
            if (choice === copy) {
                await env.clipboard.writeText(serialized);
            } else if (choice === reveal) {
                await commands.executeCommand("revealFileInOS", reportUri);
            }
        }).catch(failure => error(`Performance diagnostics action failed: ${inspect(failure)}`));
    }

    #buildReport(cpuProfile: CpuProfileState | undefined): object {
        const memory = process.memoryUsage();
        const cpu = process.cpuUsage();
        const utilization = performance.eventLoopUtilization();
        const activity = diagnosticActivity.snapshot();

        const repositories = this.#model.repositories.map(repository => {
            const root = Uri.file(repository.root);
            return {
                alias: diagnosticActivity.repositoryLabel(repository.root),
                configuration: {
                    autoRefresh: config.autoRefresh(root),
                    autoRefreshCooldownMs: config.autoRefreshCooldown(root),
                    autoRefreshDebounceMs: config.autoRefreshDebounce(root),
                    ignoreSubmodules: config.ignoreSubmodules(root),
                    watcherDebounceMs: config.watcherDebounce(root),
                },
                head: repository.HEAD === undefined
                    ? { available: false }
                    : {
                        ahead: repository.HEAD.ahead ?? 0,
                        available: true,
                        behind: repository.HEAD.behind ?? 0,
                        detached: repository.HEAD.name === undefined,
                        hasUpstream: repository.HEAD.upstream !== undefined,
                    },
                remoteCount: repository.remotes.length,
                state: {
                    merge: repository.sourceControlUI.mergeGroup.latestResourceStates().length,
                    staged: repository.sourceControlUI.stagedGroup.latestResourceStates().length,
                    tracked: repository.sourceControlUI.trackedGroup.latestResourceStates().length,
                    untracked: repository.sourceControlUI.untrackedGroup.latestResourceStates().length,
                },
                submoduleCount: repository.submodules.length,
            };
        });

        const loop = this.#eventLoop.snapshot();
        return {
            activity: {
                active: activity.active.map(describeActivity),
                recent: activity.recent.map(describeActivity),
            },
            configuration: {
                commandTimeoutMs: config.commandTimeout(),
                decorationsEnabled: config.decorationsEnabled(),
                detectSubmodules: config.detectSubmodules(),
                showProgress: config.showProgress(),
            },
            cpuProfile: cpuProfile ?? { state: "not-started" },
            createdAt: new Date().toISOString(),
            environment: {
                appName: env.appName,
                arch: process.arch,
                extensionVersion: packageVersion(this.#context),
                gitVersion: this.#git.version,
                node: process.versions.node,
                optionalLocksDisabled: optionalLocksDisabled(process.env),
                osRelease: os.release(),
                platform: process.platform,
                remote: env.remoteName ?? "local",
                uiKind: env.uiKind,
                v8: process.versions.v8,
                vscodeVersion,
            },
            eventLoop: {
                intervalMs: loop.intervalMs,
                maxOverrunMs: round(loop.maxOverrunMs),
                meanOverrunMs: round(loop.meanOverrunMs),
                p95OverrunMs: round(loop.p95OverrunMs),
                recentOverruns: loop.recent.map(sample => ({
                    at: new Date(sample.at).toISOString(),
                    overrunMs: round(sample.overrunMs),
                })),
                sampleCount: loop.sampleCount,
            },
            formatVersion: 1,
            host: {
                cpuUsageMicroseconds: cpu,
                eventLoopUtilization: {
                    activeMilliseconds: round(utilization.active),
                    idleMilliseconds: round(utilization.idle),
                    utilization: round(utilization.utilization),
                },
                memoryBytes: memory,
                pid: process.pid,
                uptimeSeconds: round(process.uptime()),
            },
            modelState: this.#model.state,
            notes: [
                i18n.Translations.diagnosticsPrivacyNote(),
                i18n.Translations.diagnosticsProfilePrivacyNote(),
            ],
            repositories,
            workspaceFolderCount: workspace.workspaceFolders?.length ?? 0,
        };
    }

    dispose(): void {
        clearTimeout(this.#activeProfile?.timer);
        this.#activeProfile?.session.disconnect();
        this.#activeProfile?.status.dispose();
        this.#activeProfile = undefined;
        this.#eventLoop.dispose();
    }
}
