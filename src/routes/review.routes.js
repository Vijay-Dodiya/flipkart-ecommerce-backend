import express from "express";

import {
    createReviewController,
    getProductReviewsController,
    updateReviewController,
    deleteReviewController,
} from "../controllers/review.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

import {
    createReviewSchema,
    updateReviewSchema,
} from "../schemas/review.schema.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Product reviews and ratings
 */

/**
 * @swagger
 * /api/products/{productId}/reviews:
 *   post:
 *     summary: Create a product review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    "/products/:productId/reviews",
    authenticate,
    validate(createReviewSchema),
    createReviewController
);

/**
 * @swagger
 * /api/products/{productId}/reviews:
 *   get:
 *     summary: Get product reviews
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 */
router.get(
    "/products/:productId/reviews",
    getProductReviewsController
);

/**
 * @swagger
 * /api/reviews/{id}:
 *   put:
 *     summary: Update your own product review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 */
router.put(
    "/reviews/:id",
    authenticate,
    validate(updateReviewSchema),
    updateReviewController
);

/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     summary: Delete your own product review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
    "/reviews/:id",
    authenticate,
    deleteReviewController
);

export default router;