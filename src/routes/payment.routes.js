import express from "express";

import {
    createRazorpayOrderController,
    verifyRazorpayPaymentController
} from "../controllers/payment.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Razorpay payment management
 */

/**
 * @swagger
 * /api/payments/orders/{id}:
 *   post:
 *     summary: Create a Razorpay order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Our application's order ID
 *     responses:
 *       201:
 *         description: Razorpay order created successfully
 *       400:
 *         description: Invalid, paid, or cancelled order
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Order not found
 */
router.post(
    "/orders/:id",
    authenticate,
    createRazorpayOrderController
);

/**
 * @swagger
 * /api/payments/orders/{id}/verify:
 *   post:
 *     summary: Verify Razorpay payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Our application's order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razorpayPaymentId
 *               - razorpayOrderId
 *               - razorpaySignature
 *             properties:
 *               razorpayPaymentId:
 *                 type: string
 *                 example: "pay_xxxxxxxxxxxxxx"
 *               razorpayOrderId:
 *                 type: string
 *                 example: "order_xxxxxxxxxxxxxx"
 *               razorpaySignature:
 *                 type: string
 *                 example: "signature_from_razorpay"
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *       400:
 *         description: Payment verification failed
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Order not found
 */
router.post(
    "/orders/:id/verify",
    authenticate,
    verifyRazorpayPaymentController
);

export default router;