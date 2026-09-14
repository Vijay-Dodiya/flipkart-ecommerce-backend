import express from "express";

import {
    createOrderController,
    getMyOrdersController,
    getOrderByIdController,
    confirmPaymentController,
    cancelOrderController,
} from "../controllers/order.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * @openapi
 * /api/orders:
 *   post:
 *     summary: Create an order
 *     description: Creates an order from the authenticated user's cart and reserves the required inventory.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Cart is empty or insufficient inventory
 *       401:
 *         description: Authentication required
 */
router.post(
    "/",
    authenticate,
    createOrderController
);

/**
 * @openapi
 * /api/orders:
 *   get:
 *     summary: Get my orders
 *     description: Returns all orders belonging to the authenticated user.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get(
    "/",
    authenticate,
    getMyOrdersController
);

/**
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     summary: Get order by ID
 *     description: Returns a specific order belonging to the authenticated user.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order UUID
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "ca783318-bfa9-4432-a001-2728ba8f5c54"
 *     responses:
 *       200:
 *         description: Order retrieved successfully
 *       400:
 *         description: Invalid order ID
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Order not found
 */
router.get(
    "/:id",
    authenticate,
    getOrderByIdController
);

/**
 * @openapi
 * /api/orders/{id}/payment:
 *   patch:
 *     summary: Confirm payment
 *     description: Confirms payment for an order and finalizes the reserved inventory.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order UUID
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "ca783318-bfa9-4432-a001-2728ba8f5c54"
 *     responses:
 *       200:
 *         description: Payment confirmed successfully
 *       400:
 *         description: Payment cannot be confirmed
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Order not found
 */
router.patch(
    "/:id/payment",
    authenticate,
    confirmPaymentController
);

/**
 * @openapi
 * /api/orders/{id}/cancel:
 *   patch:
 *     summary: Cancel an order
 *     description: Cancels an unpaid order and releases its reserved inventory.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order UUID
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "ca783318-bfa9-4432-a001-2728ba8f5c54"
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *       400:
 *         description: Order cannot be cancelled
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Order not found
 */
router.patch(
    "/:id/cancel",
    authenticate,
    cancelOrderController
);

export default router;