import express from "express";

import {
    getMyOrderStatusHistoryController,
    getAdminOrderStatusHistoryController,
} from "../controllers/orderStatusHistory.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

import { authorize } from "../middleware/role.middleware.js";


const router = express.Router();


/*
|--------------------------------------------------------------------------
| CUSTOMER — GET OWN ORDER STATUS HISTORY
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/order-status-history/order/{orderId}:
 *   get:
 *     summary: Get my order status history
 *     description: Returns the complete status history of an order belonging to the authenticated customer.
 *     tags:
 *       - Order Status History
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
 *         description: Order status history fetched successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Order not found
 */

router.get(
    "/order/:orderId",
    authenticate,
    getMyOrderStatusHistoryController
);


/*
|--------------------------------------------------------------------------
| ADMIN — GET ANY ORDER STATUS HISTORY
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/order-status-history/admin/order/{orderId}:
 *   get:
 *     summary: Get any order status history
 *     description: Allows an administrator to view the complete status history of any order.
 *     tags:
 *       - Order Status History
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
 *         description: Order status history fetched successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Order not found
 */

router.get(
    "/admin/order/:orderId",
    authenticate,
    authorize("admin"),
    getAdminOrderStatusHistoryController
);


export default router;