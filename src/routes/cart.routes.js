import express from "express";

import {
    addToCartController,
    getMyCartController,
    updateCartItemController,
    removeCartItemController,
    clearCartController
} from "../controllers/cart.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

import { addToCartSchema } from "../schemas/cart.schema.js";
import { updateCartSchema } from "../schemas/update-cart.schema.js"

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Cart
 *     description: Shopping cart management
 */

/**
 * @swagger
 * /api/cart:
 *   post:
 *     summary: Add product to cart
 *     tags: [Cart]
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
 *               - productId
 *               - quantity
 *             properties:
 *               productId:
 *                 type: string
 *                 format: uuid
 *                 example: 7757b784-d54f-47ab-a09e-8b5e015fd003
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 2
 *     responses:
 *       200:
 *         description: Product added to cart successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Product not found
 */
router.post(
    "/",
    authenticate,
    validate(addToCartSchema),
    addToCartController
);

/**
 * @swagger
 * /api/cart:
 *   get:
 *     summary: Get my cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get(
    "/",
    authenticate,
    getMyCartController
);

/**
 * @swagger
 * /api/cart/{productId}:
 *   put:
 *     summary: Update cart item
 *     tags: [Cart]
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
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 3
 *     responses:
 *       200:
 *         description: Cart item updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Cart item not found
 */
router.put(
    "/:productId",
    authenticate,
    validate(updateCartSchema),
    updateCartItemController
);

/**
 * @swagger
 * /api/cart/{productId}:
 *   delete:
 *     summary: Remove product from cart
 *     tags: [Cart]
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
 *         description: Product removed from cart successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Cart item not found
 */
router.delete(
    "/:productId",
    authenticate,
    removeCartItemController
);

/**
 * @swagger
 * /api/cart:
 *   delete:
 *     summary: Clear cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared successfully
 *       401:
 *         description: Authentication required
 */
router.delete(
    "/",
    authenticate,
    clearCartController
);

export default router;