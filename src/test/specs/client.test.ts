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
/* eslint-disable @typescript-eslint/ban-ts-comment */

import assert from 'assert';
import { AcApi } from '../../main/ac-api';
import sinon from 'sinon';
import { RequestConfig } from '@automationcloud/request';
import { Client } from '../../main';

describe('Client', () => {
    let RequestMock: sinon.SinonSpy;
    beforeEach(() => {
        RequestMock = sinon.spy();
        // @ts-ignore private member stub
        sinon.stub(AcApi.prototype, 'getRequestClass').returns(RequestMock);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('passes the config to Request', async () => {
        const requestConfig: Partial<RequestConfig> = {
            retryAttempts: 0,
        };
        const _ = new Client({
            requestConfig,
            serviceId: '123',
            auth: '123',
        });
        assert(RequestMock.calledWithNew, 'calledWithNew');
        assert(RequestMock.calledWithMatch({ ...requestConfig }), 'config passed');
    });
});
