import express from "express";

import {
    createProductController,
    getAllProductsController,
    getProductByIdController,
    updateProductController,
    deleteProductController
} from "../controllers/product.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

import { productSchema } from "../schemas/product.schema.js";
import { updateProductSchema } from "../schemas/update-product.schema.js";
import { productQuerySchema } from "../schemas/product-query.schema.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Products
 *     description: Product management
 */

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required:
 *               - name
 *               - price
 *               - sku
 *               - category_id
 *               - quantity
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 example: iPhone 17
 *               description:
 *                 type: string
 *                 example: Latest Apple iPhone
 *               price:
 *                 type: number
 *                 exclusiveMinimum: 0
 *                 example: 69999
 *               brand:
 *                 type: string
 *                 example: Apple
 *               sku:
 *                 type: string
 *                 minLength: 2
 *                 example: APP-IP17-128
 *               category_id:
 *                 type: string
 *                 format: uuid
 *                 example: 7757b784-d54f-47ab-a09e-8b5e015fd003
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 example: 100
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       409:
 *         description: Product SKU already exists
 */
router.post(
    "/",
    authenticate,
    authorize("admin"),
    validate(productSchema),
    createProductController
);

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 */
router.get(
  "/",
  validate(productQuerySchema, "query"),
  getAllProductsController
);

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Product UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *       400:
 *         description: Invalid product ID
 *       404:
 *         description: Product not found
 */
router.get(
    "/:id",
    getProductByIdController
);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Update a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Product UUID
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
 *                 example: iPhone 17 Pro
 *               description:
 *                 type: string
 *                 example: Updated product description
 *               price:
 *                 type: number
 *                 exclusiveMinimum: 0
 *                 example: 79999
 *               brand:
 *                 type: string
 *                 example: Apple
 *               sku:
 *                 type: string
 *                 minLength: 2
 *                 example: APP-IP17-PRO
 *               category_id:
 *                 type: string
 *                 format: uuid
 *                 example: 7757b784-d54f-47ab-a09e-8b5e015fd003
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 example: 100
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Product not found
 */
router.put(
    "/:id",
    authenticate,
    authorize("admin"),
    validate(updateProductSchema),
    updateProductController
);

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Product UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       400:
 *         description: Invalid product ID
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Product not found
 */
router.delete(
    "/:id",
    authenticate,
    authorize("admin"),
    deleteProductController
);

export default router;