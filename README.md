# Automation Cloud API Client

**Status: beta (public interfaces are settled, but details may change)**

- Official JavaScript/TypeScript client library for Automation Cloud API.
- Works in NodeJS 12+ and latest browser environments.
- Full TypeScript support.

## Usage

### Prerequisites

- Sign up for Automation Cloud account.
- Create a Service in AC Dashboard and publish a script to it from Autopilot.
- Create an Application in Dashboard to obtain authentication details.
- `npm i @automationcloud/client`

### Quick start

```ts
import { Client } from '@automationcloud/client';

// Create an Client instance
const client = new Client({
    serviceId: 'service-uuid-from-dashboard',
    auth: 'app-secret-key',
});

// Create a new job
const job = await client.createJob({
    input: { ... }
});

// Wait for script to emit outputs
const [output1, output2] = await job.waitForOutputs('output1', 'output2');

// Wait for completion
await job.waitForCompletion();
```

Please refer to [Robot School](https://robotschool.dev/) to learn more about scripting.

## Job

Job is a high level abstraction that allows you to think about your automations in terms of inputs, outputs and state updates.

### Creating the job

```ts
const job = await client.createJob({
    category: 'test' | 'live', // optional, used to filter test jobs in dashboard
    input: {                   // optional, starts the job with pre-supplied inputs
        foo: { arbitrary: 'data' }
    },
});
```

Job runs immediately after creation.

Note: it is not required to pre-supply all inputs that script expects. Whenever script uses an input that hasn't been provided, it will produce an `awaitingInput` event and will only continue once the requested input is submitted. See [deferred inputs](#deferred-inputs) for more information.

### Waiting for completion

The Job instance tracks lifecycle events up to the point when the job is either finished successfully or failed with an error. `waitForCompletion` resolves or rejects when the tracking is over.

```ts
await job.waitForCompletion();
// The promise is resolved once the job reaches a `success` state
// (e.g. a `success` context is reached).
// The promise is rejected if the error occurs.
```

**Note**: always make sure to include `await job.waitForCompletion()` to prevent dangling promises or unhandled promise rejections.

### Waiting for outputs

Outputs provide a mechanism to receive the results that script produces. This can be the results of web page scraping, or collected options, or any other information retrieved by the script.

Job offers a convenient way of waiting for the outputs you expect from your script:

```ts
// The promise will resolve once all specified outputs are emitted by script
const [products, deliveryOptions] = await job.waitForOutputs('products', 'deliveryOptions');
```

In other scenarios it might be more practical to use event-based API to get notified when a particular output is emitted:

```ts
job.onOutput('myOutputKey', async () => {

});
```

### Deferred inputs

Inputs provide a mechanism of passing the information to the script.

Some inputs are known upfront so it makes sense to specify them when [the job is created](#creating-the-job).

Other inputs cannot be pre-supplied. For example, the website may ask its users to select a delivery option — in such case the script would first collect the available options and emit them as an output and subsequently request the selected option via an input.

```ts
job.onAwaitingInput('selectedDeliveryOption', async () => {
    // Callback is asynchronous, so you can fetch data from database,
    // send http requests or obtain job outputs.
    return { option: 3 };
});
```

A special `*` key can be used to subscribe to all requested inputs with a single handler:

```ts
job.onAwaitingInput('*', requestedInputKey => {
    // ...
});
```

If the handler doesn't return a value, the input is not submitted:

```ts
job.onAwaitingInput('selectedDeliveryOption', () => {
    // No return, so input submission does not occur
});
```

Inputs can also be submitted individually at any point in time whilst the job is still running:

```ts
await job.submitInput('selectedDeliveryOption', { option: 3 });
```

### Events

You can also subscribe to various job lifecycle events.

```ts
job.onSuccess(async () => { ... });
job.onFail(async err => { ...});
job.onOutput(outputKey, async outputData => { ... });
job.onAnyOutput(async (outputKey, outputData) => { ... });
job.onStateChanged(async newState => { ... });
```

To unsubscribe for event:

```ts
const unsubscribe = job.onSuccess(() => { ... });
// ...
unsubscribe();
```

Note 1: All callbacks are asynchronous. Exception thrown inside a callback will result in an unhandled rejection.

Note 2: It is advisable to not depend on the order of the events, because they can vary between different engine versions, between scripts and even within one script (i.e. depending on some script logic).

Note 3: As with all event-based APIs it is possible to miss the event if the subscription is done after the event has already emitted.

### Use in Browser

Automation Cloud Client Library can be used in a browser with one limitation: you cannot use Automation Cloud credentials (e.g. App Secret Key obtained from dashboard), because this would mean exposing these secrets to the outside world.

Example:

```ts
// Backend

post('/booking', async (req, res) => {
    const client = new Client({
        serviceId: '<uuid>',        // grab from AC dashboard
        auth: '<app secret key>',   // grab from AC dashboard
        autoTrack: false,           // Note: this prevents job tracking on backend
    });
    const job = await client.createJob(/* ... */);
    const accessToken = await job.getAccessToken();
    res.send({
        serviceId,
        jobId: job.jobId,
        accessToken,
    });
});

// Frontend

const res = await fetch('/booking', /*...*/);
const { serviceId, jobId, accessToken } = await res.json();
const client = new Client({ serviceId, auth: accessToken });
const job = await client.getJob(jobId);
// Proceed working with job safely
await job.waitForCompletion();
```

## License

See [LICENSE](LICENSE.md).
