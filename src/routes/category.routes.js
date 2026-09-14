import express from "express";

import {
    getCategoriesController,
    getCategoryByIdController,
    getCategoryChildrenController,
    createCategoryController,
    updateCategoryController,
    deleteCategoryController
} from "../controllers/category.controller.js";

import { validate } from "../middleware/validate.middleware.js";

import {
    categorySchema,
    updateCategorySchema
} from "../schemas/category.schema.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Categories
 *     description: Product category management
 */

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Get all categories
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 */
router.get("/", getCategoriesController);

/**
 * @swagger
 * /api/categories/{id}:
 *   get:
 *     summary: Get category by ID
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Category UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Category retrieved successfully
 *       400:
 *         description: Invalid category ID
 *       404:
 *         description: Category not found
 */
router.get("/:id", getCategoryByIdController);

/**
 * @swagger
 * /api/categories/{id}/children:
 *   get:
 *     summary: Get child categories
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Parent category UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Child categories retrieved successfully
 *       400:
 *         description: Invalid category ID
 *       404:
 *         description: Category not found
 */
router.get("/:id/children", getCategoryChildrenController);

/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Create a category
 *     tags: [Categories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required:
 *               - name
 *               - slug
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 example: Electronics
 *               slug:
 *                 type: string
 *                 minLength: 2
 *                 pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
 *                 example: electronics
 *               parent_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: null
 *     responses:
 *       201:
 *         description: Category created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Category already exists
 */
router.post(
    "/",
    validate(categorySchema),
    createCategoryController
);

/**
 * @swagger
 * /api/categories/{id}:
 *   put:
 *     summary: Update a category
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Category UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 example: Electronics
 *               slug:
 *                 type: string
 *                 minLength: 2
 *                 pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
 *                 example: electronics
 *               parent_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: null
 *     responses:
 *       200:
 *         description: Category updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Category not found
 */
router.put(
    "/:id",
    validate(updateCategorySchema),
    updateCategoryController
);

/**
 * @swagger
 * /api/categories/{id}:
 *   delete:
 *     summary: Delete a category
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Category UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Category deleted successfully
 *       400:
 *         description: Invalid category ID
 *       404:
 *         description: Category not found
 */
router.delete(
    "/:id",
    deleteCategoryController
);

export default router;