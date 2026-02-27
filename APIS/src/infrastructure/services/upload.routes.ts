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
    image: z.string().min(1, 'Image data is required'),
    folder: z.string().optional(),
    maxWidth: z.number().optional(),
    maxHeight: z.number().optional(),
    quality: z.number().min(1).max(100).optional(),
});

const MultiUploadSchema = z.object({
    images: z.array(z.string().min(1)).min(1).max(10, 'Maximum 10 images at once'),
    folder: z.string().optional(),
    maxWidth: z.number().optional(),
    maxHeight: z.number().optional(),
    quality: z.number().min(1).max(100).optional(),
});

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

        const { image, folder, maxWidth, maxHeight, quality } = parsed.data;
        const result = await uploadService.uploadSingle(image, { folder, maxWidth, maxHeight, quality });

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

        const { images, folder, maxWidth, maxHeight, quality } = parsed.data;
        const files = images.map(data => ({ data, options: { folder, maxWidth, maxHeight, quality } }));
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
