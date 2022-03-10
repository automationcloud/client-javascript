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

describe('Vault', () => {
    const mock = new AcMock();

    beforeEach(() => mock.start());
    afterEach(() => mock.stop());

    describe('createOtp', () => {
        it('creates an otp', async () => {
            const client = mock.createClient();
            const otp = await client.vault.createOtp();
            assert.ok(typeof otp === 'string');
            assert.strict(otp, mock.otp!);
        });
    });

    describe('createPanToken', () => {
        it('creates token with existing otp', async () => {
            const client = mock.createClient();
            const otp = await client.vault.createOtp();
            const panToken = await client.vault.createPanToken('4111111111111111', otp);
            assert.strictEqual(panToken, 'some-pan-token');
            assert.strictEqual(mock.otp, null);
        });

        it('does not allow reusing otp', async () => {
            const client = mock.createClient();
            const otp = await client.vault.createOtp();
            await client.vault.createPanToken('4111111111111111', otp);
            try {
                await client.vault.createPanToken('4111111111111111', otp);
                throw new Error('UnexpectedSuccess');
            } catch (err: any) {
                assert.strictEqual(err.name, 'RequestFailedError');
                assert.strictEqual(err.details.status, 403);
            }
        });

        it('creates adhoc otp when not provided', async () => {
            const client = mock.createClient();
            const panToken = await client.vault.createPanToken('4111111111111111');
            assert.strictEqual(panToken, 'some-pan-token');
            assert.strictEqual(mock.otp, null);
        });
    });

    describe('getIframeUrl', () => {
        it('returns an iframe url', async () => {
            const client = mock.createClient();
            const otp = await client.vault.createOtp();
            const url = client.vault.getPaymentIframeUrl(otp, {
                iframeUrl: 'https://example.com',
                cssUrl: 'https://foo.org/bar.css',
                brands: ['visa', 'mastercard'],
                fields: [
                    'pan',
                    'expiry-select',
                    { name: 'cvv', label: 'CVV', placeholder: 'Security Code' },
                    'name',
                ],
                name: 'John Doe Jr.',
            });

            const urlObj = new URL(url);
            assert.strictEqual(urlObj.origin, 'https://example.com');
            const options = urlObj.searchParams;
            assert.strictEqual(options.get('css'), 'https://foo.org/bar.css');
            assert.strictEqual(options.get('name'), 'John Doe Jr.');
            assert.strictEqual(options.get('fields'), 'pan,expiry-select,cvv_CVV_Security Code,name');
            assert.strictEqual(options.get('brands'), 'visa,mastercard');
        });
    });

    describe('getSingleInputIframeUrl', () => {
        it('returns an iframe url', async () => {
            const client = mock.createClient();
            const otp = await client.vault.createOtp();
            const url = client.vault.getSingleInputIframeUrl(otp, {
                iframeUrl: 'https://example.com',
                cssUrl: 'https://foo.org/bar.css',
                validateOnInput: true,
                inputType: 'password',
                pattern: '[a-z]',
                minlength: 3,
                maxlength: 100,
                required: true,
            });

            const urlObj = new URL(url);
            assert.strictEqual(urlObj.origin, 'https://example.com');
            const options = urlObj.searchParams;
            assert.strictEqual(options.get('css'), 'https://foo.org/bar.css');
            assert.strictEqual(options.get('inputType'), 'password');
            assert.strictEqual(options.get('pattern'), '[a-z]');
            assert.strictEqual(options.get('minlength'), '3');
            assert.strictEqual(options.get('maxlength'), '100');
            assert.strictEqual(options.get('required'), 'true');
            assert.strictEqual(options.get('validateOnInput'), 'on');
        });
    });
});
