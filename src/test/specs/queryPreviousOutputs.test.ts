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

describe('queryPreviousOutputs', () => {

    const mock = new AcMock();

    beforeEach(() => mock.start());
    afterEach(() => mock.stop());

    context('outputs exist', () => {
        it('resolves a list of outputs', async () => {
            const client = mock.createClient();
            const job = await client.createJob();
            mock.addOutput('someOutput', { foo: 123 });
            mock.addOutput('someOtherOutput', { bar: 345 });
            mock.success();
            await job.waitForCompletion();
            const someOutput = await client.queryPreviousOutput('someOutput');
            assert.ok(someOutput);
            assert.strictEqual(someOutput.key, 'someOutput');
            assert.deepStrictEqual(someOutput.data, { foo: 123 });
        });
    });

});
