// Copyright 2020 UBIO Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { RequestConfig } from '@automationcloud/request';

/**
 * Job initialization parameters, provided when the job is being created using `Client.createJob()`.
 */
export interface JobInitParams {
    /**
     * Initial job inputs (provided as objects).
     */
    input: JobInputObject;
    /**
     * Job category, used for filtering jobs in Automation Cloud dashboard.
     */
    category: JobCategory;
}

/**
 * Job can be in one particular state at any given time.
 */
export enum JobState {
    CREATED = 'created',
    SCHEDULED = 'scheduled',
    PROCESSING = 'processing',
    AWAITING_INPUT = 'awaitingInput',
    AWAITING_TDS = 'awaitingTds',
    PENDING = 'pending',
    SUCCESS = 'success',
    FAIL = 'fail',
}

/**
 * Indicates whether the job is live or test, useful for filtering jobs in dashboard.
 */
export enum JobCategory {
    LIVE = 'live',
    TEST = 'test',
}

/**
 * Describes the reason of job failure.
 */
export interface JobError {
    /**
     * Error code in PascalCase, typically constrained by schema.
     */
    code: string;

    /**
     * A designation of the root cause of error:
     *
     * - `client` indicates the class of errors that involve client actions
     *   (e.g. invalid inputs supplied, job cancelled, etc.)
     * - `server` indicates platform-related failure (e.g. worker crash, timeout, API unavailable, etc.)
     * - `website` indicates a known limitation with the website (e.g. an unsupported feature, flow or layout)
     */
    category: 'client' | 'server' | 'website';

    /**
     * If applicable, human-readable message for logging and debugging.
     *
     * Note: implementations should never depend on the structure of this string.
     */
    message: string;

    /**
     * Arbitrary details for logging and debugging.
     *
     * Note: implementations should never depend on the structure of this object.
     */
    details?: any;
}

/**
 * Job inputs are the primary means of supplying data to automations.
 *
 * Data is supplied by client in key-value format. Keys must be in camelCase.
 */
export interface JobInput {
    key: string;
    data: any;
}

/**
 * Job outputs are the primary means of receiving data from automations.
 *
 * Data is emitted by script in key-value format. Keys must be in camelCase.
 */
export interface JobOutput {
    key: string;
    data: any;
}

/**
 * Describes initial job inputs in object representation.
 */
export interface JobInputObject {
    [key: string]: any;
}

/**
 * Event subscription methods like `onOutput` return handlers which can subsequently be invoked
 * with zero arguments to unsubscribe from the event.
 *
 * ```ts
 * const unsubscribe = job.onOutput('someKey', async data => { ... });
 * // ...
 * unsubscribe();
 * ```
 */
export type JobEventHandler = () => void;

/**
 * Automation Cloud client configuration, consists of required and optional parameters.
 */
export type ClientConfig = ClientRequiredParams & ClientOptionalParams;
export type ClientOptions = ClientRequiredParams & Partial<ClientOptionalParams>;

/**
 * Automation Cloud authentication.
 *
 * Use `string` form for "client secret key" authentication,
 * or provide the OAuth2 client credentials as an object.
 */
export type ClientAuthParams = string | {
    clientId: string;
    clientSecret: string;
}

/**
 * Required Client configuration parameters.
 */
export interface ClientRequiredParams {
    /**
     * A UUID of the Service to be executed (you can obtain it from Automation Cloud dashboard).
     */
    serviceId: string;

    /**
     * Automation Cloud authentication parameters.
     */
    auth: ClientAuthParams;
}

/**
 * Optional Client configuration parameters.
 */
export interface ClientOptionalParams {
    apiUrl: string;
    apiTokenUrl: string;
    vaultUrl: string;
    /**
     * Poll interval in milliseconds for job state synchronization. Default: `1000` (1 second).
     */
    pollInterval: number;
    requestConfig?: Partial<RequestConfig>
}
