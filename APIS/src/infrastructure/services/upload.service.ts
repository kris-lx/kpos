// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Image Upload Service (Cloudinary SDK v2)
// Supports single & multi file uploads via base64 or buffer
// ═══════════════════════════════════════════════════════════════════════════

import { v2 as cloudinary } from 'cloudinary';
import { cloudinaryConfig } from '@/config/cloudinary.config';

// Configure Cloudinary SDK
if (cloudinaryConfig.isConfigured) {
    cloudinary.config({
        cloud_name: cloudinaryConfig.cloudName,
        api_key: cloudinaryConfig.apiKey,
        api_secret: cloudinaryConfig.apiSecret,
        secure: true,
    });
}

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
    resourceType?: 'image' | 'video' | 'raw' | 'auto';
    /** Original filename from the client — when given, the asset is stored under this
     *  name (sanitized) instead of a Cloudinary-generated random public_id. */
    originalFilename?: string;
}

class UploadService {
    private isConfigured(): boolean {
        return cloudinaryConfig.isConfigured;
    }

    /**
     * Detect MIME type from a base64 data URI prefix.
     * Returns a sensible default if detection fails.
     */
    private detectMimeType(data: string): string {
        if (data.startsWith('data:')) {
            const match = data.match(/^data:([^;]+);/);
            if (match) return match[1];
        }
        return 'application/octet-stream';
    }

    /**
     * Determine the Cloudinary resource_type from a MIME type.
     */
    private resolveResourceType(mime: string): 'image' | 'video' | 'raw' {
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'video';
        return 'raw'; // PDF, Word, Excel, etc.
    }

    /**
     * Infer a data URI prefix from the file extension hint or raw base64.
     */
    private inferDataUri(base64: string): string {
        // Try to detect common base64 magic bytes
        const head = base64.slice(0, 20);
        if (head.startsWith('JVBERi0')) return 'data:application/pdf;base64,';
        if (head.startsWith('/9j/'))    return 'data:image/jpeg;base64,';
        if (head.startsWith('iVBORw'))  return 'data:image/png;base64,';
        if (head.startsWith('R0lGOD')) return 'data:image/gif;base64,';
        if (head.startsWith('UklGR'))  return 'data:image/webp;base64,';
        if (head.startsWith('AAAA'))   return 'data:video/mp4;base64,';
        if (head.startsWith('UEsDB'))  return 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,';
        return 'data:application/octet-stream;base64,';
    }

    /**
     * Turn an original filename into a safe Cloudinary public_id.
     * `keepExtension` matters for resource_type 'raw' (Cloudinary doesn't append a
     * format there, unlike image/video), so raw uploads keep their extension.
     */
    private sanitizePublicId(filename: string, keepExtension: boolean): string {
        const dot = filename.lastIndexOf('.');
        const hasExt = dot > 0 && dot < filename.length - 1;
        const base = hasExt && !keepExtension ? filename.slice(0, dot) : filename;
        const cleaned = base
            .normalize('NFKD')
            .replace(/[^\w.\-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^[_.]+|[_.]+$/g, '')
            .slice(0, 120);
        return cleaned || 'file';
    }

    async uploadSingle(
        fileData: string | Buffer,
        options: UploadOptions = {}
    ): Promise<UploadResult> {
        if (!this.isConfigured()) {
            throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env');
        }

        const folder = options.folder || cloudinaryConfig.folder;

        // Prepare the file string for Cloudinary
        let file: string;
        if (typeof fileData === 'string') {
            file = fileData.startsWith('data:') ? fileData : `${this.inferDataUri(fileData)}${fileData}`;
        } else {
            file = `${this.inferDataUri(fileData.toString('base64').slice(0, 20))}${fileData.toString('base64')}`;
        }

        // Detect mime and resolve resource type
        const mime = this.detectMimeType(file);
        const resourceType = options.resourceType || this.resolveResourceType(mime);
        const isImageType = resourceType === 'image';

        // Build transformation (only for images)
        const transformation: Record<string, unknown>[] = [];
        if (isImageType) {
            if (options.maxWidth || options.maxHeight) {
                transformation.push({
                    width: options.maxWidth,
                    height: options.maxHeight,
                    crop: 'limit',
                });
            }
            transformation.push({
                quality: options.quality || 'auto',
                fetch_format: 'auto',
            });
        }

        const publicId = options.originalFilename
            ? this.sanitizePublicId(options.originalFilename, resourceType === 'raw')
            : undefined;

        const result = (await cloudinary.uploader.upload(file, {
            folder,
            ...(publicId ? { public_id: publicId, overwrite: true } : {}),
            ...(isImageType && transformation.length > 0 ? { transformation } : {}),
            resource_type: resourceType,
        })) as any;

        return {
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width || 0,
            height: result.height || 0,
            format: result.format,
            bytes: result.bytes,
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

        try {
            const result = await cloudinary.uploader.destroy(publicId);
            return result.result === 'ok';
        } catch {
            return false;
        }
    }

    generateUrl(publicId: string, options: { width?: number; height?: number; crop?: string; quality?: number } = {}): string {
        return cloudinary.url(publicId, {
            secure: true,
            width: options.width,
            height: options.height,
            crop: options.crop || 'fill',
            quality: options.quality || 'auto',
            fetch_format: 'auto',
        });
    }
}

export const uploadService = new UploadService();
export { cloudinary };
