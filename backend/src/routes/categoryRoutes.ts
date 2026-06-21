import { Router } from 'express';
import { createCategory, getCategories, updateCategory, deleteCategory } from '../controllers/categoryController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// All category routes require authentication
router.use(requireAuth);

router.post('/', createCategory);
router.get('/', getCategories);
router.patch('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;
