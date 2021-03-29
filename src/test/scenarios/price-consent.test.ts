import { AcMock } from '../ac-mock';
import assert from 'assert';
import { JobState } from '../../main';

describe('Scenario: Price Consent', () => {

    const mock = new AcMock();

    beforeEach(() => mock.start());
    beforeEach(() => {
        mock.on('createJob', () => {
            mock.addOutput('finalPrice', {
                price: { value: 100500, currencyCode: 'gbp' }
            });
            mock.requestInput('finalPriceConsent');
        });
        mock.on('createJobInput', ({ key, data }) => {
            if (key === 'finalPriceConsent') {
                if (data?.price?.value === 100500 && data?.price?.currencyCode === 'gbp') {
                    mock.success();
                } else {
                    mock.fail({
                        category: 'client',
                        code: 'InvalidPriceConsent',
                        message: 'Mismatching price provided in consent'
                    });
                }
            }
        });
    });
    afterEach(() => mock.stop());

    describe('correct consent', () => {
        it('results in job success', async () => {
            const client = mock.createClient();
            const job = await client.createJob();
            const [finalPrice] = await job.waitForOutputs('finalPrice');
            assert.deepStrictEqual(finalPrice, {
                price: { value: 100500, currencyCode: 'gbp' }
            });
            await job.submitInput('finalPriceConsent', {
                price: { value: 100500, currencyCode: 'gbp' }
            });
            await job.waitForCompletion();
            assert.strictEqual(job.getState(), JobState.SUCCESS);
        });
    });

    describe('incorrect consent', () => {
        it('results in job fail', async () => {
            try {
                const client = mock.createClient();
                const job = await client.createJob();
                const [finalPrice] = await job.waitForOutputs('finalPrice');
                assert.deepStrictEqual(finalPrice, {
                    price: { value: 100500, currencyCode: 'gbp' }
                });
                await job.submitInput('finalPriceConsent', {
                    price: { value: 200, currencyCode: 'gbp' }
                });
                await job.waitForCompletion();
                throw new Error('UnexpectedSuccess');
            } catch (err) {
                assert.strictEqual(err.name, 'InvalidPriceConsent');
            }
        });
    });

    describe('server error during tracking', () => {

        beforeEach(() => {
            mock.on('getJobEvents', () => {
                const error = new Error('Boom');
                error.name = 'BoomError';
                throw error;
            });
        });

        it('results in JobTrackError', async () => {
            try {
                const client = mock.createClient();
                const job = await client.createJob();
                const [finalPrice] = await job.waitForOutputs('finalPrice');
                assert.deepStrictEqual(finalPrice, {
                    price: { value: 100500, currencyCode: 'gbp' }
                });
                await job.submitInput('finalPriceConsent', {
                    price: { value: 100500, currencyCode: 'gbp' }
                });
                await job.waitForCompletion();
                throw new Error('UnexpectedSuccess');
            } catch (err) {
                assert.strictEqual(err.name, 'JobTrackError');
                assert.strictEqual(err.details.cause.name, 'BoomError');
            }
        });
    });

    describe('server error whilst creating inputs', () => {

        beforeEach(() => {
            mock.on('createJobInput', () => {
                const error = new Error('Boom');
                error.name = 'BoomError';
                throw error;
            });
        });

        it('results in server error', async () => {
            try {
                const client = mock.createClient();
                const job = await client.createJob();
                const [finalPrice] = await job.waitForOutputs('finalPrice');
                assert.deepStrictEqual(finalPrice, {
                    price: { value: 100500, currencyCode: 'gbp' }
                });
                await job.submitInput('finalPriceConsent', {
                    price: { value: 100500, currencyCode: 'gbp' }
                });
                await job.waitForCompletion();
                throw new Error('UnexpectedSuccess');
            } catch (err) {
                assert.strictEqual(err.name, 'BoomError');
            }
        });
    });

});
