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

import { AcMock } from '../ac-mock';

describe('Inputs', () => {

    const mock = new AcMock();

    beforeEach(() => mock.start());
    afterEach(() => mock.stop());

    context('input pre-supplied', () => {
        it('resolves input immediately', async () => {
            const client = mock.createClient();
            const job = await client.createJob({
                input: {
                    value: { foo: 1 }
                }
            });
            mock.success();
            await job.waitForCompletion();
            const input = mock.inputs.find(_ => _.key === 'value');
            assert.ok(input);
            assert.strictEqual(input.data.foo, 1);
        });
    });

    context('input requested, but not provided', () => {
        it('rejects after input timeout', async () => {
            const client = mock.createClient();
            const job = await client.createJob();
            mock.requestInput('value');
            try {
                await job.waitForCompletion();
            } catch (err: any) {
                assert.strictEqual(err.name, 'InputTimeout');
                assert.strictEqual(err.details.key, 'value');
            }
        });
    });

    context('input requested and provided', () => {
        it('resolves input', async () => {
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

    describe('submitInput', () => {
        it('adds input', async () => {
            const client = mock.createClient();
            const job = await client.createJob();
            await job.submitInput('value', { baz: 222 });
            mock.success();
            await job.waitForCompletion();
            const input = mock.inputs.find(_ => _.key === 'value');
            assert.deepStrictEqual(input?.data, { baz: 222 });
        });
    });

});
