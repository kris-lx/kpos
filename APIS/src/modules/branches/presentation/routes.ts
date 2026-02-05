// ═══════════════════════════════════════════════════════════════════════════
// Branches Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const branchRoutes = Router();

// Get all branches
branchRoutes.get('/', authenticate, async (_req, res, next) => {
    try {
        const branches = await prisma.branch.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
        });

        res.json({ success: true, data: branches });
    } catch (error) {
        next(error);
    }
});

// Get branch by ID
branchRoutes.get('/:id', authenticate, async (req, res, next) => {
    try {
        const branch = await prisma.branch.findUnique({
            where: { id: req.params.id },
        });

        if (!branch) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Branch not found' } });
            return;
        }

        res.json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

// Create branch (admin only)
branchRoutes.post('/', authenticate, authorize('branches:create'), async (req, res, next) => {
    try {
        const branch = await prisma.branch.create({ data: req.body });
        res.status(201).json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

// Update branch
branchRoutes.put('/:id', authenticate, authorize('branches:update'), async (req, res, next) => {
    try {
        const branch = await prisma.branch.update({
            where: { id: req.params.id },
            data: req.body,
        });
        res.json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

// Delete branch (soft delete) - check if no stores are assigned
branchRoutes.delete('/:id', authenticate, authorize('branches:delete'), async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // Check if branch has any stores
        const storeCount = await prisma.store.count({
            where: { branchId: id, isActive: true }
        });
        
        if (storeCount > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'BRANCH_HAS_STORES',
                    message: `ບໍ່ສາມາດລົບສາຂານີ້ໄດ້ ເພາະມີ ${storeCount} ຮ້ານຢູ່ໃນສາຂານີ້`
                }
            });
        }
        
        // Check if branch has any users
        const userCount = await prisma.user.count({
            where: { branchId: id, isActive: true }
        });
        
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'BRANCH_HAS_USERS',
                    message: `ບໍ່ສາມາດລົບສາຂານີ້ໄດ້ ເພາະມີ ${userCount} ພະນັກງານຢູ່ໃນສາຂານີ້`
                }
            });
        }
        
        await prisma.branch.update({
            where: { id },
            data: { isActive: false },
        });
        res.json({ success: true, data: { message: 'Branch deleted' } });
    } catch (error) {
        next(error);
    }
});
