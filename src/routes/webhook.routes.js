import express from "express";

import {
    razorpayWebhookController,
} from "../controllers/webhook.controller.js";

const router = express.Router();

/**
 * @swagger
 * /api/webhooks/razorpay:
 *   post:
 *     summary: Receive Razorpay webhook events
 *     description: >
 *       Receives payment events from Razorpay. The request body must remain
 *       as the raw request body because Razorpay signs the raw payload using
 *       HMAC-SHA256. The webhook signature is provided in the
 *       X-Razorpay-Signature header.
 *     tags:
 *       - Webhooks
 *     parameters:
 *       - in: header
 *         name: X-Razorpay-Signature
 *         required: true
 *         schema:
 *           type: string
 *         description: Razorpay webhook signature used to verify authenticity.
 *       - in: header
 *         name: X-Razorpay-Event-Id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique Razorpay event ID used for duplicate-event protection.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entity:
 *                 type: string
 *                 example: event
 *               event:
 *                 type: string
 *                 example: payment.captured
 *               payload:
 *                 type: object
 *                 description: Razorpay event payload.
 *     responses:
 *       200:
 *         description: Webhook received and processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Razorpay webhook processed successfully
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid webhook signature or payload.
 *       404:
 *         description: Internal order not found.
 *       409:
 *         description: Inventory could not be finalized.
 */
router.post(
    "/razorpay",
    express.raw({
        type: "application/json",
    }),
    razorpayWebhookController
);

export default router;