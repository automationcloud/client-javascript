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

describe('Outputs', () => {

    const mock = new AcMock();

    beforeEach(() => mock.start());
    afterEach(() => mock.stop());

    describe('waitForOutput', () => {
        context('output already produced', () => {
            it('resolves instantly', async () => {
                const client = mock.createClient();
                const job = await client.createJob();
                mock.addOutput('someOutput', { foo: 123 });
                mock.success();
                await job.waitForCompletion();
                const [someOutput] = await job.waitForOutputs('someOutput');
                assert.deepStrictEqual(someOutput, { foo: 123 });
            });
        });

        context('output produced later by script', () => {
            it('resolves', async () => {
                const client = mock.createClient();
                const job = await client.createJob();
                setTimeout(() => {
                    mock.addOutput('someOutput', { foo: 123 });
                }, 100);
                const [someOutput] = await job.waitForOutputs('someOutput');
                assert.deepStrictEqual(someOutput, { foo: 123 });
                mock.success();
                await job.waitForCompletion();
            });
        });

        context('job success, outputs not emitted', () => {
            it('rejects', async () => {
                const client = mock.createClient();
                const job = await client.createJob();
                mock.success();
                try {
                    await job.waitForOutputs('someOutput', 'someOtherOutput');
                    throw new Error();
                } catch (err: any) {
                    assert.strictEqual(err.name, 'JobOutputWaitError');
                }
            });
        });

        context('job fail, outputs not emitted', () => {
            it('rejects', async () => {
                const client = mock.createClient();
                const job = await client.createJob();
                mock.fail({ category: 'server', code: 'Boo', message: 'Boo dude' });
                try {
                    await job.waitForOutputs('someOutput');
                    throw new Error();
                } catch (err: any) {
                    assert.strictEqual(err.name, 'JobOutputWaitError');
                }
            });
        });

        context('output event emitted, but output is subsequently removed (i.e. job reset)', () => {
            it('keeps waiting for a new output', async () => {
                const client = mock.createClient();
                const job = await client.createJob();
                mock.addOutput('someOutput', { foo: 123 });
                mock.outputs = [];
                setTimeout(() => {
                    mock.addOutput('someOutput', { bar: 42 });
                }, 100);
                const [someOutput] = await job.waitForOutputs('someOutput');
                assert.deepStrictEqual(someOutput, { bar: 42 });
                mock.success();
                await job.waitForCompletion();
            });
        });

    });

    describe('getOutput', () => {
        it('returns undefined if output is not ready yet', async () => {
            const client = mock.createClient();
            const job = await client.createJob();
            const output = await job.getOutput('someOutput');
            assert.strictEqual(output, undefined);
            mock.success();
            await job.waitForCompletion();
        });

        it('resolves output if it is produced', async () => {
            const client = mock.createClient();
            const job = await client.createJob();
            mock.addOutput('someOutput', { foo: 123 });
            const someOutput = await job.getOutput('someOutput');
            assert.deepStrictEqual(someOutput, { foo: 123 });
            mock.success();
            await job.waitForCompletion();
        });
    });

});
