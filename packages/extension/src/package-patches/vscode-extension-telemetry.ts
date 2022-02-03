import badVscodeExtensionTelemetry from '@vscode/extension-telemetry';

export type TelemetryReporter = badVscodeExtensionTelemetry.default;
export const TelemetryReporter: typeof badVscodeExtensionTelemetry.default = badVscodeExtensionTelemetry as any;
