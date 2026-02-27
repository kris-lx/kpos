// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Cloudinary Configuration
// ═══════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

const cloudinarySchema = z.object({
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    CLOUDINARY_FOLDER: z.string().optional().default('kpos'),
});

const parsed = cloudinarySchema.safeParse(process.env);
const env = parsed.success ? parsed.data : {
    CLOUDINARY_CLOUD_NAME: undefined,
    CLOUDINARY_API_KEY: undefined,
    CLOUDINARY_API_SECRET: undefined,
    CLOUDINARY_FOLDER: 'kpos',
};

export const cloudinaryConfig = {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
    folder: env.CLOUDINARY_FOLDER,
    isConfigured: Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
};
