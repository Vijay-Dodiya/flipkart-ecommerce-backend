import { asyncHandler } from "../utils/asyncHandler.js";

import {
    createCoupon,
    getCoupons,
    getCouponById,
    updateCoupon,
    deleteCoupon,
    validateCoupon,
} from "../services/coupon.service.js";

/**
 * ============================================================
 * Admin - Create Coupon
 * ============================================================
 */
export const createCouponController =
    asyncHandler(async (req, res) => {
        const coupon =
            await createCoupon(req.body);

        res.status(201).json({
            success: true,
            message:
                "Coupon created successfully",
            data: coupon,
        });
    });

/**
 * ============================================================
 * Admin - Get All Coupons
 * ============================================================
 */
export const getCouponsController =
    asyncHandler(async (req, res) => {
        const coupons =
            await getCoupons();

        res.status(200).json({
            success: true,
            message:
                "Coupons fetched successfully",
            data: coupons,
        });
    });

/**
 * ============================================================
 * Admin - Get Coupon By ID
 * ============================================================
 */
export const getCouponByIdController =
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const coupon =
            await getCouponById(id);

        res.status(200).json({
            success: true,
            message:
                "Coupon fetched successfully",
            data: coupon,
        });
    });

/**
 * ============================================================
 * Admin - Update Coupon
 * ============================================================
 */
export const updateCouponController =
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const coupon =
            await updateCoupon(
                id,
                req.body
            );

        res.status(200).json({
            success: true,
            message:
                "Coupon updated successfully",
            data: coupon,
        });
    });

/**
 * ============================================================
 * Admin - Delete Coupon
 * ============================================================
 */
export const deleteCouponController =
    asyncHandler(async (req, res) => {
        const { id } = req.params;

        const result =
            await deleteCoupon(id);

        res.status(200).json({
            success: true,
            message:
                "Coupon deleted successfully",
            data: result,
        });
    });

/**
 * ============================================================
 * Customer - Validate Coupon
 * ============================================================
 */
export const validateCouponController =
    asyncHandler(async (req, res) => {
        const { id: userId } = req.user;

        const {
            code,
            orderAmount,
        } = req.body;

        const result =
            await validateCoupon(
                userId,
                code,
                orderAmount
            );

        const finalAmount =
            Number(
                (
                    orderAmount -
                    result.discountAmount
                ).toFixed(2)
            );

        res.status(200).json({
            success: true,
            message:
                "Coupon is valid",
            data: {
                couponId:
                    result.coupon.id,
                code:
                    result.coupon.code,
                discountType:
                    result.coupon.discount_type,
                discountAmount:
                    result.discountAmount,
                orderAmount,
                finalAmount,
            },
        });
    });