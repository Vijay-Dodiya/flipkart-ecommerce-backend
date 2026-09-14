import express from "express";

import {
    createInventoryController,
    getInventoryByProductIdController,
    updateInventoryController,
    deleteInventoryController
} from "../controllers/inventory.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

import { inventorySchema } from "../schemas/inventory.schema.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Inventory
 *     description: Product inventory management
 */

/**
 * @swagger
 * /api/inventory:
 *   post:
 *     summary: Create inventory
 *     tags: [Inventory]
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
 *               - product_id
 *               - quantity
 *             properties:
 *               product_id:
 *                 type: string
 *                 format: uuid
 *                 example: 7757b784-d54f-47ab-a09e-8b5e015fd003
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 example: 100
 *               reserved_quantity:
 *                 type: integer
 *                 minimum: 0
 *                 default: 0
 *                 example: 0
 *               low_stock_threshold:
 *                 type: integer
 *                 minimum: 0
 *                 default: 10
 *                 example: 10
 *     responses:
 *       201:
 *         description: Inventory created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 */
router.post(
    "/",
    authenticate,
    authorize("admin"),
    validate(inventorySchema),
    createInventoryController
);

/**
 * @swagger
 * /api/inventory/{productId}:
 *   get:
 *     summary: Get inventory by product ID
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         description: Product UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inventory retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Inventory not found
 */
router.get(
    "/:productId",
    authenticate,
    authorize("admin"),
    getInventoryByProductIdController
);

/**
 * @swagger
 * /api/inventory/{productId}:
 *   put:
 *     summary: Update inventory
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
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
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 example: 150
 *               reserved_quantity:
 *                 type: integer
 *                 minimum: 0
 *                 example: 10
 *               low_stock_threshold:
 *                 type: integer
 *                 minimum: 0
 *                 example: 10
 *     responses:
 *       200:
 *         description: Inventory updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Inventory not found
 */
router.put(
    "/:productId",
    authenticate,
    authorize("admin"),
    updateInventoryController
);

/**
 * @swagger
 * /api/inventory/{productId}:
 *   delete:
 *     summary: Delete inventory
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         description: Product UUID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inventory deleted successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Inventory not found
 */
router.delete(
    "/:productId",
    authenticate,
    authorize("admin"),
    deleteInventoryController
);

export default router;