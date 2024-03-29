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

import assert from 'assert';

import { JobState } from '../../main';
import { AcMock } from '../ac-mock';

describe('Events', () => {

    const mock = new AcMock();

    beforeEach(() => mock.start());
    afterEach(() => mock.stop());

    describe('onStateChanged', () => {
        describe('AWAITING_INPUT', () => {
            it('emits on awaiting input', async () => {
                let called = false;
                const client = mock.createClient();
                const job = await client.createJob();
                mock.requestInput('value');
                job.onStateChanged(async state => {
                    if (state === JobState.AWAITING_INPUT) {
                        called = true;
                        await job.submitInput('value', { foo: 1 });
                        mock.success();
                    }
                });
                await job.waitForCompletion();
                assert.strictEqual(called, true);
                const input = mock.inputs.find(_ => _.key === 'value');
                assert.deepStrictEqual(input?.data, { foo: 1 });
            });
        });

        describe('SUCCESS', () => {
            it('emits on success', async () => {
                let called = false;
                const client = mock.createClient();
                const job = await client.createJob();
                job.onStateChanged(async state => {
                    if (state === JobState.SUCCESS) {
                        called = true;
                    }
                });
                mock.success();
                await job.waitForCompletion();
                assert.strictEqual(called, true);
            });
        });

        describe('FAIL', () => {
            it('emits on fail', async () => {
                let called = false;
                const client = mock.createClient();
                const job = await client.createJob();
                job.onStateChanged(async state => {
                    if (state === JobState.FAIL) {
                        called = true;
                    }
                });
                mock.fail({ category: 'server', code: 'Boo', message: 'Boo me said' });
                await job.waitForCompletion().catch(() => { });
                assert.strictEqual(called, true);
            });
        });

        describe('TDS', () => {
            it('emits tds start events', async () => {
                let called = false;
                const client = mock.createClient();
                const job = await client.createJob();
                job.onStateChanged(async state => {
                    if (state === JobState.AWAITING_TDS) {
                        called = true;
                    }
                });
                mock.tds();
                const tds = await job.getTds();
                assert.strictEqual(tds.url, 'https://example.com/3ds');
                mock.success();
                await job.waitForCompletion().catch(() => { });
                assert.strictEqual(called, true);
            });
        });

    });

    describe('onSuccess', () => {
        it('emits when job finishes successfully', async () => {
            let called = false;
            const client = mock.createClient();
            const job = await client.createJob({ input: { value: '123' } });
            job.onSuccess(async () => {
                called = true;
            });
            mock.success();
            await job.waitForCompletion();
            assert.strictEqual(called, true);
        });
    });

    describe('onFail', () => {
        it('emits when job fails', async () => {
            let error: any = null;
            const client = mock.createClient();
            const job = await client.createJob();
            job.onFail(async err => {
                error = err;
            });
            mock.fail({ category: 'server', code: 'Boo', message: 'Boo me said' });
            await job.waitForCompletion().catch(() => { });
            assert.strictEqual(error?.name, 'Boo');
        });
    });

    describe('onAwaitingInput', () => {

        context('handler returns value', () => {
            it('emits when job input is requested, input is submitted', async () => {
                const client = mock.createClient();
                const job = await client.createJob();
                mock.requestInput('value');
                job.onAwaitingInput('value', async () => {
                    await Promise.resolve();
                    return { bar: 2 };
                });
                mock.on('createJobInput', () => mock.success());
                await job.waitForCompletion();
                const input = mock.inputs.find(_ => _.key === 'value');
                assert.deepStrictEqual(input?.data, { bar: 2 });
            });
        });

        context('handler returns undefined', () => {
            it('emits when job input is requested, input is not submitted', async () => {
                let called = false;
                const client = mock.createClient();
                const job = await client.createJob();
                mock.requestInput('value');
                job.onAwaitingInput('value', async () => {
                    called = true;
                });
                mock.success();
                await job.waitForCompletion();
                const input = mock.inputs.find(_ => _.key === 'value');
                assert.strictEqual(input, undefined);
                assert.strictEqual(called, true);
            });
        });

        context('wildcard input key', () => {
            it('emits on every input submission request', async () => {
                const requestedKeys: string[] = [];
                const client = mock.createClient();
                const job = await client.createJob();
                mock.requestInput('foo');
                job.onAwaitingInput('*', async key => {
                    requestedKeys.push(key);
                    switch (key) {
                        case 'foo':
                            await job.submitInput('selectedFoo', { value: 1 });
                            mock.requestInput('bar');
                            break;
                        case 'bar':
                            await job.submitInput('selectedBar', { value: 2 });
                            mock.success();
                            break;
                    }
                });
                await job.waitForCompletion();
                assert.deepStrictEqual(requestedKeys, ['foo', 'bar']);
                assert.deepStrictEqual(mock.inputs.find(_ => _.key === 'selectedFoo')!.data, { value: 1 });
                assert.deepStrictEqual(mock.inputs.find(_ => _.key === 'selectedBar')!.data, { value: 2 });
            });
        });
    });

    describe('onOutputEvent', () => {

        it('emits on output events', async () => {
            let fooEvent: any = null;
            let barEvent: any = null;
            const client = mock.createClient();
            const job = await client.createJob();
            job.onOutputEvent('foo', ev => { fooEvent = ev; });
            job.onOutputEvent('bar', ev => { barEvent = ev; });
            mock.addOutput('events:1', { type: 'foo', foo: 'one' });
            mock.addOutput('events:2', { type: 'bar', bar: 'two' });
            mock.success();
            await job.waitForCompletion();
            assert.deepStrictEqual(fooEvent, { type: 'foo', foo: 'one' });
            assert.deepStrictEqual(barEvent, { type: 'bar', bar: 'two' });
        });

    });

});
