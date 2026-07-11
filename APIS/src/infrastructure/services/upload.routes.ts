// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Upload Routes
// POST /upload/single  — Upload single image (base64)
// POST /upload/multi   — Upload multiple images (base64 array)
// DELETE /upload/:publicId — Delete an image
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate } from '@/infrastructure/http/middleware/auth.middleware';
import { uploadService } from './upload.service';
import { z } from 'zod';

export const uploadRoutes = Router();

// Every upload is namespaced under the caller's own tenant server-side — the
// client-supplied `folder` is only ever a cosmetic subfolder underneath that,
// never the whole path. Without this, a client-controlled folder + the
// deterministic public_id derived from originalFilename (upload.service.ts)
// would let any authenticated user overwrite or (via DELETE) destroy another
// tenant's assets by guessing a common folder/filename combination.
export function tenantFolder(tenantId: string, clientFolder?: string): string {
    const cleaned = (clientFolder || '')
        .normalize('NFKD')
        .replace(/[^\w\-/]+/g, '_')
        .replace(/\.\.+/g, '_')
        .replace(/^\/+|\/+$/g, '')
        .slice(0, 100);
    return cleaned ? `tenant/${tenantId}/${cleaned}` : `tenant/${tenantId}`;
}

const SingleUploadSchema = z.object({
    file: z.string().min(1).optional(),
    image: z.string().min(1).optional(),
    filename: z.string().min(1).max(200).optional(),
    folder: z.string().optional(),
    maxWidth: z.number().optional(),
    maxHeight: z.number().optional(),
    quality: z.number().min(1).max(100).optional(),
    resourceType: z.enum(['image', 'video', 'raw', 'auto']).optional(),
}).refine(data => data.file || data.image, { message: 'File data is required (use "file" or "image" field)' });

const MultiUploadSchema = z.object({
    files: z.array(z.string().min(1)).min(1).max(10, 'Maximum 10 files at once').optional(),
    images: z.array(z.string().min(1)).min(1).max(10, 'Maximum 10 files at once').optional(),
    filenames: z.array(z.string().min(1).max(200)).optional(),
    folder: z.string().optional(),
    maxWidth: z.number().optional(),
    maxHeight: z.number().optional(),
    quality: z.number().min(1).max(100).optional(),
    resourceType: z.enum(['image', 'video', 'raw', 'auto']).optional(),
}).refine(data => (data.files && data.files.length > 0) || (data.images && data.images.length > 0), { message: 'Files data is required (use "files" or "images" field)' });

// Upload single image
uploadRoutes.post('/single', authenticate, async (req, res, next) => {
    try {
        const parsed = SingleUploadSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: 'VAL_001', message: 'Validation error', details: parsed.error.flatten() },
            });
        }

        const { file, image, filename, folder, maxWidth, maxHeight, quality, resourceType } = parsed.data;
        const fileData = file || image!;
        const namespace = req.authUser?.tenantId || 'platform';
        const result = await uploadService.uploadSingle(fileData, { folder: tenantFolder(namespace, folder), maxWidth, maxHeight, quality, resourceType, originalFilename: filename });

        res.json({ success: true, data: result });
    } catch (error: any) {
        next(error);
    }
});

// Upload multiple images
uploadRoutes.post('/multi', authenticate, async (req, res, next) => {
    try {
        const parsed = MultiUploadSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: { code: 'VAL_001', message: 'Validation error', details: parsed.error.flatten() },
            });
        }

        const { files: fileList, images, filenames, folder, maxWidth, maxHeight, quality } = parsed.data;
        const dataArray = fileList || images || [];
        const namespace = req.authUser?.tenantId || 'platform';
        const scopedFolder = tenantFolder(namespace, folder);
        const files = dataArray.map((data, i) => ({ data, options: { folder: scopedFolder, maxWidth, maxHeight, quality, originalFilename: filenames?.[i] } }));
        const results = await uploadService.uploadMultiple(files);

        res.json({ success: true, data: results });
    } catch (error: any) {
        next(error);
    }
});

// Superadmin bypasses; everyone else may only delete an asset whose path
// falls under their own tenant's namespace (see tenantFolder() above).
export function canDeleteUpload(publicId: string, tenantId: string | null | undefined, isSuperAdmin: boolean | undefined): boolean {
    if (isSuperAdmin) return true;
    const namespace = tenantId || 'platform';
    return publicId.startsWith(`tenant/${namespace}/`);
}

// Delete image
uploadRoutes.delete('/:publicId', authenticate, async (req, res, next) => {
    try {
        const { publicId } = req.params;
        if (!publicId) {
            return res.status(400).json({ success: false, error: { message: 'publicId is required' } });
        }

        const decoded = decodeURIComponent(publicId);
        if (!canDeleteUpload(decoded, req.authUser?.tenantId, req.authUser?.isSuperAdmin)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this asset' } });
        }

        const deleted = await uploadService.deleteImage(decoded);
        res.json({ success: true, data: { deleted } });
    } catch (error: any) {
        next(error);
    }
});
