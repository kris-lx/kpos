// ═══════════════════════════════════════════════════════════════════════════
// SwiftPass gateway client — shared by Alipay WebPay and WeChat WAP Pay.
// Both ride the same gateway (https://gateway.wepayez.com/pay/gateway), same
// XML request/response/notify shape, signed the same way. Only the `service`
// value and the response field name (pay_url vs pay_info) differ.
//
// Signing rule (SwiftPass Alipay WebPay spec v1.5.2 §4, WeChat WAP Pay spec
// v1.5.3 §4): all fields except `sign`, ascending ASCII order by field name,
// joined as key=value&key=value (null/empty values excluded, no URL-encoding),
// then:
//   MD5 / SHA256:  HASH(fieldString + "&key=" + signKey).toUpperCase()
//   RSA_1_256:     base64(RSA-SHA256 sign fieldString with the merchant's RSA private key)
// ═══════════════════════════════════════════════════════════════════════════

import { createHash, createSign, timingSafeEqual } from 'crypto';
import type { SwiftPassConfig, SwiftPassSignType } from '../../domain/types';

export const SWIFTPASS_GATEWAY_URL = 'https://gateway.wepayez.com/pay/gateway';

export const SWIFTPASS_SERVICE = {
    swiftpass_alipay: 'pay.alipay.webpay.intl',
    swiftpass_wechat: 'pay.weixin.wap.intl',
} as const;

// Field name of the payment redirect link in the response — differs by provider generation.
const PAY_LINK_FIELDS = ['pay_url', 'pay_info'] as const;

export function buildSignString(fields: Record<string, string | number | undefined | null>): string {
    return Object.keys(fields)
        .filter((k) => k !== 'sign' && fields[k] !== undefined && fields[k] !== null && fields[k] !== '')
        .sort()
        .map((k) => `${k}=${fields[k]}`)
        .join('&');
}

export function signSwiftPass(
    fields: Record<string, string | number | undefined | null>,
    signType: SwiftPassSignType,
    signKey: string,
): string {
    const base = buildSignString(fields);
    if (signType === 'RSA_1_256') {
        const signer = createSign('RSA-SHA256');
        signer.update(base, 'utf8');
        signer.end();
        return signer.sign(signKey, 'base64');
    }
    const toHash = `${base}&key=${signKey}`;
    const algo = signType === 'MD5' ? 'md5' : 'sha256';
    return createHash(algo).update(toHash, 'utf8').digest('hex').toUpperCase();
}

function toXml(fields: Record<string, string | number | undefined | null>): string {
    const body = Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`)
        .join('');
    return `<xml>${body}</xml>`;
}

// Minimal first-level-only XML parser — SwiftPass XML has no nested nodes (spec §3.2).
export function parseSwiftPassXml(xml: string): Record<string, string> {
    const result: Record<string, string> = {};
    const tagRe = /<(\w+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/\1>/g;
    let match: RegExpExecArray | null;
    while ((match = tagRe.exec(xml)) !== null) {
        result[match[1]] = match[2] !== undefined ? match[2] : match[3];
    }
    return result;
}

export interface SwiftPassCreateOrderParams {
    outTradeNo: string;
    amountMinorUnits: number; // integer, minimal unit of the currency (no decimals)
    body: string;
    notifyUrl: string;
    callbackUrl: string;
    mchCreateIp: string;
}

export interface SwiftPassCreateOrderResult {
    payLink: string;
    raw: Record<string, string>;
}

export async function createSwiftPassOrder(
    provider: 'swiftpass_alipay' | 'swiftpass_wechat',
    config: SwiftPassConfig,
    params: SwiftPassCreateOrderParams,
): Promise<SwiftPassCreateOrderResult> {
    const fields: Record<string, string | number | undefined> = {
        service: SWIFTPASS_SERVICE[provider],
        version: '2.0',
        charset: 'UTF-8',
        sign_type: config.signType,
        mch_id: config.mchId,
        out_trade_no: params.outTradeNo,
        device_info: config.deviceInfo,
        body: params.body,
        total_fee: params.amountMinorUnits,
        mch_create_ip: params.mchCreateIp,
        notify_url: params.notifyUrl,
        callback_url: params.callbackUrl,
        nonce_str: Date.now().toString(),
    };
    fields.sign = signSwiftPass(fields, config.signType, config.signKey);

    const res = await fetch(SWIFTPASS_GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: toXml(fields),
    });
    const raw = parseSwiftPassXml(await res.text());

    if (raw.status !== '0' || raw.result_code !== '0') {
        throw new Error(raw.err_msg || raw.message || 'SwiftPass gateway returned an error');
    }
    const payLinkField = PAY_LINK_FIELDS.find((f) => raw[f]);
    if (!payLinkField) throw new Error('SwiftPass response did not include a payment link');

    return { payLink: raw[payLinkField], raw };
}

export interface SwiftPassNotifyVerification {
    valid: boolean;
    fields: Record<string, string>;
}

function timingSafeStringEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

export function verifySwiftPassNotify(xml: string, config: SwiftPassConfig): SwiftPassNotifyVerification {
    const fields = parseSwiftPassXml(xml);
    const expectedSign = signSwiftPass(fields, (fields.sign_type as SwiftPassSignType) || config.signType, config.signKey);
    return { valid: Boolean(fields.sign) && timingSafeStringEqual(expectedSign, fields.sign), fields };
}
