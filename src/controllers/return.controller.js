
import express from "express";

import {
  createReturn,
  getMyReturnList,
  getMyReturn,
  cancelReturn,
  getReturns,
  getReturn,
  approve,
  reject,
  received,
  refund,
} from "../controllers/return.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

import {
  createReturnSchema,
  rejectReturnSchema,
  approveReturnSchema,
} from "../schemas/return.schema.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Returns
 *     description: Customer return requests and admin return management
 *
 * components:
 *   parameters:
 *     ReturnId:
 *       in: path
 *       name: returnId
 *       required: true
 *       description: UUID of the return request
 *       schema:
 *         type: string
 *         format: uuid
 *       example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *   schemas:
 *     CreateReturnItem:
 *       type: object
 *       required:
 *         - orderItemId
 *         - quantity
 *       properties:
 *         orderItemId:
 *           type: string
 *           format: uuid
 *           description: UUID of the order item being returned
 *           example: "550e8400-e29b-41d4-a716-446655440001"
 *         quantity:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           description: Quantity to return
 *           example: 1
 *
 *     CreateReturnInput:
 *       type: object
 *       required:
 *         - orderId
 *         - items
 *         - reason
 *       properties:
 *         orderId:
 *           type: string
 *           format: uuid
 *           description: UUID of the order
 *           example: "550e8400-e29b-41d4-a716-446655440002"
 *         items:
 *           type: array
 *           minItems: 1
 *           description: Items requested for return
 *           items:
 *             $ref: '#/components/schemas/CreateReturnItem'
 *         reason:
 *           type: string
 *           enum:
 *             - damaged
 *             - defective
 *             - wrong_item
 *             - missing_item
 *             - not_as_described
 *             - size_issue
 *             - changed_mind
 *             - other
 *           example: "damaged"
 *         customerNote:
 *           type: string
 *           maxLength: 1000
 *           description: Optional note from the customer
 *           example: "The product arrived damaged."
 *
 *     ApproveReturnInput:
 *       type: object
 *       properties:
 *         adminNote:
 *           type: string
 *           maxLength: 1000
 *           description: Optional note from the administrator
 *           example: "Return approved after review."
 *
 *     RejectReturnInput:
 *       type: object
 *       required:
 *         - adminNote
 *       properties:
 *         adminNote:
 *           type: string
 *           minLength: 3
 *           maxLength: 1000
 *           description: Reason for rejecting the return
 *           example: "The item does not meet the return policy."
 *
 *     ReturnRecord:
 *       type: object
 *       description: Return record returned by the return service. Actual fields depend on the service response.
 *       additionalProperties: true
 *
 *     ReturnResponse:
 *       type: object
 *       required:
 *         - success
 *         - data
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Return request created successfully"
 *         data:
 *           $ref: '#/components/schemas/ReturnRecord'
 *
 *     ReturnListResponse:
 *       type: object
 *       required:
 *         - success
 *         - data
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ReturnRecord'
 *
 *     ReturnError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Validation failed"
 */

/**
 * @swagger
 * /returns:
 *   post:
 *     summary: Create a return request
 *     description: Creates a return request for the authenticated customer. The request body is validated using createReturnSchema.
 *     tags: [Returns]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateReturnInput'
 *           example:
 *             orderId: "550e8400-e29b-41d4-a716-446655440002"
 *             items:
 *               - orderItemId: "550e8400-e29b-41d4-a716-446655440001"
 *                 quantity: 1
 *             reason: "damaged"
 *             customerNote: "The product arrived damaged."
 *     responses:
 *       201:
 *         description: Return request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReturnResponse'
 *             example:
 *               success: true
 *               message: "Return request created successfully"
 *               data: {}
 *       400:
 *         description: Request validation failed or return request is invalid
 *       401:
 *         description: Authentication required or token invalid
 *       404:
 *         description: Related order or order item not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/",
  authenticate,
  validate(createReturnSchema),
  createReturn
);

/**
 * @swagger
 * /returns/my:
 *   get:
 *     summary: Get the current customer's return requests
 *     description: Retrieves return requests belonging to the authenticated customer.
 *     tags: [Returns]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Customer return requests retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReturnListResponse'
 *       401:
 *         description: Authentication required or token invalid
 *       500:
 *         description: Internal server error
 */
router.get(
  "/my",
  authenticate,
  getMyReturnList
);

/**
 * @swagger
 * /returns/my/{returnId}:
 *   get:
 *     summary: Get one of the customer's return requests
 *     description: Retrieves a specific return request belonging to the authenticated customer.
 *     tags: [Returns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ReturnId'
 *     responses:
 *       200:
 *         description: Return request retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReturnResponse'
 *       400:
 *         description: Invalid return ID
 *       401:
 *         description: Authentication required or token invalid
 *       404:
 *         description: Return request not found or inaccessible
 *       500:
 *         description: Internal server error
 */
router.get(
  "/my/:returnId",
  authenticate,
  getMyReturn
);

/**
 * @swagger
 * /returns/my/{returnId}/cancel:
 *   patch:
 *     summary: Cancel a return request
 *     description: Cancels a return request belonging to the authenticated customer. Any status restrictions are enforced by the service.
 *     tags: [Returns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ReturnId'
 *     responses:
 *       200:
 *         description: Return request cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReturnResponse'
 *             example:
 *               success: true
 *               message: "Return request cancelled successfully"
 *               data: {}
 *       400:
 *         description: Return request cannot be cancelled
 *       401:
 *         description: Authentication required or token invalid
 *       404:
 *         description: Return request not found or inaccessible
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/my/:returnId/cancel",
  authenticate,
  cancelReturn
);

/**
 * @swagger
 * /returns/admin:
 *   get:
 *     summary: Get all return requests
 *     description: Allows an administrator to retrieve return requests.
 *     tags: [Returns]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Return requests retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReturnListResponse'
 *       401:
 *         description: Authentication required or token invalid
 *       403:
 *         description: Admin role required
 *       500:
 *         description: Internal server error
 */
router.get(
  "/admin",
  authenticate,
  authorize("admin"),
  getReturns
);

/**
 * @swagger
 * /returns/admin/{returnId}:
 *   get:
 *     summary: Get a specific return request
 *     description: Allows an administrator to retrieve a return request by ID.
 *     tags: [Returns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ReturnId'
 *     responses:
 *       200:
 *         description: Return request retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReturnResponse'
 *       400:
 *         description: Invalid return ID
 *       401:
 *         description: Authentication required or token invalid
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Return request not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/admin/:returnId",
  authenticate,
  authorize("admin"),
  getReturn
);

/**
 * @swagger
 * /returns/admin/{returnId}/approve:
 *   patch:
 *     summary: Approve a return request
 *     description: Allows an administrator to approve a return request with an optional note.
 *     tags: [Returns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ReturnId'
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ApproveReturnInput'
 *           example:
 *             adminNote: "Return approved after review."
 *     responses:
 *       200:
 *         description: Return approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReturnResponse'
 *             example:
 *               success: true
 *               message: "Return approved successfully"
 *               data: {}
 *       400:
 *         description: Request validation failed or return cannot be approved
 *       401:
 *         description: Authentication required or token invalid
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Return request not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/admin/:returnId/approve",
  authenticate,
  authorize("admin"),
  validate(approveReturnSchema),
  approve
);

/**
 * @swagger
 * /returns/admin/{returnId}/reject:
 *   patch:
 *     summary: Reject a return request
 *     description: Allows an administrator to reject a return request with a required rejection note.
 *     tags: [Returns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ReturnId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RejectReturnInput'
 *           example:
 *             adminNote: "The item does not meet the return policy."
 *     responses:
 *       200:
 *         description: Return rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReturnResponse'
 *             example:
 *               success: true
 *               message: "Return rejected successfully"
 *               data: {}
 *       400:
 *         description: Request validation failed or return cannot be rejected
 *       401:
 *         description: Authentication required or token invalid
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Return request not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/admin/:returnId/reject",
  authenticate,
  authorize("admin"),
  validate(rejectReturnSchema),
  reject
);

/**
 * @swagger
 * /returns/admin/{returnId}/received:
 *   patch:
 *     summary: Mark returned items as received
 *     description: Allows an administrator to mark a return as received. The controller reads an optional adminNote from the request body, but this route does not currently apply a validation schema.
 *     tags: [Returns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ReturnId'
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               adminNote:
 *                 type: string
 *                 description: Optional administrator note
 *                 example: "Package received and inspected."
 *     responses:
 *       200:
 *         description: Returned item marked as received
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReturnResponse'
 *             example:
 *               success: true
 *               message: "Returned item marked as received"
 *               data: {}
 *       400:
 *         description: Return cannot be marked as received
 *       401:
 *         description: Authentication required or token invalid
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Return request not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/admin/:returnId/received",
  authenticate,
  authorize("admin"),
  received
);

/**
 * @swagger
 * /returns/admin/{returnId}/refund:
 *   patch:
 *     summary: Process a return refund
 *     description: Allows an administrator to initiate return refund processing. The service determines the actual refund behavior.
 *     tags: [Returns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ReturnId'
 *     responses:
 *       200:
 *         description: Return refund processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReturnResponse'
 *             example:
 *               success: true
 *               message: "Return refund processed successfully"
 *               data: {}
 *       400:
 *         description: Return is not eligible for refund or refund processing failed
 *       401:
 *         description: Authentication required or token invalid
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Return request not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/admin/:returnId/refund",
  authenticate,
  authorize("admin"),
  refund
);

export default router;
