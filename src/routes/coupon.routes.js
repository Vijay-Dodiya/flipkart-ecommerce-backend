import express from "express";

import {
    createCouponController,
    getCouponsController,
    updateCouponController,
    deleteCouponController,
    validateCouponController,
} from "../controllers/coupon.controller.js";

import {
    authenticate,
    authorize,
} from "../middleware/auth.middleware.js";

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

router.post(
    "/",
    authenticate,
    authorize("admin"),
    validate(createCouponSchema),
    createCouponController
);

router.get(
    "/",
    authenticate,
    authorize("admin"),
    getCouponsController
);

router.put(
    "/:id",
    authenticate,
    authorize("admin"),
    validate(updateCouponSchema),
    updateCouponController
);

router.delete(
    "/:id",
    authenticate,
    authorize("admin"),
    deleteCouponController
);

router.post(
    "/validate",
    authenticate,
    validateCouponController
);

export default router;