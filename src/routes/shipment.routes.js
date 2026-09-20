import express from "express";

import {
    createShipmentController,
    updateShipmentStatusController,
    getShipmentByOrderIdController,
    addTrackingEventController,
    getShipmentTrackingHistoryController,
    recordDeliveryAttemptController,
    recordFailedDeliveryController,
    recordReturnToSenderController,
} from "../controllers/shipment.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

import { authorize } from "../middleware/role.middleware.js";

import { validate } from "../middleware/validate.middleware.js";

import {
    createShipmentSchema,
    updateShipmentStatusSchema,
    addTrackingEventSchema,
    recordDeliveryAttemptSchema,
    recordFailedDeliverySchema,
    recordReturnToSenderSchema,
} from "../schemas/shipment.schema.js";


const router = express.Router();


/*
|--------------------------------------------------------------------------
| ADMIN — CREATE SHIPMENT
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/shipments/order/{orderId}:
 *   post:
 *     summary: Create shipment for an order
 *     description: Creates a shipment for a paid order that is currently being processed.
 *     tags:
 *       - Shipments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - carrier
 *               - trackingNumber
 *             properties:
 *               carrier:
 *                 type: string
 *                 example: Delhivery
 *               trackingNumber:
 *                 type: string
 *                 example: DL123456789
 *     responses:
 *       201:
 *         description: Shipment created successfully
 *       400:
 *         description: Order is unpaid or not in processing state
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Order not found
 *       409:
 *         description: Shipment already exists
 */

router.post(
    "/order/:orderId",
    authenticate,
    authorize("admin"),
    validate(createShipmentSchema),
    createShipmentController
);


/*
|--------------------------------------------------------------------------
| ADMIN — UPDATE SHIPMENT STATUS
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/shipments/{id}/status:
 *   patch:
 *     summary: Update shipment status
 *     description: Moves a shipment through the main delivery lifecycle.
 *     tags:
 *       - Shipments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Shipment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum:
 *                   - shipped
 *                   - in_transit
 *                   - out_for_delivery
 *                   - delivered
 *                 example: shipped
 *     responses:
 *       200:
 *         description: Shipment status updated successfully
 *       400:
 *         description: Invalid shipment status transition
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Shipment not found
 */

router.patch(
    "/:id/status",
    authenticate,
    authorize("admin"),
    validate(updateShipmentStatusSchema),
    updateShipmentStatusController
);


/*
|--------------------------------------------------------------------------
| ADMIN — ADD GENERAL SHIPMENT TRACKING EVENT
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/shipments/{id}/tracking-events:
 *   post:
 *     summary: Add shipment tracking event
 *     description: Adds a general logistics tracking event without changing the shipment's main status.
 *     tags:
 *       - Shipments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Shipment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 example: facility_arrival
 *               description:
 *                 type: string
 *                 example: Package arrived at Indore sorting facility
 *               location:
 *                 type: string
 *                 example: Indore, Madhya Pradesh
 *     responses:
 *       201:
 *         description: Tracking event added successfully
 *       400:
 *         description: Invalid tracking event data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Shipment not found
 */

router.post(
    "/:id/tracking-events",
    authenticate,
    authorize("admin"),
    validate(addTrackingEventSchema),
    addTrackingEventController
);


/*
|--------------------------------------------------------------------------
| ADMIN — RECORD DELIVERY ATTEMPT
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/shipments/{id}/delivery-attempt:
 *   post:
 *     summary: Record delivery attempt
 *     description: Records a delivery attempt as a tracking event. The shipment's main status remains unchanged.
 *     tags:
 *       - Shipments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Shipment ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *                 example: Customer was unavailable
 *               location:
 *                 type: string
 *                 example: Indore, Madhya Pradesh
 *     responses:
 *       201:
 *         description: Delivery attempt recorded successfully
 *       400:
 *         description: Delivery attempt can only be recorded when shipment is out for delivery
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Shipment not found
 */

router.post(
    "/:id/delivery-attempt",
    authenticate,
    authorize("admin"),
    validate(recordDeliveryAttemptSchema),
    recordDeliveryAttemptController
);


/*
|--------------------------------------------------------------------------
| ADMIN — RECORD FAILED DELIVERY
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/shipments/{id}/delivery-failed:
 *   post:
 *     summary: Record failed delivery
 *     description: Records that a delivery attempt failed. The shipment's main status remains unchanged so another attempt can be made.
 *     tags:
 *       - Shipments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Shipment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Customer was unavailable
 *               location:
 *                 type: string
 *                 example: Indore, Madhya Pradesh
 *     responses:
 *       201:
 *         description: Failed delivery recorded successfully
 *       400:
 *         description: Failed delivery can only be recorded when shipment is out for delivery
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Shipment not found
 */

router.post(
    "/:id/delivery-failed",
    authenticate,
    authorize("admin"),
    validate(recordFailedDeliverySchema),
    recordFailedDeliveryController
);


/*
|--------------------------------------------------------------------------
| ADMIN — RECORD RETURN TO SENDER
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/shipments/{id}/return-to-sender:
 *   post:
 *     summary: Record return to sender
 *     description: Records that a shipment is being returned to the sender as a tracking event.
 *     tags:
 *       - Shipments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Shipment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Maximum delivery attempts exceeded
 *               location:
 *                 type: string
 *                 example: Indore, Madhya Pradesh
 *     responses:
 *       201:
 *         description: Return to sender event recorded successfully
 *       400:
 *         description: Delivered shipment cannot be marked as return to sender
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Shipment not found
 */

router.post(
    "/:id/return-to-sender",
    authenticate,
    authorize("admin"),
    validate(recordReturnToSenderSchema),
    recordReturnToSenderController
);


/*
|--------------------------------------------------------------------------
| CUSTOMER — GET MY SHIPMENT
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/shipments/order/{orderId}:
 *   get:
 *     summary: Get shipment for my order
 *     description: Returns shipment information for an order belonging to the authenticated customer.
 *     tags:
 *       - Shipments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Shipment fetched successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Shipment not found
 */

router.get(
    "/order/:orderId",
    authenticate,
    getShipmentByOrderIdController
);


/*
|--------------------------------------------------------------------------
| CUSTOMER — GET SHIPMENT TRACKING HISTORY
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/shipments/{id}/tracking-events:
 *   get:
 *     summary: Get shipment tracking history
 *     description: Returns the chronological tracking events for a shipment belonging to the authenticated customer.
 *     tags:
 *       - Shipments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Shipment ID
 *     responses:
 *       200:
 *         description: Shipment tracking history fetched successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Shipment not found
 */

router.get(
    "/:id/tracking-events",
    authenticate,
    getShipmentTrackingHistoryController
);


export default router;