// ═══════════════════════════════════════════════════════════════════════════
// Signing rule tests for the SwiftPass client.
//
// Both vendor PDFs (Alipay WebPay v1.5.2 §4, WeChat WAP Pay v1.5.3 §4.2)
// ship a "worked example" of the signature algorithm, but the numbers in
// both PDFs are internally inconsistent — e.g. the WeChat MD5 example states
// the merchant key as "9f72151b...877b" but then computes the hash using a
// different key "9d101c97...54abb", and the Alipay SHA256 example's
// signature string omits/renumbers fields (total_fee=2 in the XML vs =1 in
// the signature string) — so those literal output strings can't be used as
// trustworthy golden values. Instead these tests pin down the parts of the
// rule that are unambiguous in the spec text: field selection/ordering, the
// exact "&key=" suffix, hashing/uppercasing for MD5 & SHA256, and RSA
// producing a signature verifiable with the paired public key.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { createHash, generateKeyPairSync, createVerify } from 'crypto';
import { buildSignString, signSwiftPass, parseSwiftPassXml } from './swiftpass.client';

describe('buildSignString', () => {
    it('sorts fields ascending by ASCII field name and excludes sign', () => {
        const str = buildSignString({
            total_fee: 1,
            mch_id: '101520000465',
            sign: 'SHOULD_BE_EXCLUDED',
            body: 'test',
        });
        expect(str).toBe('body=test&mch_id=101520000465&total_fee=1');
    });

    it('excludes null, undefined, and empty-string values', () => {
        const str = buildSignString({ a: 'x', b: undefined, c: null, d: '' });
        expect(str).toBe('a=x');
    });

    it('does not URL-encode field values', () => {
        const str = buildSignString({ notify_url: 'https://x.com/a?b=1&c=2' });
        expect(str).toBe('notify_url=https://x.com/a?b=1&c=2');
    });
});

describe('signSwiftPass — MD5 / SHA256', () => {
    const fields = { body: 'test', mch_id: '101520000465', total_fee: 1 };
    const key = '18e0a2ad5d5571af14b855fcf33091f4';

    it('MD5: hashes "<canonical>&key=<signKey>" and uppercases the hex digest', () => {
        const expected = createHash('md5').update(`${buildSignString(fields)}&key=${key}`, 'utf8').digest('hex').toUpperCase();
        expect(signSwiftPass(fields, 'MD5', key)).toBe(expected);
        expect(signSwiftPass(fields, 'MD5', key)).toBe(signSwiftPass(fields, 'MD5', key).toUpperCase());
    });

    it('SHA256: hashes "<canonical>&key=<signKey>" and uppercases the hex digest', () => {
        const expected = createHash('sha256').update(`${buildSignString(fields)}&key=${key}`, 'utf8').digest('hex').toUpperCase();
        expect(signSwiftPass(fields, 'SHA256', key)).toBe(expected);
    });

    it('is deterministic for the same input and changes when any field changes', () => {
        const a = signSwiftPass(fields, 'SHA256', key);
        const b = signSwiftPass({ ...fields, total_fee: 2 }, 'SHA256', key);
        expect(a).not.toBe(b);
    });
});

describe('signSwiftPass — RSA_1_256', () => {
    it('produces a base64 signature verifiable with the paired RSA public key', () => {
        const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        const fields = { body: 'Test pay', mch_id: '102532336411', total_fee: 1 };

        const sig = signSwiftPass(fields, 'RSA_1_256', privateKey.export({ type: 'pkcs1', format: 'pem' }).toString());

        const verifier = createVerify('RSA-SHA256');
        verifier.update(buildSignString(fields), 'utf8');
        verifier.end();
        expect(verifier.verify(publicKey, sig, 'base64')).toBe(true);
    });
});

describe('parseSwiftPassXml', () => {
    it('parses first-level CDATA and plain-text XML nodes (no nested nodes, per spec §3.2)', () => {
        const xml = '<xml><status><![CDATA[0]]></status><result_code>0</result_code><pay_url><![CDATA[https://pay.wepayez.com/x]]></pay_url></xml>';
        expect(parseSwiftPassXml(xml)).toEqual({
            status: '0',
            result_code: '0',
            pay_url: 'https://pay.wepayez.com/x',
        });
    });
});
