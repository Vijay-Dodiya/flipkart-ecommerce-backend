import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";

const normalizeCode = (code) =>
    code.trim().toUpperCase();

const toNumber = (value) =>
    Number(value);

const roundMoney = (value) =>
    Number(Number(value).toFixed(2));

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

    const startsAt = data.startsAt
        ? new Date(data.startsAt)
        : new Date();

    const expiresAt = data.expiresAt
        ? new Date(data.expiresAt)
        : null;

    if (expiresAt && expiresAt <= startsAt) {
        throw new AppError(
            "Coupon expiry date must be after start date",
            400
        );
    }

    if (
        data.discountType === "percentage" &&
        data.discountValue > 100
    ) {
        throw new AppError(
            "Percentage discount cannot exceed 100",
            400
        );
    }

    if (
        data.maximumDiscountAmount !== null &&
        data.maximumDiscountAmount !== undefined &&
        data.discountType !== "percentage"
    ) {
        throw new AppError(
            "Maximum discount amount can only be used with percentage coupons",
            400
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
                starts_at: startsAt,
                expires_at: expiresAt,
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

export const getCouponById = async (couponId) => {
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

    return coupon;
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

    const newDiscountValue =
        data.discountValue !== undefined
            ? data.discountValue
            : toNumber(coupon.discount_value);

    if (
        coupon.discount_type === "percentage" &&
        newDiscountValue > 100
    ) {
        throw new AppError(
            "Percentage discount cannot exceed 100",
            400
        );
    }

    const newStartsAt =
        data.startsAt !== undefined
            ? new Date(data.startsAt)
            : coupon.starts_at;

    const newExpiresAt =
        data.expiresAt !== undefined
            ? data.expiresAt
                ? new Date(data.expiresAt)
                : null
            : coupon.expires_at;

    if (
        newExpiresAt &&
        newExpiresAt <= newStartsAt
    ) {
        throw new AppError(
            "Coupon expiry date must be after start date",
            400
        );
    }

    if (
        data.maximumDiscountAmount !== undefined &&
        data.maximumDiscountAmount !== null &&
        coupon.discount_type !== "percentage"
    ) {
        throw new AppError(
            "Maximum discount amount can only be used with percentage coupons",
            400
        );
    }

    return prisma.coupons.update({
        where: {
            id: couponId,
        },

        data: {
            ...(data.discountValue !== undefined && {
                discount_value:
                    data.discountValue,
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
                usage_limit:
                    data.usageLimit,
            }),

            ...(data.perUserLimit !== undefined && {
                per_user_limit:
                    data.perUserLimit,
            }),

            ...(data.startsAt !== undefined && {
                starts_at: new Date(
                    data.startsAt
                ),
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

/**
 * Validates a coupon.
 *
 * `db` can be:
 * - normal Prisma client for standalone validation
 * - transaction client (`tx`) when used during order creation
 */
export const validateCoupon = async (
    userId,
    code,
    orderAmount,
    db = prisma
) => {
    if (!code) {
        throw new AppError(
            "Coupon code is required",
            400
        );
    }

    const normalizedCode =
        normalizeCode(code);

    /*
     * Lock the coupon row when this function
     * is executed inside an order transaction.
     *
     * This prevents two concurrent orders from
     * both consuming the last available coupon.
     */
    const couponRows = await db.$queryRaw`
        SELECT id
        FROM coupons
        WHERE code = ${normalizedCode}
        FOR UPDATE
    `;

    if (!couponRows.length) {
        throw new AppError(
            "Invalid coupon code",
            400
        );
    }

    const coupon =
        await db.coupons.findUnique({
            where: {
                id: couponRows[0].id,
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
        toNumber(
            coupon.minimum_order_amount
        );

    if (orderAmount < minimumAmount) {
        throw new AppError(
            `Minimum order amount for this coupon is ₹${minimumAmount}`,
            400
        );
    }

    if (
        coupon.usage_limit !== null &&
        coupon.used_count >=
            coupon.usage_limit
    ) {
        throw new AppError(
            "This coupon usage limit has been reached",
            400
        );
    }

    const userUsageCount =
        await db.coupon_usages.count({
            where: {
                coupon_id: coupon.id,
                user_id: userId,
            },
        });

    if (
        userUsageCount >=
        coupon.per_user_limit
    ) {
        throw new AppError(
            "You have already used this coupon the maximum allowed number of times",
            400
        );
    }

    let discountAmount = 0;

    if (
        coupon.discount_type ===
        "percentage"
    ) {
        discountAmount =
            (orderAmount *
                toNumber(
                    coupon.discount_value
                )) /
            100;

        if (
            coupon.maximum_discount_amount !==
                null &&
            discountAmount >
                toNumber(
                    coupon.maximum_discount_amount
                )
        ) {
            discountAmount =
                toNumber(
                    coupon.maximum_discount_amount
                );
        }
    } else {
        discountAmount = Math.min(
            toNumber(
                coupon.discount_value
            ),
            orderAmount
        );
    }

    return {
        coupon,
        discountAmount:
            roundMoney(discountAmount),
    };
};

/**
 * Records coupon usage after an order is created.
 *
 * This must be called using the same transaction client
 * used to create the order.
 */
export const recordCouponUsage = async (
    db,
    {
        couponId,
        userId,
        orderId,
        discountAmount,
    }
) => {
    await db.coupon_usages.create({
        data: {
            coupon_id: couponId,
            user_id: userId,
            order_id: orderId,
            discount_amount:
                discountAmount,
        },
    });

    await db.coupons.update({
        where: {
            id: couponId,
        },

        data: {
            used_count: {
                increment: 1,
            },

            updated_at: new Date(),
        },
    });
};