import assert from 'assert';

import { AcMock } from '../ac-mock';

describe('Retry failed requests', () => {

    const RECOVERABLE_ERROR_CODE = 502;
    const UNRECOVERABLE_ERROR_CODE = 500;

    context('request fails, then succeeds', () => {
        const mock = new AcMock();
        beforeEach(() => mock.start());
        beforeEach(() => {
            mock.on('createJob', () => {
                mock.removeAllListeners('createJob');
                const err: any = new Error('Boom');
                err.status = RECOVERABLE_ERROR_CODE;
                throw err;
            });
        });
        afterEach(() => mock.stop());

        it('retries and creates the job successfully', async () => {
            const client = mock.createClient();
            const job = await client.createJob();
            mock.success();
            await job.waitForCompletion();
        });
    });

    context('request keeps failing', () => {
        const mock = new AcMock();
        beforeEach(() => mock.start());
        beforeEach(() => {
            mock.on('createJob', () => {
                const err: any = new Error('Boom');
                err.status = RECOVERABLE_ERROR_CODE;
                throw err;
            });
        });
        afterEach(() => mock.stop());

        it('job create throws', async () => {
            const client = mock.createClient();
            try {
                await client.createJob();
                throw new Error('UnexpectedSuccess');
            } catch (err) {
                assert.strictEqual(err.message, 'Boom');
            }
        });
    });

    context('request fails with unrecoverable error', () => {
        const mock = new AcMock();
        beforeEach(() => mock.start());
        beforeEach(() => {
            mock.on('createJob', () => {
                mock.removeAllListeners('createJob');
                const err: any = new Error('Boom');
                err.status = UNRECOVERABLE_ERROR_CODE;
                throw err;
            });
        });
        afterEach(() => mock.stop());

        it('job create throws (does not retry)', async () => {
            const client = mock.createClient();
            try {
                await client.createJob();
                throw new Error('UnexpectedSuccess');
            } catch (err) {
                assert.strictEqual(err.message, 'Boom');
            }
        });
    });

});
