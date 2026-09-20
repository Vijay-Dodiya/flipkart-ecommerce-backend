import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";

const normalizeCode = (code) =>
    code.trim().toUpperCase();

const toNumber = (value) =>
    Number(value);

export const createCoupon = async (data) => {
    const code = normalizeCode(data.code);

    const existingCoupon =
        await prisma.coupons.findUnique({
            where: {
                code,
            },
        });

    if (existingCoupon) {
        throw new AppError(
            "Coupon code already exists",
            409
        );
    }

    const coupon =
        await prisma.coupons.create({
            data: {
                code,
                discount_type: data.discountType,
                discount_value: data.discountValue,
                minimum_order_amount:
                    data.minimumOrderAmount ?? 0,
                maximum_discount_amount:
                    data.maximumDiscountAmount ?? null,
                usage_limit:
                    data.usageLimit ?? null,
                per_user_limit:
                    data.perUserLimit ?? 1,
                starts_at: data.startsAt
                    ? new Date(data.startsAt)
                    : new Date(),
                expires_at: data.expiresAt
                    ? new Date(data.expiresAt)
                    : null,
                is_active:
                    data.isActive ?? true,
            },
        });

    return coupon;
};

export const getCoupons = async () => {
    return prisma.coupons.findMany({
        orderBy: {
            created_at: "desc",
        },
    });
};

export const updateCoupon = async (
    couponId,
    data
) => {
    const coupon =
        await prisma.coupons.findUnique({
            where: {
                id: couponId,
            },
        });

    if (!coupon) {
        throw new AppError(
            "Coupon not found",
            404
        );
    }

    return prisma.coupons.update({
        where: {
            id: couponId,
        },
        data: {
            ...(data.discountValue !== undefined && {
                discount_value: data.discountValue,
            }),

            ...(data.minimumOrderAmount !== undefined && {
                minimum_order_amount:
                    data.minimumOrderAmount,
            }),

            ...(data.maximumDiscountAmount !== undefined && {
                maximum_discount_amount:
                    data.maximumDiscountAmount,
            }),

            ...(data.usageLimit !== undefined && {
                usage_limit: data.usageLimit,
            }),

            ...(data.perUserLimit !== undefined && {
                per_user_limit:
                    data.perUserLimit,
            }),

            ...(data.startsAt !== undefined && {
                starts_at: new Date(data.startsAt),
            }),

            ...(data.expiresAt !== undefined && {
                expires_at: data.expiresAt
                    ? new Date(data.expiresAt)
                    : null,
            }),

            ...(data.isActive !== undefined && {
                is_active: data.isActive,
            }),

            updated_at: new Date(),
        },
    });
};

export const deleteCoupon = async (
    couponId
) => {
    const coupon =
        await prisma.coupons.findUnique({
            where: {
                id: couponId,
            },
        });

    if (!coupon) {
        throw new AppError(
            "Coupon not found",
            404
        );
    }

    const usageCount =
        await prisma.coupon_usages.count({
            where: {
                coupon_id: couponId,
            },
        });

    if (usageCount > 0) {
        throw new AppError(
            "A coupon that has already been used cannot be deleted. Deactivate it instead.",
            400
        );
    }

    await prisma.coupons.delete({
        where: {
            id: couponId,
        },
    });

    return {
        couponId,
    };
};

export const validateCoupon = async (
    userId,
    code,
    orderAmount
) => {
    const normalizedCode =
        normalizeCode(code);

    const coupon =
        await prisma.coupons.findUnique({
            where: {
                code: normalizedCode,
            },
        });

    if (!coupon) {
        throw new AppError(
            "Invalid coupon code",
            400
        );
    }

    const now = new Date();

    if (!coupon.is_active) {
        throw new AppError(
            "This coupon is inactive",
            400
        );
    }

    if (now < coupon.starts_at) {
        throw new AppError(
            "This coupon is not active yet",
            400
        );
    }

    if (
        coupon.expires_at &&
        now > coupon.expires_at
    ) {
        throw new AppError(
            "This coupon has expired",
            400
        );
    }

    const minimumAmount =
        toNumber(coupon.minimum_order_amount);

    if (orderAmount < minimumAmount) {
        throw new AppError(
            `Minimum order amount for this coupon is ₹${minimumAmount}`,
            400
        );
    }

    if (
        coupon.usage_limit !== null &&
        coupon.used_count >= coupon.usage_limit
    ) {
        throw new AppError(
            "This coupon usage limit has been reached",
            400
        );
    }

    const userUsageCount =
        await prisma.coupon_usages.count({
            where: {
                coupon_id: coupon.id,
                user_id: userId,
            },
        });

    if (
        userUsageCount >= coupon.per_user_limit
    ) {
        throw new AppError(
            "You have already used this coupon the maximum allowed number of times",
            400
        );
    }

    let discountAmount = 0;

    if (
        coupon.discount_type === "percentage"
    ) {
        discountAmount =
            (orderAmount *
                toNumber(coupon.discount_value)) /
            100;

        if (
            coupon.maximum_discount_amount !==
                null &&
            discountAmount >
                toNumber(
                    coupon.maximum_discount_amount
                )
        ) {
            discountAmount = toNumber(
                coupon.maximum_discount_amount
            );
        }
    } else {
        discountAmount = Math.min(
            toNumber(coupon.discount_value),
            orderAmount
        );
    }

    return {
        coupon,
        discountAmount: Number(
            discountAmount.toFixed(2)
        ),
    };
};