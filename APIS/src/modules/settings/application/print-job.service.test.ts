import { describe, expect, it } from 'vitest';
import net from 'node:net';
import { decodePrintPayload, isPrivatePrinterAddress, sendRawPrinterPayload } from './print-job.service';

describe('print-job network boundary', () => {
    it('accepts private and loopback printer addresses', () => {
        expect(isPrivatePrinterAddress('192.168.1.50')).toBe(true);
        expect(isPrivatePrinterAddress('10.20.30.40')).toBe(true);
        expect(isPrivatePrinterAddress('172.16.0.1')).toBe(true);
        expect(isPrivatePrinterAddress('172.31.255.254')).toBe(true);
        expect(isPrivatePrinterAddress('127.0.0.1')).toBe(true);
        expect(isPrivatePrinterAddress('fd00::50')).toBe(true);
    });

    it('rejects public addresses and hostnames to prevent arbitrary TCP access', () => {
        expect(isPrivatePrinterAddress('8.8.8.8')).toBe(false);
        expect(isPrivatePrinterAddress('172.32.0.1')).toBe(false);
        expect(isPrivatePrinterAddress('printer.example.com')).toBe(false);
        expect(isPrivatePrinterAddress('')).toBe(false);
    });
});

describe('print payload validation', () => {
    it('decodes a valid base64 printer payload', () => {
        expect(decodePrintPayload(Buffer.from('KPOS').toString('base64')).toString()).toBe('KPOS');
    });

    it('rejects empty, malformed, and oversized payloads', () => {
        expect(() => decodePrintPayload('')).toThrow('Invalid printer payload');
        expect(() => decodePrintPayload('not base64!')).toThrow('Invalid printer payload');
        const oversized = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
        expect(() => decodePrintPayload(oversized)).toThrow('exceeds 5 MB');
    });
});

describe('raw network transport', () => {
    it('delivers the exact printer bytes to a private TCP endpoint', async () => {
        const server = net.createServer();
        const received = new Promise<Buffer>((resolve) => {
            server.once('connection', (socket) => {
                const chunks: Buffer[] = [];
                socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                socket.on('end', () => resolve(Buffer.concat(chunks)));
            });
        });
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });

        try {
            const address = server.address();
            if (!address || typeof address === 'string') throw new Error('Missing TCP test address');
            const payload = Buffer.from([0x1b, 0x40, 0x4b, 0x50, 0x4f, 0x53]);
            await sendRawPrinterPayload('127.0.0.1', address.port, payload);
            expect(await received).toEqual(payload);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});
