import express from "express";

import {
    addToWishlistController,
    getWishlistController,
    removeFromWishlistController,
} from "../controllers/wishlist.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Wishlist
 *   description: Customer wishlist management
 */

/**
 * @swagger
 * /api/wishlist:
 *   get:
 *     summary: Get current user's wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlist fetched successfully
 *       401:
 *         description: Authentication required
 */
router.get(
    "/",
    authenticate,
    getWishlistController
);

/**
 * @swagger
 * /api/wishlist/{productId}:
 *   post:
 *     summary: Add a product to wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: Product added to wishlist successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Product not found
 *       409:
 *         description: Product already exists in wishlist
 */
router.post(
    "/:productId",
    authenticate,
    addToWishlistController
);

/**
 * @swagger
 * /api/wishlist/{productId}:
 *   delete:
 *     summary: Remove a product from wishlist
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Product removed from wishlist successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Product is not in wishlist
 */
router.delete(
    "/:productId",
    authenticate,
    removeFromWishlistController
);

export default router;