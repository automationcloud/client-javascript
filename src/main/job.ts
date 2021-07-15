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

import { EventEmitter } from 'eventemitter3';

import { AcJobEvent } from './ac-api';
import { Client } from './client';
import * as errors from './errors';
import { JobCategory, JobError, JobEventHandler, JobInitParams, JobInput, JobOutput, JobOutputEvent, JobState, Tds } from './types';

/**
 * Job instance reflexts the Job created in Automation Cloud.
 *
 * The job should be created via {@link Client.createJob}.
 *
 * When the job is created it is automatically tracked, which results in mirroring the
 * state of the remote jobs and emitting appropriate lifecycle events when outputs are emitted,
 * inputs are requested, job finishes successfully, job fails, etc.
 *
 * The exact job state is not guaranteed to be precise due to polling delays and network latencies.
 *
 * @public
 */
export class Job {
    protected _events: JobEventBus = new EventEmitter();
    protected _inputsMap: Map<string, JobInput> = new Map();
    protected _outputsMap: Map<string, JobOutput> = new Map();
    protected _initParams: JobInitParams;
    protected _state: JobState = JobState.CREATED;
    protected _error: JobError | null = null;
    protected _awaitingInputKey: string | null = null;
    protected _trackPromise: Promise<void> | null = null;
    protected _jobId: string | null = null;
    protected _jobEventOffset: number = 0;
    protected _isTracking: boolean = false;

    /**
     * Job constructor should not be used directly; use `client.createJob()` to run the scripts.
     *
     * @param client
     * @param params
     */
    constructor(
        public client: Client,
        params: Partial<JobInitParams> = {},
    ) {
        this._initParams = {
            serviceId: params.serviceId ?? null,
            category: JobCategory.TEST,
            input: {},
            ...params,
        };
    }

    /**
     * The `jobId` of the AutomationCloud job. Can be used to resume tracking of existing job
     * using `const job = await client.getJob(jobId)`.
     */
    get jobId(): string {
        if (!this._jobId) {
            throw new errors.JobNotInitializedError();
        }
        return this._jobId;
    }

    /**
     * Starts a new job by sending a POST /jobs request to Automation Cloud API
     * and begin tracking its events.
     *
     * This method is internal. Use `await client.createJob()` for starting new jobs.
     *
     * @internal
     */
    async start() {
        if (this._jobId) {
            throw new errors.JobAlreadyStartedError(this.jobId);
        }
        const { category, input } = this._initParams;
        const { serviceId } = this._initParams;
        if (!serviceId) {
            throw new errors.ClientConfigError('serviceId is required to start the job');
        }
        const { id, state } = await this.api.createJob({ serviceId, category, input });
        this._jobId = id;
        this._setState(state);
        for (const [key, data] of Object.entries(input)) {
            this._inputsMap.set(key, { key, data });
        }
        if (this.client.config.autoTrack) {
            this.startTracking();
        }
    }

    /**
     * Tracks the job that was previosly created.
     *
     * This method is internal. Use `await client.getJob()` for tracking existing jobs.
     *
     * @internal
     */
    async trackExisting(jobId: string) {
        if (this._jobId) {
            throw new errors.JobAlreadyStartedError({ jobId: this.jobId });
        }
        const { state, category } = await this.api.getJob(jobId);
        this._jobId = jobId;
        this._initParams.category = category;
        this._setState(state);
        this.startTracking();
    }

    /**
     * Starts tracking the job. This results in periodic polling for `/events` endpoint
     * and updating the Job instance state appropriately.
     */
    startTracking() {
        if (this._trackPromise) {
            return;
        }
        this._isTracking = true;
        this._trackPromise = this._track();
        // Prevent unhandled rejections
        this._trackPromise
            .catch(_err => {})
            .then(() => {
                this._isTracking = false;
                this._trackPromise = null;
            });
    }

    /**
     * Stops tracking this job. Use when you're not interested in the outcome of the job.
     */
    stopTracking() {
        this._isTracking = false;
    }

    /**
     * Returns the last known state of the Job.
     * See {@link JobState} for a list of available job states.
     *
     * @public
     */
    getState() {
        return this._state;
    }

    /**
     * @param newState
     * @internal
     */
    protected _setState(newState: JobState) {
        const previousState = this._state;
        this._state = newState;
        this._events.emit('stateChanged', newState, previousState);
    }

    /**
     * If job has failed, returns the information about the error.
     *
     * Note: error info is not an `Error` instance — do not `throw` it.
     *
     * @public
     */
    getErrorInfo() {
        return this._error;
    }

    /**
     * If job is waiting for input (i.e. due to input request by script and not yet submitted),
     * then this method returns the requested input key, otherwise `null` is returned.
     *
     * @public
     */
    getAwaitingInputKey() {
        return this._awaitingInputKey;
    }

    /**
     * Retrieves a Job Access Token — an authentication scoped to a single job
     * which can be used to resume the tracking and cannot access other jobs.
     *
     * This is useful in scenarios where you want to provide your customers with ability
     * to interact with the Job, but cannot expose Automation Cloud credentials (e.g. in browser).
     *
     * A typical flow looks like this:
     *
     * - on backend you create a Job using `client.createJob` and Automation Cloud credentials
     * - you obtain Job Access Token using `job.getAccessToken` and send `jobId` and `token` in response
     * - on browser you use this `token` as an `auth` option when creating a `Client` instance,
     *   and then use `getJob` to interact with that job.
     */
    async getAccessToken() {
        return await this.api.getJobAccessToken(this.jobId);
    }

    /**
     * Submits an input with specified `key` and `data`.
     *
     * @param key input key
     * @param data input data
     * @public
     */
    async submitInput(key: string, data: any) {
        await this.api.sendJobInput(this.jobId, key, data);
        this._inputsMap.set(key, { key, data });
    }

    /**
     * Retrieves the data of an output with specified `key` if it was already emitted.
     * Returns `undefined` if output does not exist.
     *
     * @param key output key
     * @public
     */
    async getOutput(key: string): Promise<any> {
        let output = this._outputsMap.get(key) ?? null;
        if (!output) {
            output = await this.api.getJobOutput(this.jobId, key);
            if (output) {
                this._outputsMap.set(key, output);
            }
        }
        return output?.data;
    }

    /**
     * Retrieves job outputs.
     *
     * @public
     */
    async getOutputs(): Promise<JobOutput[]> {
        return await this.api.getJobOutputs(this.jobId);
    }

    /**
     * @returns Retrieves the active 3-D Secure challenge for this job.
     *
     * @public
     */
    async getTds(): Promise<Tds> {
        const tds = await this.api.getTdsForJob(this.jobId);
        return tds;
    }

    /**
     * Resolves whenever job finishes successfully or if the job tracking was stopped with `stopTracking()`.
     * Rejects if job fails.
     *
     * Consumer code should always `await job.waitForCompletion()` to avoid dangling promises.
     */
    async waitForCompletion() {
        await this._trackPromise;
    }

    /**
     * Cancels the remote Job which results in `JobCancelled` error (if the job was still running).
     * This also causes `waitForCompletion` promise to reject with `JobCancelled` error.
     *
     * Note: the job is not guaranteed to get interrupted immediately.
     *
     * @public
     */
    async cancel() {
        await this.api.cancelJob(this.jobId);
    }

    /**
     * Resolves when all outputs with specified `keys` are available.
     * The output data is returned as an array in the same order as specified keys.
     *
     * ProTip™ Use destructuring to access the data:
     *
     * ```
     * const [products, deliveryOptions] = await job.waitForOutputs('products', 'deliveryOptions');
     * ```
     *
     * @param keys output keys
     * @public
     */
    async waitForOutputs(...keys: string[]): Promise<any[]> {
        return await this._waitFor<any[]>(() => {
            const outputs = this._checkOutputs(keys);
            if (outputs != null) {
                return outputs;
            }
            if (this.getState() === JobState.FAIL) {
                throw new errors.JobOutputWaitError('Job failed, and specified outputs were not emitted', {
                    state: this.getState(),
                    jobId: this.jobId,
                });
            }
            if (this.getState() === JobState.SUCCESS) {
                throw new errors.JobOutputWaitError('Job succeeded, but specified outputs were not emitted', {
                    state: this.getState(),
                    jobId: this.jobId,
                });
            }
            // Keep waiting
            return undefined;
        });
    }

    protected async _waitFor<T>(resultFn: () => T | undefined): Promise<T> {
        return new Promise((resolve, reject) => {
            const check = () => {
                try {
                    const result = resultFn();
                    if (result !== undefined) {
                        cleanup();
                        resolve(result);
                    }
                } catch (err) {
                    cleanup();
                    reject(err);
                }
            };
            const onTrackError = (err: Error) => {
                cleanup();
                reject(err);
            };
            const cleanup = () => {
                this._events.off('trackTick', check);
                this._events.off('trackError', onTrackError);
            };
            this._events.on('trackTick', check);
            this._events.on('trackError', onTrackError);
            check();
        });
    }

    /**
     * Subscribes to `awaitingInput` event for specified input key and optionally fulfills
     * the input request with data returned by handler funciton.
     *
     * When input with specified `key` is requested by script, the supplied `fn` handler is invoked.
     *
     * Unless the handler returns `undefined`, the result value is sent as input data for that key,
     * fulfilling the input request.
     *
     * Use this to handle deferred inputs.
     *
     * @param key requested input key, `*` to receive all events.
     * @param fn handler callback, can be either synchronous or asynchronous; the return value is
     *  submitted as input data for specified input `key`
     */
    onAwaitingInput(key: string, fn: (key: string) => any | Promise<any>): JobEventHandler {
        return this._createJobEventHandler('awaitingInput', async (requestedKey: string) => {
            if (key === '*' || requestedKey === key) {
                const data = await fn(requestedKey);
                if (data !== undefined) {
                    await this.submitInput(key, data);
                }
            }
        });
    }

    /**
     * Subscribes to `output` event for specified output `key`.
     *
     * When output with specified `key` is emitted by script, the handler `fn` is invoked.
     *
     * @param key output key
     * @param fn handler callback, can be either synchronous or asynchronous
     */
    onOutput(key: string, fn: (outputData: any) => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('output', async (output: JobOutput) => {
            if (this._matchKey(key, output.key)) {
                await fn(output.data);
            }
        });
    }

    /**
     * Subscribes to `output` event for dynamic outputs with specified `key` prefix.
     *
     * @param fn handler callback, can be either synchronous or asynchronous
     */
    onDynamicOutput(keyPrefix: string, fn: (outputKey: string, outputData: any) => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('output', async (output: JobOutput) => {
            if (output.key.startsWith(keyPrefix + ':') || this._matchKey(keyPrefix, output.key)) {
                await fn(output.key, output.data);
            }
        });
    }

    /**
     * Subscribes to `output` event for all output keys.
     *
     * When any output is emitted by script, the handler `fn` is invoked.
     *
     * @param fn handler callback, can be either synchronous or asynchronous
     */
    onAnyOutput(fn: (outputKey: string, outputData: any) => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('output', async (output: JobOutput) => {
            await fn(output.key, output.data);
        });
    }

    /**
     * @param eventType
     * @beta
     */
    onOutputEvent(eventType: string, fn: (eventData: JobOutputEvent) => void | Promise<void>): JobEventHandler {
        return this.onDynamicOutput('events', async (_key, data) => {
            if (!data || typeof data !== 'object') {
                return;
            }
            if (this._matchKey(eventType, data.type)) {
                await fn(data);
            }
        });
    }

    /**
     * Subscribes to state change event.
     *
     * @param fn handler callback, can be either synchronous or asynchronous
     */
    onStateChanged(fn: (state: JobState) => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('stateChanged', fn);
    }

    /**
     * Subscribes to `success` event.
     *
     * When the job finishes successfully the handler `fn` is invoked.
     *
     * @param fn handler callback, can be either synchronous or asynchronous
     */
    onSuccess(fn: () => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('success', fn);
    }

    /**
     * Subscribes to `fail` event.
     *
     * When the job fails the handler `fn` is invoked with error info passed as a parameter.
     *
     * @param fn handler callback, can be either synchronous or asynchronous
     */
    onFail(fn: (err: Error) => void | Promise<void>): JobEventHandler {
        return this._createJobEventHandler('fail', fn);
    }

    /**
     * Job tracking loop periodically fetches Job Events from API
     * and processes them. This results in instance state updates
     * and emitting necessary lifecycle events.
     *
     * @internal
     */
    protected async _track() {
        while (this._isTracking) {
            const { pollInterval } = this.client.config;
            try {
                const events = await this.api.getJobEvents(this.jobId, this._jobEventOffset);
                this._jobEventOffset += events.length;
                for (const event of events) {
                    await this._processJobEvent(event);
                }
                this._events.emit('trackTick');
            } catch (err) {
                const error = new errors.JobTrackError(err);
                this._events.emit('trackError', error);
                throw error;
            }
            switch (this._state) {
                case JobState.SUCCESS: {
                    return;
                }
                case JobState.FAIL: {
                    throw new errors.JobFailedError(this._error);
                }
            }
            await new Promise(r => setTimeout(r, pollInterval));
        }
    }

    /**
    * @internal
    */
    protected async _processJobEvent(jobEvent: AcJobEvent) {
        const key = jobEvent.key!;
        switch (jobEvent.name) {
            case 'awaitingInput': {
                this._setState(JobState.AWAITING_INPUT);
                this._awaitingInputKey = key;
                this._events.emit('awaitingInput', key);
            } break;
            case 'createOutput': {
                const jobOutput = await this.api.getJobOutput(this.jobId, key);
                if (jobOutput) {
                    const data = jobOutput.data;
                    this._outputsMap.set(key, { key, data });
                    this._events.emit('output', { key, data });
                }
            } break;
            case 'processing': {
                this._setState(JobState.PROCESSING);
            } break;
            case 'success': {
                this._setState(JobState.SUCCESS);
                this._events.emit('success');
            } break;
            case 'fail': {
                const { error } = await this.api.getJob(this.jobId);
                this._setState(JobState.FAIL);
                this._error = {
                    category: 'server',
                    code: 'UnknownError',
                    message: 'Unknown error',
                    ...error,
                };
                const exception = new errors.JobFailedError(this._error);
                this._events.emit('fail', exception);
            } break;
            case 'tdsStart': {
                this._setState(JobState.AWAITING_TDS);
                this._events.emit('tdsStart');
            } break;
            case 'tdsFinish': {
                this._setState(JobState.PROCESSING);
                this._events.emit('tdsFinish');
            } break;
            // TODO handle those
            case 'restart':
        }
    }

    /**
     * Inspects the readiness of specified output keys.
     *
     * @internal
     */
    protected _checkOutputs(keys: string[]): any[] | null {
        const values = [];
        for (const key of keys) {
            const output = this._outputsMap.get(key);
            if (output) {
                values.push(output.data);
            } else {
                break;
            }
        }
        if (values.length === keys.length) {
            return values;
        }
        return null;
    }

    /**
     * @internal
     */
    protected get api() {
        return this.client.api;
    }

    protected _createJobEventHandler(event: 'output', fn: (output: JobOutput) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'awaitingInput', fn: (requestedKey: string) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'stateChanged', fn: (newState: JobState) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'success', fn: () => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: 'fail', fn: (error: Error) => void | Promise<void>): JobEventHandler
    protected _createJobEventHandler(event: string, fn: (...args: any[]) => void | Promise<void>): JobEventHandler {
        const handler = async (...args: any[]) => {
            await fn(...args);
        };
        this._events.on(event as any, handler);
        return () => this._events.off(event, handler);
    }

    protected _matchKey(keyPattern: string, actualKey: string) {
        if (keyPattern.endsWith(':*')) {
            const keyBase = keyPattern.split(':')[0];
            return actualKey.startsWith(keyBase + ':');
        }
        return actualKey === keyPattern;
    }
}

/**
 * Unified event emitter for passing internal job events between components.
 *
 * @internal
 */
export interface JobEventBus {
    emit(event: 'input', input: JobInput): boolean;
    emit(event: 'output', output: JobOutput): boolean;
    emit(event: 'awaitingInput', key: string): boolean;
    emit(event: 'error', error: Error): boolean;
    emit(event: 'stateChanged', newState: JobState, previousState: JobState): boolean;
    emit(event: 'success'): boolean;
    emit(event: 'fail', error: Error): boolean;
    emit(event: 'trackTick'): boolean;
    emit(event: 'trackError', error: Error): boolean;
    emit(event: 'tdsStart'): boolean;
    emit(event: 'tdsFinish'): boolean;

    on(event: 'input', fn: (input: JobInput) => void): this;
    on(event: 'output', fn: (output: JobOutput) => void): this;
    on(event: 'awaitingInput', fn: (key: string) => void): this;
    on(event: 'error', fn: (error: Error) => void): this;
    on(event: 'stateChanged', fn: (newState: JobState, previousState: JobState) => void): this;
    on(event: 'success', fn: () => void): this;
    on(event: 'fail', fn: (error: Error) => void): this;
    on(event: 'trackTick', fn: () => void): this;
    on(event: 'trackError', fn: (error: Error) => void): this;

    off(event: string, fn: (...args: any[]) => any): this;
}
