import { AuthAgent, BasicAuthAgent, NoAuthAgent, OAuth2Agent, Request, RequestSpec } from '@automationcloud/request';

import { ClientConfig } from './types';

export class AcRequest extends Request {

    static create(config: ClientConfig, baseUrl: string): AcRequest {
        const auth = this.createAuthAgent(config);
        return new AcRequest({
            baseUrl,
            auth,
            retryAttempts: config.requestRetryCount,
            retryDelay: config.requestRetryDelay,
            headers: config.additionalHeaders ?? {},
        });
    }

    static createAuthAgent(config: ClientConfig): AuthAgent {
        const auth = config.auth;
        if (!auth) {
            return new NoAuthAgent();
        }
        if (typeof auth === 'string') {
            return new BasicAuthAgent({ username: auth });
        }
        return new OAuth2Agent({
            clientId: auth.clientId,
            clientSecret: auth.clientSecret,
            tokenUrl: config.apiTokenUrl,
        });
    }

    protected async createErrorFromResponse(requestSpec: RequestSpec, res: Response): Promise<Error> {
        if (res.headers.get('content-type')?.startsWith('application/json')) {
            const json = await res.json();
            if (json.name && json.message) {
                const error = new Error(json.message) as any;
                error.name = json.name;
                error.code = json.code;
                error.details = json.details;
                return error;
            }
        }
        return super.createErrorFromResponse(requestSpec, res);
    }
}
