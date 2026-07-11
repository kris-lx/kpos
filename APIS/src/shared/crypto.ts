// ═══════════════════════════════════════════════════════════════════════════
// AES-256-GCM encrypt/decrypt for config blobs stored in JSONB columns
// (email provider credentials, etc). Uses a dedicated key, not JWT_SECRET,
// so a JWT secret rotation/compromise can't be conflated with config secrecy.
// ═══════════════════════════════════════════════════════════════════════════

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
    const secret = process.env.CONFIG_ENCRYPTION_KEY;
    if (!secret) {
        throw new Error('CONFIG_ENCRYPTION_KEY is not set — required to encrypt/decrypt stored provider credentials');
    }
    return scryptSync(secret, 'kpos-config-encryption', 32);
}

// Returns "iv:authTag:ciphertext" (all hex) — a single string safe to store in a jsonb/text column
export function encryptConfig(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptConfig(payload: string): string {
    const [ivHex, authTagHex, ciphertextHex] = payload.split(':');
    if (!ivHex || !authTagHex || !ciphertextHex) throw new Error('Malformed encrypted config payload');
    const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
    return plaintext.toString('utf8');
}

export function encryptJson(obj: Record<string, unknown>): string {
    return encryptConfig(JSON.stringify(obj));
}

export function decryptJson<T = Record<string, unknown>>(payload: string): T {
    return JSON.parse(decryptConfig(payload));
}
