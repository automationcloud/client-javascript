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

import { Request } from '@automationcloud/request';

import { AcRequest } from './ac-request';
import { Client } from './client';

/**
 * Vault is used to store sensitive information like payment card number (PAN).
 *
 * The typical usage involves:
 *
 * - obtaining a one-time password: `const otp = await client.vault.createOtp()`
 * - putting the card number into the vault: `const panToken = await client.vault.createPanToken(pan, otp)`;
 * - using the obtained token as part of Job input
 */
export class Vault {
    protected request: Request;

    constructor(protected client: Client) {
        const { config } = this.client;
        this.request = AcRequest.create(config, config.vaultUrl);
    }

    /**
     * Creates one time password (OTP) which can subsequently be used to put data to vault.
     */
    async createOtp(): Promise<string> {
        const { id } = await this.request.post('/otp');
        return id;
    }

    /**
     * Exchanges payment card number (PAN) to a pan token which can be safely passed around
     * (i.e. used as part of inputs).
     *
     * If `otp` is not provided, it will be automatically created.
     */
    async createPanToken(pan: string, existingOtp?: string): Promise<string> {
        const otp = existingOtp ?? await this.createOtp();
        const { panToken } = await this.request.post('/pan', {
            body: { otp, pan },
        });
        return panToken;
    }

    /**
     * Stores specified `data` in Automation Cloud Vault, returning an opaque token
     * that can be used in place of any data inside Job Inputs.
     */
    async createDataToken(data: any, existingOtp?: string): Promise<any> {
        const otp = existingOtp ?? await this.createOtp();
        const { token } = await this.request.post('/data', {
            body: { otp, data },
        });
        return { $token: token };
    }

    /**
     * Constructs a payment iframe URL hosted by Automation Cloud Vault.
     *
     * See https://docs.automationcloud.net/docs/vaulting-payment-card for more information
     *
     * @param otp one-time password, must be obtained via `await client.vault.createOtp()`
     * @param options iframe customization options, see {@link PaymentIframeOptions} for more info
     */
    getPaymentIframeUrl(otp: string, options: PaymentIframeOptions = {}): string {
        const qs = [
            ['otp', otp],
            ['css', options.cssUrl],
            ['name', options.name],
            ['fields', options.fields?.map(fieldToString).join(',')],
            ['brands', options.brands?.join(',')],
            ['validateOnInput', options.validateOnInput === true ? 'on' : undefined],
        ].filter(_ => _[1] != null);
        const baseUrl = options.iframeUrl ?? 'https://vault.automationcloud.net/forms/index.html';
        return baseUrl + '?' + qs.map(_ => `${_[0]}=${encodeURIComponent(_[1] ?? '')}`).join('&');
    }

    /**
     * Constructs a single input iframe URL hosted by Automation Cloud Vault.
     *
     * @param otp one-time password, must be obtained via `await client.vault.createOtp()`
     * @param options iframe customization options, see {@link SingleInputIframeOptions} for more info
     */
    getSingleInputIframeUrl(otp: string, options: SingleInputIframeOptions = {}): string {
        const qs = [
            ['otp', otp],
            ['css', options.cssUrl],
            ['inputType', options.inputType],
            ['pattern', options.pattern],
            ['minlength', options.minlength],
            ['maxlength', options.maxlength],
            ['required', options.required],
            ['validateOnInput', options.validateOnInput === true ? 'on' : undefined],
        ].filter(_ => _[1] != null);
        const baseUrl = options.iframeUrl ?? 'https://vault.automationcloud.net/forms/single-input.html';
        return baseUrl + '?' + qs.map(_ => `${_[0]}=${encodeURIComponent(_[1] ?? '')}`).join('&');
    }
}

/**
 * Additional configuration of secure payment iframe.
 * See https://docs.automationcloud.net/docs/vaulting-payment-card for more info.
 */
export interface PaymentIframeOptions {
    /**
     * The URL of payment iframe. Default: `https://vault.automationcloud.net/forms/index.html`
     */
    iframeUrl?: string;

    /**
     * The CSS to use. Default: `https://vault.automationcloud.net/forms/index.css`
     */
    cssUrl?: string;

    /**
     * If specified, restricts the rendered fields.
     * Additionally, field labels and placeholders can be customized as per
     * https://docs.automationcloud.net/docs/vaulting-payment-card#customised-label-and-placeholder
     *
     * Default: `['pan', 'name', 'expiry-select', 'cvv']`
     */
    fields?: PaymentIframeField[];

    /**
     * If specifies, restrict the choice of card brands.
     *
     * Default: `['visa', 'mastercard', 'amex', 'discover']`
     */
    brands?: PaymentIframeBrand[];

    /**
     * If specified, the "name" form field will be pre-filled with specified value.
     */
    name?: string

    /**
     * If enabled, the iframe will emit validation events for each field using `vault.validation` messages.
     * See https://docs.automationcloud.net/docs/vaulting-payment-card#validateoninput-optional for more info.
     *
     * Default: `false`
     */
    validateOnInput?: boolean;
}

export type PaymentIframeField = PaymentIframeFieldName | PaymentIframeCustomizedField;
export type PaymentIframeFieldName = 'name' | 'pan' | 'expiry' | 'expiry-yy' | 'expiry-select' | 'cvv';
export type PaymentIframeBrand = 'visa' | 'mastercard' | 'amex' | 'discover';
export interface PaymentIframeCustomizedField {
    name: PaymentIframeFieldName;
    label: string;
    placeholder: string;
}

function fieldToString(field: PaymentIframeField): string {
    if (typeof field === 'string') {
        return field;
    }
    return [field.name, field.label, field.placeholder]
        .map(_ => _.replace(/_/g, ''))
        .join('_');
}


/**
 * Additional configuration of single input iframe.
 */
export interface SingleInputIframeOptions {
    /**
     * The URL of payment iframe. Default: `https://vault.automationcloud.net/forms/single-input.html`
     */
    iframeUrl?: string;

    /**
     * The CSS to use.
     */
    cssUrl?: string;

    /**
     * If enabled, the iframe will emit validation events for each field using `vault.validation` messages.
     *
     * Default: `false`
     */
    validateOnInput?: boolean;

    /**
     * Set the type of input to text or password.
     *
     * default: `text`
     */
    inputType?: 'text' | 'password';

    /**
     * The regular expression the form control's value should match
     * See https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/pattern
     */
    pattern?: string; // regexp for input field

    /**
     * The minimum length of the input - non integer values will be ignored.
     * See https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/minlength
     */
    minlength?: number;

    /**
     * The maximum length of the input - non integer values will be ignored.
     * See https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/maxlength
     */
    maxlength?: number;

    /**
     * If set to true, the input will be mandatory. (adding required attribute)
     * See https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/required
     *
     * default: `false`
     */
    required?: boolean;
}
