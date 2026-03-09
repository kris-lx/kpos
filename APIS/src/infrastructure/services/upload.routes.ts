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

const SingleUploadSchema = z.object({
    file: z.string().min(1).optional(),
    image: z.string().min(1).optional(),
    folder: z.string().optional(),
    maxWidth: z.number().optional(),
    maxHeight: z.number().optional(),
    quality: z.number().min(1).max(100).optional(),
    resourceType: z.enum(['image', 'video', 'raw', 'auto']).optional(),
}).refine(data => data.file || data.image, { message: 'File data is required (use "file" or "image" field)' });

const MultiUploadSchema = z.object({
    files: z.array(z.string().min(1)).min(1).max(10, 'Maximum 10 files at once').optional(),
    images: z.array(z.string().min(1)).min(1).max(10, 'Maximum 10 files at once').optional(),
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

        const { file, image, folder, maxWidth, maxHeight, quality, resourceType } = parsed.data;
        const fileData = file || image!;
        const result = await uploadService.uploadSingle(fileData, { folder, maxWidth, maxHeight, quality, resourceType });

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

        const { files: fileList, images, folder, maxWidth, maxHeight, quality } = parsed.data;
        const dataArray = fileList || images || [];
        const files = dataArray.map(data => ({ data, options: { folder, maxWidth, maxHeight, quality } }));
        const results = await uploadService.uploadMultiple(files);

        res.json({ success: true, data: results });
    } catch (error: any) {
        next(error);
    }
});

// Delete image
uploadRoutes.delete('/:publicId', authenticate, async (req, res, next) => {
    try {
        const { publicId } = req.params;
        if (!publicId) {
            return res.status(400).json({ success: false, error: { message: 'publicId is required' } });
        }

        const deleted = await uploadService.deleteImage(decodeURIComponent(publicId));
        res.json({ success: true, data: { deleted } });
    } catch (error: any) {
        next(error);
    }
});
