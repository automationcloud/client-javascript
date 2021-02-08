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

import { AcApi, AcJobInput, AcPreviousJobOutput } from './ac-api';
import { Job } from './job';
import { Logger } from './logger';
import { ClientConfig, ClientOptions, JobCategory, JobInitParams } from './types';
import { Vault } from './vault';

/**
 * A Client instance is used to run a job on a particular service.
 *
 * Client is scoped to a service and can be used to create multiple jobs
 * with the same configuration. To create jobs that execute different scripts,
 * separate Client instances should be created.
 *
 * When the job is created the POST request is send to Automation Cloud,
 * which results in a new job being created. It is also possible to resume an existing job
 * using `client.getJob(jobId)`, provided that `jobId` is known.
 */
export class Client {
    logger: Logger = console;

    /**
     * Client instance configuration.
     */
    config: ClientConfig;

    /**
     * Provides access to Automation Cloud Vault functionality.
     */
    vault: Vault;

    /**
     * @internal
     */
    api: AcApi;

    constructor(params: ClientOptions) {
        this.config = {
            apiUrl: 'https://api.automationcloud.net',
            apiTokenUrl: 'https://auth.automationcloud.net/auth/realms/automationcloud/protocol/openid-connect/token',
            vaultUrl: 'https://vault.automationcloud.net',
            pollInterval: 1000,
            requestRetryCount: 4,
            requestRetryDelay: 500,
            ...params,
        };
        this.api = new AcApi({
            logger: this.logger,
            apiTokenUrl: this.config.apiTokenUrl,
            apiUrl: this.config.apiUrl,
            auth: this.config.auth,
            requestRetryCount: this.config.requestRetryCount,
            requestRetryDelay: this.config.requestRetryDelay,
        });
        this.vault = new Vault(this);
    }

    /**
     * Resumes the tracking of the job that was previously created.
     *
     * @param jobId can be obtained from `Job` instance.
     */
    async getJob(jobId: string): Promise<Job> {
        const job = new Job(this);
        await job.trackExisting(jobId);
        return job;
    }

    /**
     * Queries Automation Cloud for outputs that were previously emitted
     * for this service, optionally matching specified `inputs`.
     *
     * @param key output key
     * @param inputs optionally filter the results by matching specified inputs
     */
    async queryPreviousOutput(key: string, inputs: AcJobInput[] = []): Promise<AcPreviousJobOutput | null> {
        const outputs = await this.api.queryPreviousOutputs(this.config.serviceId, key, inputs);
        return outputs.length ? outputs[0] : null;
    }

    /**
     * Creates a new job which conceptually results in starting an automation
     * and starts tracking its lifecycle events (i.e. emitted outputs,
     * requested inputs, success, failures, etc.)
     *
     * The job is automatically tracked after creation. The tracking stops after the job
     * reaches one of the final states (`success`, `fail`). For this reason it is recommended
     * that `await job.waitForCompletion()` is always included to prevent dangling promises
     * and unhandled promise rejections.
     *
     * @param options Job initilalization parameters (includes `category` and `input`).
     */
    async createJob(options: Partial<JobInitParams> = {}): Promise<Job> {
        return await this._createJob({
            category: JobCategory.TEST,
            input: {},
            ...options,
        });
    }

    /**
     * @internal
     */
    protected async _createJob(params: JobInitParams): Promise<Job> {
        const job = new Job(this, params);
        await job.start();
        return job;
    }

}
