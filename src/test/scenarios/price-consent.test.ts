import { AcMock } from '../ac-mock';
import assert from 'assert';
import { JobState } from '../../main';

describe('Scenario: Price Consent', () => {
    const mock = new AcMock();

    beforeEach(() => mock.start());
    beforeEach(() => {
        mock.on('createJob', () => {
            mock.addOutput('finalPrice', {
                price: { value: 100500, currencyCode: 'gbp' },
            });
            mock.requestInput('finalPriceConsent');
        });
        mock.on('createInput', ({ key, data }) => {
            if (key === 'finalPriceConsent') {
                if (data?.price?.value === 100500 && data?.price?.currencyCode === 'gbp') {
                    mock.success();
                } else {
                    mock.fail({
                        category: 'client',
                        code: 'InvalidPriceConsent',
                        message: 'Mismatching price provided in consent',
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
                price: { value: 100500, currencyCode: 'gbp' },
            });
            await job.submitInput('finalPriceConsent', {
                price: { value: 100500, currencyCode: 'gbp' },
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
                    price: { value: 100500, currencyCode: 'gbp' },
                });
                await job.submitInput('finalPriceConsent', {
                    price: { value: 200, currencyCode: 'gbp' },
                });
                await job.waitForCompletion();
                throw new Error('UnexpectedSuccess');
            } catch (err) {
                assert.strictEqual(err.name, 'InvalidPriceConsent');
            }
        });
    });
});

describe('Scenario: instant ServerError', () => {
    const mock = new AcMock();

    beforeEach(() => {
        mock.start();
    });
    afterEach(() => {
        mock.stop();
        process.removeListener('unhandledRejection', process.listeners('unhandledRejection')[0]);
    });

    describe('server error', function () {
        // TOOD debug only
        this.timeout(0);

        it('results in JobFailMissingOutputs', async () => {
            process.addListener('unhandledRejection', () => {
                throw new Error('unhandledRejection');
            });
            try {
                const client = mock.createClient();
                client.config.pollInterval = 0;
                const job = await client.createJob();
                mock.addEvent('fail');
                const [finalPrice] = await job.waitForOutputs('finalPrice');
                assert.deepStrictEqual(finalPrice, {
                    price: { value: 100500, currencyCode: 'gbp' },
                });
                await job.submitInput('finalPriceConsent', {
                    price: { value: 100500, currencyCode: 'gbp' },
                });
                await job.waitForCompletion();
                throw new Error('UnexpectedSuccess');
            } catch (err) {
                assert.strictEqual(err.name, 'JobFailMissingOutputs');
            }
        });
    });
});
