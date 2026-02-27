// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Image Upload Service (Cloudinary)
// Supports single & multi file uploads via base64 or buffer
// ═══════════════════════════════════════════════════════════════════════════

import { cloudinaryConfig } from '@/config/cloudinary.config';

export interface UploadResult {
    url: string;
    publicId: string;
    width: number;
    height: number;
    format: string;
    bytes: number;
}

export interface UploadOptions {
    folder?: string;
    transformation?: string;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
}

const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`;

function buildTransformation(opts: UploadOptions): string {
    const parts: string[] = [];
    if (opts.maxWidth) parts.push(`w_${opts.maxWidth}`);
    if (opts.maxHeight) parts.push(`h_${opts.maxHeight}`);
    if (parts.length > 0) parts.push('c_limit');
    parts.push(`q_${opts.quality || 80}`);
    parts.push('f_auto');
    return parts.join(',');
}

function generateSignature(params: Record<string, string>, apiSecret: string): string {
    const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
    // Use Node.js crypto for SHA-1
    const crypto = require('crypto');
    return crypto.createHash('sha1').update(sorted + apiSecret).digest('hex');
}

class UploadService {
    private isConfigured(): boolean {
        return cloudinaryConfig.isConfigured;
    }

    async uploadSingle(
        fileData: string | Buffer,
        options: UploadOptions = {}
    ): Promise<UploadResult> {
        if (!this.isConfigured()) {
            throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env');
        }

        const folder = options.folder || cloudinaryConfig.folder;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const transformation = buildTransformation(options);

        const params: Record<string, string> = {
            folder: folder!,
            timestamp,
            transformation,
        };

        const signature = generateSignature(params, cloudinaryConfig.apiSecret!);

        // Build form data
        const formData = new FormData();

        if (typeof fileData === 'string') {
            // Base64 string (with or without data URI prefix)
            const base64 = fileData.startsWith('data:')
                ? fileData
                : `data:image/png;base64,${fileData}`;
            formData.append('file', base64);
        } else {
            // Buffer — convert to base64
            const base64 = `data:image/png;base64,${fileData.toString('base64')}`;
            formData.append('file', base64);
        }

        formData.append('api_key', cloudinaryConfig.apiKey!);
        formData.append('timestamp', timestamp);
        formData.append('signature', signature);
        formData.append('folder', folder!);
        formData.append('transformation', transformation);

        const response = await fetch(CLOUDINARY_API_URL, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Cloudinary upload failed: ${response.status} ${errorBody}`);
        }

        const data = await response.json() as any;

        return {
            url: data.secure_url,
            publicId: data.public_id,
            width: data.width,
            height: data.height,
            format: data.format,
            bytes: data.bytes,
        };
    }

    async uploadMultiple(
        files: Array<{ data: string | Buffer; options?: UploadOptions }>,
        defaultOptions: UploadOptions = {}
    ): Promise<UploadResult[]> {
        const results: UploadResult[] = [];

        for (const file of files) {
            const opts = { ...defaultOptions, ...file.options };
            const result = await this.uploadSingle(file.data, opts);
            results.push(result);
        }

        return results;
    }

    async deleteImage(publicId: string): Promise<boolean> {
        if (!this.isConfigured()) return false;

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const params: Record<string, string> = {
            public_id: publicId,
            timestamp,
        };

        const signature = generateSignature(params, cloudinaryConfig.apiSecret!);

        const DESTROY_URL = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/destroy`;

        const formData = new FormData();
        formData.append('public_id', publicId);
        formData.append('api_key', cloudinaryConfig.apiKey!);
        formData.append('timestamp', timestamp);
        formData.append('signature', signature);

        const response = await fetch(DESTROY_URL, { method: 'POST', body: formData });
        if (!response.ok) return false;

        const data = await response.json() as any;
        return data.result === 'ok';
    }
}

export const uploadService = new UploadService();
