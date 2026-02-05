// ═══════════════════════════════════════════════════════════════════════════
// Staff Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';
import argon2 from 'argon2';

export const staffRoutes = Router();

// Get all staff
staffRoutes.get('/', authenticate, authorize('staff:read'), async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search, branchId, role, status } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {};
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { email: { contains: String(search), mode: 'insensitive' } },
                { phone: { contains: String(search) } },
            ];
        }
        if (branchId) where.branchId = String(branchId);
        if (role) where.role = String(role);
        if (status === 'active') where.isActive = true;
        if (status === 'inactive') where.isActive = false;

        const [staff, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: Number(limit),
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    avatar: true,
                    role: true,
                    branchId: true,
                    isActive: true,
                    lastLoginAt: true,
                    createdAt: true,
                    branch: { select: { name: true } },
                    roleRelation: { select: { name: true, displayName: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.user.count({ where }),
        ]);

        res.json({
            success: true,
            data: staff,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get staff by ID
staffRoutes.get('/:id', authenticate, authorize('staff:read'), async (req, res, next) => {
    try {
        const staff = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                avatar: true,
                role: true,
                branchId: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                branch: { select: { id: true, name: true } },
                roleRelation: { select: { id: true, name: true, displayName: true, permissions: true } },
            },
        });

        if (!staff) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Staff not found' } });
            return;
        }

        res.json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
});

// Create staff
staffRoutes.post('/', authenticate, authorize('staff:create'), async (req, res, next) => {
    try {
        const { email, password, name, phone, role, branchId, roleId } = req.body;

        // Check if email exists
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            res.status(400).json({ success: false, error: { code: 'VAL_002', message: 'Email already exists' } });
            return;
        }

        // Hash password
        const hashedPassword = await argon2.hash(password);

        const staff = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                phone,
                role: role || 'staff',
                branchId,
                roleId,
            },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                branchId: true,
                isActive: true,
                createdAt: true,
            },
        });

        res.status(201).json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
});

// Update staff
staffRoutes.put('/:id', authenticate, authorize('staff:update'), async (req, res, next) => {
    try {
        const { password, ...updateData } = req.body;

        // If password is being updated, hash it
        if (password) {
            updateData.password = await argon2.hash(password);
        }

        const staff = await prisma.user.update({
            where: { id: req.params.id },
            data: updateData,
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                branchId: true,
                isActive: true,
                createdAt: true,
            },
        });

        res.json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
});

// Delete staff (soft delete)
staffRoutes.delete('/:id', authenticate, authorize('staff:delete'), async (req, res, next) => {
    try {
        await prisma.user.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });

        res.json({ success: true, message: 'Staff deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// Get all roles
staffRoutes.get('/roles/list', authenticate, async (req, res, next) => {
    try {
        const roles = await prisma.role.findMany({
            orderBy: { name: 'asc' },
        });

        res.json({ success: true, data: roles });
    } catch (error) {
        next(error);
    }
});
