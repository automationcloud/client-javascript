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

import * as http from 'http';
import { AcJob, AcJobEvent, AcJobEventName, AcJobOutput, AcJobInput } from '../main/ac-api';
import { Client, ClientConfig, JobError, JobInputObject, JobState } from '../main';
import Koa from 'koa';
import Router from 'koa-router2';
import bodyParser from 'koa-body';
import EventEmitter from 'eventemitter3';

const PORT = Number(process.env.TEST_PORT) || 3008;
const SECRET_KEY = 'some-secret-key';

export class AcMock extends EventEmitter {
    config: MockConfig;
    app: Koa;
    server: http.Server;
    router: Router;

    job: AcJob | null = null;
    inputs: AcJobInput[] = [];
    outputs: AcJobOutput[] = [];
    events: AcJobEvent[] = [];
    otp: string | null = null;

    protected _inputTimeoutTimer: any;

    constructor(options: Partial<MockConfig> = {}) {
        super();
        this.config = {
            port: PORT,
            inputTimeout: 100,
            ...options,
        };
        this.app = new Koa();
        this.router = new Router();
        this.router.post('/jobs', ctx => this.createJob(ctx));
        this.router.use('/jobs/:id', (ctx, next) => this.authorize(ctx, next));
        this.router.get('/jobs/:id', ctx => this.getJob(ctx));
        this.router.get('/jobs/:id/end-user', ctx => this.getJobAccessToken(ctx));
        this.router.get('/jobs/:id/events', ctx => this.getJobEvents(ctx));
        this.router.get('/jobs/:id/outputs/:outputKey', ctx => this.getJobOutput(ctx));
        this.router.post('/jobs/:id/inputs', ctx => this.createJobInput(ctx));
        this.router.post('/services/:id/previous-job-outputs', ctx => this.queryPreviousOutputs(ctx));
        this.router.post('/~vault/otp', ctx => this.createOtp(ctx));
        this.router.post('/~vault/pan', ctx => this.createPanToken(ctx));
        this.app.use(async (ctx, next) => {
            try {
                ctx.body = {};
                await next();
            } catch (err) {
                ctx.status = err.status ?? 500;
                ctx.body = {
                    name: err.name,
                    message: err.message,
                    details: err.details,
                };
            }
        });
        this.app.use(bodyParser({ json: true }));
        this.app.use(this.router.routes());
        this.server = http.createServer(this.app.callback());
    }

    reset() {
        this.removeAllListeners();
        this.job = null;
        this.inputs = [];
        this.outputs = [];
        this.events = [];
        this.otp = null;
    }

    createClient(overrides: Partial<ClientConfig> = {}): Client {
        return new Client({
            serviceId: '123',
            auth: SECRET_KEY,
            pollInterval: 10,
            apiUrl: this.url,
            vaultUrl: this.url + '/~vault',
            requestRetryCount: 1,
            requestRetryDelay: 50,
            ...overrides,
        });
    }

    get url() {
        return `http://localhost:${this.config.port}`;
    }

    start(): Promise<void> {
        this.reset();
        return new Promise(resolve => this.server.listen(this.config.port, () => resolve()));
    }

    stop(): Promise<void> {
        return new Promise(resolve => this.server.close(() => resolve()));
    }

    // Behaviour modifiers

    setState(newState: JobState) {
        this.job!.state = newState;
        switch (newState) {
            case JobState.PROCESSING:
                this.addEvent('processing');
                break;
            case JobState.SUCCESS:
                this.addEvent('success');
                break;
            case JobState.FAIL:
                this.addEvent('fail');
                break;
            case JobState.AWAITING_INPUT:
                this.addEvent('awaitingInput', this.job?.awaitingInputKey || undefined);
                break;
            case JobState.AWAITING_TDS:
                this.addEvent('tdsStart');
                break;
        }
    }

    addOutput(key: string, data: any) {
        this.outputs.push({
            key,
            data,
            jobId: this.job!.id,
        });
        this.addEvent('createOutput', key);
        this.emit('createOutput', { key, data });
    }

    addEvent(name: AcJobEventName, key?: string) {
        this.events.push({
            id: randomId(),
            name,
            key,
            createdAt: Date.now(),
        });
    }

    requestInput(key: string) {
        this.job!.awaitingInputKey = key;
        this.addEvent('awaitingInput', key);
        this._inputTimeoutTimer = setTimeout(() => {
            this.fail({
                category: 'client',
                code: 'InputTimeout',
                message: `Input ${key} was not provided in time`,
                details: { key }
            });
        }, this.config.inputTimeout);
        this.emit('requestInput', { key });
    }

    success() {
        this.setState(JobState.SUCCESS);
        this.emit('success');
    }

    fail(error: JobError) {
        this.job!.error = error;
        this.setState(JobState.FAIL);
        this.emit('fail', error);
    }

    addInputObject(obj: JobInputObject) {
        for (const [key, data] of Object.entries(obj)) {
            this.inputs.push({
                jobId: this.job!.id,
                key,
                data,
                encrypted: false,
            });
        }
    }

    // Routes

    protected async authorize(ctx: Koa.Context, next: Koa.Next) {
        const jobId = ctx.params.id;
        const authorization = ctx.headers.authorization;
        const key = Buffer.from(authorization.replace(/Basic\s+/ig, ''), 'base64')
            .toString('utf-8').split(':')[0];
        if (key === SECRET_KEY) {
            return next();
        }
        if (this.job?.id === jobId && key === 'job-access-token-' + jobId) {
            return next();
        }
        ctx.status = 403;
        this.emit('authFailed', ctx);
    }

    protected async createJob(ctx: Koa.Context) {
        this.job = {
            id: randomId(),
            awaitingInputKey: null,
            category: ctx.request.body.category || 'test',
            state: JobState.PROCESSING,
            error: null,
            serviceId: ctx.request.body.serviceId,
        };
        this.addInputObject(ctx.request.body.input);
        ctx.status = 200;
        ctx.body = this.job;
        this.emit('createJob', this.job);
    }

    protected async getJob(ctx: Koa.Context) {
        if (this.job?.id !== ctx.params.id) {
            ctx.status = 404;
            return;
        }
        ctx.status = 200;
        ctx.body = this.job;
        this.emit('getJob', ctx);
    }

    protected async getJobAccessToken(ctx: Koa.Context) {
        if (this.job?.id !== ctx.params.id) {
            ctx.status = 404;
            return;
        }
        ctx.status = 200;
        ctx.body = {
            token: 'job-access-token-' + this.job?.id,
        };
        this.emit('getJobAccessToken', ctx);
    }

    protected async getJobEvents(ctx: Koa.Context) {
        if (this.job?.id !== ctx.params.id) {
            ctx.status = 404;
            return;
        }
        ctx.status = 200;
        ctx.body = {
            data: this.events.slice(Number(ctx.query.offset) || 0)
        };
        this.emit('getJobEvents', ctx);
    }

    protected async getJobOutput(ctx: Koa.Context) {
        if (this.job?.id !== ctx.params.id) {
            ctx.status = 404;
            return;
        }
        const output = this.outputs.find(_ => _.key === ctx.params.outputKey);
        if (output) {
            ctx.status = 200;
            ctx.body = output;
        } else {
            ctx.status = 404;
        }
        this.emit('getJobOutput', ctx);
    }

    protected async createJobInput(ctx: Koa.Context) {
        if (this.job?.id !== ctx.params.id) {
            ctx.status = 404;
            return;
        }
        const { key, data } = ctx.request.body;
        this.addInputObject({ [key]: data });
        if (this.job?.awaitingInputKey === key) {
            clearTimeout(this._inputTimeoutTimer);
            this.setState(JobState.PROCESSING);
        }
        ctx.status = 201;
        this.emit('createJobInput', { key, data });
    }

    protected async queryPreviousOutputs(ctx: Koa.Context) {
        const data = this.outputs
            .filter(_ => _.key === ctx.query.key)
            .map(output => {
                return {
                    ...output,
                    variability: 1
                };
            });
        ctx.status = 200;
        ctx.body = {
            object: 'list',
            data,
        };
        this.emit('queryPreviousOutputs', ctx);
    }

    protected async createOtp(ctx: Koa.Context) {
        this.otp = randomId();
        ctx.status = 201;
        ctx.body = { id: this.otp };
        this.emit('createOtp', ctx);
    }

    protected async createPanToken(ctx: Koa.Context) {
        const { otp, pan } = ctx.request.body;
        if (otp !== this.otp) {
            ctx.status = 403;
            return;
        }
        // Primitive PAN validation
        if (typeof pan !== 'string' || pan.length !== 16) {
            ctx.status = 400;
            return;
        }
        this.otp = null;
        ctx.status = 201;
        ctx.body = { key: 'some-decryption-key', panToken: 'some-pan-token' };
        this.emit('createPanToken', ctx);
    }

}

function randomId() {
    return Math.random().toString(36).substring(2);
}

interface MockConfig {
    port: number;
    inputTimeout: number;
}
