import express from "express";

import {
    createProductVariantController,
    getProductVariantsController,
    getProductVariantByIdController,
    updateProductVariantController,
    deleteProductVariantController,
} from "../controllers/productVariant.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";

import {
    createProductVariantSchema,
    updateProductVariantSchema,
} from "../schemas/productVariant.schema.js";

import { validate } from "../middleware/validate.middleware.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Product Variants
 *   description: Product variant and variant inventory management
 */

/**
 * @swagger
 * /api/product-variants:
 *   post:
 *     summary: Create a product variant
 *     description: Creates a variant for an existing product and creates its inventory record.
 *     tags: [Product Variants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - name
 *               - sku
 *               - attributes
 *             properties:
 *               productId:
 *                 type: string
 *                 format: uuid
 *                 example: 550e8400-e29b-41d4-a716-446655440000
 *               name:
 *                 type: string
 *                 example: Black 256GB
 *               sku:
 *                 type: string
 *                 example: IP17-BLK-256
 *               price:
 *                 type: number
 *                 nullable: true
 *                 example: 79999
 *               attributes:
 *                 type: object
 *                 additionalProperties: true
 *                 example:
 *                   color: Black
 *                   storage: 256GB
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 example: 20
 *               lowStockThreshold:
 *                 type: integer
 *                 minimum: 0
 *                 example: 5
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Product variant created successfully
 *       400:
 *         description: Invalid variant data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Product not found
 *       409:
 *         description: Variant SKU already exists
 */
router.post(
    "/",
    authenticate,
    authorize("admin"),
    validate(createProductVariantSchema),
    createProductVariantController
);

/**
 * @swagger
 * /api/product-variants/product/{productId}:
 *   get:
 *     summary: Get all variants of a product
 *     description: Returns all variants belonging to a specific product, including variant inventory.
 *     tags: [Product Variants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Product UUID
 *     responses:
 *       200:
 *         description: Product variants fetched successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Product not found
 */
router.get(
    "/product/:productId",
    authenticate,
    getProductVariantsController
);

/**
 * @swagger
 * /api/product-variants/{variantId}:
 *   get:
 *     summary: Get a product variant by ID
 *     description: Returns a single product variant with its inventory and parent product information.
 *     tags: [Product Variants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Product variant UUID
 *     responses:
 *       200:
 *         description: Product variant fetched successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Product variant not found
 */
router.get(
    "/:variantId",
    authenticate,
    getProductVariantByIdController
);

/**
 * @swagger
 * /api/product-variants/{variantId}:
 *   put:
 *     summary: Update a product variant
 *     description: Updates variant information and, when provided, its inventory values.
 *     tags: [Product Variants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Product variant UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Black 512GB
 *               sku:
 *                 type: string
 *                 example: IP17-BLK-512
 *               price:
 *                 type: number
 *                 nullable: true
 *                 example: 89999
 *               attributes:
 *                 type: object
 *                 additionalProperties: true
 *                 example:
 *                   color: Black
 *                   storage: 512GB
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 example: 15
 *               lowStockThreshold:
 *                 type: integer
 *                 minimum: 0
 *                 example: 5
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Product variant updated successfully
 *       400:
 *         description: Invalid variant update data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Product variant not found
 *       409:
 *         description: Variant SKU already exists
 */
router.put(
    "/:variantId",
    authenticate,
    authorize("admin"),
    validate(updateProductVariantSchema),
    updateProductVariantController
);

/**
 * @swagger
 * /api/product-variants/{variantId}:
 *   delete:
 *     summary: Delete a product variant
 *     description: Deletes a variant only when it has not been used in an order.
 *     tags: [Product Variants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Product variant UUID
 *     responses:
 *       200:
 *         description: Product variant deleted successfully
 *       400:
 *         description: Variant cannot be deleted because it has already been used in an order
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Product variant not found
 */
router.delete(
    "/:variantId",
    authenticate,
    authorize("admin"),
    deleteProductVariantController
);

export default router;