/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Event, EventEmitter } from "vscode";

/**
 * The severity level of a log message
 */
export type LogLevelOptions = "Critical" | "Debug" | "Error" | "Info" | "Off" | "Trace" | "Warning";
export const LogLevel: Record<LogLevelOptions, LogLevelOptions> = {
    Critical: "Critical",
    Debug: "Debug",
    Error: "Error",
    Info: "Info",
    Off: "Off",
    Trace: "Trace",
    Warning: "Warning",
};

let _logLevel: LogLevelOptions = LogLevel.Info;
const _onDidChangeLogLevel = new EventEmitter<LogLevelOptions>();

export const Log = {
    /**
     * Current logging level.
     */
    get logLevel(): LogLevelOptions {
        return _logLevel;
    },

    /**
     * Current logging level.
     */
    set logLevel(logLevel: LogLevelOptions) {
        if (_logLevel === logLevel) {
            return;
        }

        _logLevel = logLevel;
        _onDidChangeLogLevel.fire(logLevel);
    },

    /**
     * An [event](#Event) that fires when the log level has changed.
     */
    get onDidChangeLogLevel(): Event<LogLevelOptions> {
        return _onDidChangeLogLevel.event;
    },
};
