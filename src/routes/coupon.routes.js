import express from "express";

import {
    createCouponController,
    getCouponsController,
    getCouponByIdController,
    updateCouponController,
    deleteCouponController,
    validateCouponController,
} from "../controllers/coupon.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";

import {
    createCouponSchema,
    updateCouponSchema,
} from "../schemas/coupon.schema.js";

import { validate } from "../middleware/validate.middleware.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Coupons
 *   description: Coupon and discount management
 */

/**
 * @swagger
 * /api/coupons:
 *   post:
 *     summary: Create a new coupon
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - discountType
 *               - discountValue
 *             properties:
 *               code:
 *                 type: string
 *                 example: SAVE20
 *               discountType:
 *                 type: string
 *                 enum:
 *                   - percentage
 *                   - fixed
 *                 example: percentage
 *               discountValue:
 *                 type: number
 *                 example: 20
 *               minimumOrderAmount:
 *                 type: number
 *                 example: 1000
 *               maximumDiscountAmount:
 *                 type: number
 *                 nullable: true
 *                 example: 500
 *               usageLimit:
 *                 type: integer
 *                 nullable: true
 *                 example: 100
 *               perUserLimit:
 *                 type: integer
 *                 example: 1
 *               startsAt:
 *                 type: string
 *                 format: date-time
 *                 example: 2026-10-01T00:00:00.000Z
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 example: 2026-12-31T23:59:59.000Z
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Coupon created successfully
 *       400:
 *         description: Invalid coupon data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       409:
 *         description: Coupon code already exists
 */
router.post(
    "/",
    authenticate,
    authorize("admin"),
    validate(createCouponSchema),
    createCouponController
);

/**
 * @swagger
 * /api/coupons:
 *   get:
 *     summary: Get all coupons
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Coupons fetched successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 */
router.get(
    "/",
    authenticate,
    authorize("admin"),
    getCouponsController
);

/**
 * @swagger
 * /api/coupons/validate:
 *   post:
 *     summary: Validate a coupon
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - orderAmount
 *             properties:
 *               code:
 *                 type: string
 *                 example: SAVE20
 *               orderAmount:
 *                 type: number
 *                 example: 2500
 *     responses:
 *       200:
 *         description: Coupon is valid
 *       400:
 *         description: Invalid, expired, inactive, or unusable coupon
 *       401:
 *         description: Authentication required
 */
router.post(
    "/validate",
    authenticate,
    validateCouponController
);

/**
 * @swagger
 * /api/coupons/{id}:
 *   get:
 *     summary: Get a coupon by ID
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Coupon UUID
 *     responses:
 *       200:
 *         description: Coupon fetched successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Coupon not found
 */
router.get(
    "/:id",
    authenticate,
    authorize("admin"),
    getCouponByIdController
);

/**
 * @swagger
 * /api/coupons/{id}:
 *   put:
 *     summary: Update a coupon
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Coupon UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               discountValue:
 *                 type: number
 *                 example: 25
 *               minimumOrderAmount:
 *                 type: number
 *                 example: 1500
 *               maximumDiscountAmount:
 *                 type: number
 *                 nullable: true
 *                 example: 600
 *               usageLimit:
 *                 type: integer
 *                 nullable: true
 *                 example: 200
 *               perUserLimit:
 *                 type: integer
 *                 example: 2
 *               startsAt:
 *                 type: string
 *                 format: date-time
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Coupon updated successfully
 *       400:
 *         description: Invalid coupon update data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Coupon not found
 */
router.put(
    "/:id",
    authenticate,
    authorize("admin"),
    validate(updateCouponSchema),
    updateCouponController
);

/**
 * @swagger
 * /api/coupons/{id}:
 *   delete:
 *     summary: Delete a coupon
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Coupon UUID
 *     responses:
 *       200:
 *         description: Coupon deleted successfully
 *       400:
 *         description: Coupon cannot be deleted because it has already been used
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Coupon not found
 */
router.delete(
    "/:id",
    authenticate,
    authorize("admin"),
    deleteCouponController
);

export default router;