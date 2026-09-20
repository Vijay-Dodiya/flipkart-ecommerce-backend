import { asyncHandler } from "../utils/asyncHandler.js";

import {
    createCoupon,
    getCoupons,
    updateCoupon,
    deleteCoupon,
    validateCoupon,
} from "../services/coupon.service.js";

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

        res.status(200).json({
            success: true,
            message:
                "Coupon is valid",
            data: {
                couponId:
                    result.coupon.id,
                code:
                    result.coupon.code,
                discountAmount:
                    result.discountAmount,
                finalAmount:
                    Number(
                        (
                            orderAmount -
                            result.discountAmount
                        ).toFixed(2)
                    ),
            },
        });
    });