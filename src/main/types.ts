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

/**
 * Job initialization parameters, provided when the job is being created using `Client.createJob()`.
 */
export interface JobInitParams {
    /**
     * Service id to start automation job on. Defaults to `client.config.serviceId`.
     */
    serviceId: string | null;
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
 * Output event produced by automation job.
 */
export interface JobOutputEvent {
    type: string;
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
 * 3-D Secure object produced by automation job.
 */
export type Tds = {
    id: string;
    url: string;
}

/**
 * Automation Cloud authentication.
 *
 * Use `string` for App Secret Key or Job Access Token authentication,
 * or provide the OAuth2 client credentials as an object.
 */
export type ClientAuthParams = {
    clientId: string;
    clientSecret: string;
} | string | null;

/**
 * Optional Client configuration parameters.
 */
export interface ClientConfig {

    /**
     * A UUID of the Service to be executed (you can obtain it from Automation Cloud dashboard).
     *
     * If not specified, then it must be explicitly passed when required (e.g. to create a job,
     * query previous outputs, etc).
     */
    serviceId: string | null;

    /**
     * Automation Cloud authentication parameters.
     */
    auth: ClientAuthParams;

    /**
     * Automation Cloud API base URL. Trailing slash should not be included.
     */
    apiUrl: string;

    /**
     * Automation Cloud OAuth2 token URL.
     */
    apiTokenUrl: string;

    /**
     * Automation Cloud Vault API URL. Trailing slash should not be included.
     */
    vaultUrl: string;

    /**
     * Poll interval in milliseconds for job state synchronization. Default: `1000` (1 second).
     */
    pollInterval: number;

    /**
     * The number of times failed http requests to Automation Cloud API will be resent in case of failure.
     */
    requestRetryCount: number;

    /**
     * The delay between re-sending the failed http requests.
     */
    requestRetryDelay: number;

    /**
     * Whether or not to start tracking the job automatically when it is created. Default: `true`.
     */
    autoTrack: boolean;

    /**
     * Additional headers to send alongside API requests.
     */
    additionalHeaders: Record<string, string>;
}
