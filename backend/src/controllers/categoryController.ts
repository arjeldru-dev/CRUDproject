import { Request, Response } from 'express';
import { prisma } from '../config/db';

/**
 * POST /api/categories
 * Creates a new budget category for the authenticated user.
 */
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, monthlyLimit } = req.body;

    if (!name || monthlyLimit === undefined || monthlyLimit === null) {
      return res.status(400).json({ error: 'Name and monthlyLimit are required' });
    }

    if (typeof monthlyLimit !== 'number' || monthlyLimit < 0) {
      return res.status(400).json({ error: 'monthlyLimit must be a non-negative number' });
    }

    const category = await prisma.category.create({
      data: {
        name,
        monthlyLimit,
        userId: req.user.id,
      },
    });

    return res.status(201).json({ category });
  } catch (error) {
    console.error('Create category error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/categories
 * Retrieves all categories belonging to the authenticated user.
 */
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { userId: req.user.id },
      orderBy: { name: 'asc' },
    });

    return res.status(200).json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PATCH /api/categories/:id
 * Updates a category's name or monthlyLimit after verifying ownership.
 * Returns 404 if category not found, 403 if it belongs to another user.
 */
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, monthlyLimit } = req.body;

    if (!name && (monthlyLimit === undefined || monthlyLimit === null)) {
      return res.status(400).json({ error: 'At least one field (name or monthlyLimit) is required' });
    }

    if (monthlyLimit !== undefined && (typeof monthlyLimit !== 'number' || monthlyLimit < 0)) {
      return res.status(400).json({ error: 'monthlyLimit must be a non-negative number' });
    }

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Verify ownership
    if (existingCategory.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this category' });
    }

    // Build the update payload dynamically
    const updateData: { name?: string; monthlyLimit?: number } = {};
    if (name) updateData.name = name;
    if (monthlyLimit !== undefined) updateData.monthlyLimit = monthlyLimit;

    const updatedCategory = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({ category: updatedCategory });
  } catch (error) {
    console.error('Update category error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * DELETE /api/categories/:id
 * Deletes a category belonging to the authenticated user.
 */
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Verify ownership
    if (existingCategory.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this category' });
    }

    await prisma.category.delete({
      where: { id },
    });

    return res.status(200).json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
