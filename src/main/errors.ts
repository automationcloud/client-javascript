import { Exception } from './exception';
import { JobError } from './types';

export class JobNotInitializedError extends Exception {
    constructor() {
        super(`Invalid state: job not yet initialized`);
    }
}

export class JobAlreadyStartedError extends Exception {
    constructor(public details: any = {}) {
        super(`Job is already initialized`);
    }
}

export class JobOutputWaitError extends Exception {
    constructor(public message: string, public details: any = {}) {
        super(message);
    }
}

export class JobWaitError extends Exception {}

export class JobFailedError extends Exception {

    constructor(jobError: JobError | null) {
        super(jobError?.message ?? 'Unknown error');
        this.name = jobError?.code ?? 'UnknownError';
        this.details = {
            category: jobError?.category ?? 'server',
            ... jobError?.details,
        };
    }

}

export class JobTrackError extends Exception {
    constructor(cause: Error) {
        super(`Job tracking failed: ${cause.message}`);
        this.details = { cause };
    }
}
