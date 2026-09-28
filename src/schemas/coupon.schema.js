import { z } from "zod";

const discountTypeSchema = z.enum([
    "percentage",
    "fixed",
]);

// ============================================================
// CREATE COUPON
// ============================================================

export const createCouponSchema = z
    .object({
        code: z
            .string()
            .trim()
            .min(3, "Coupon code must be at least 3 characters")
            .max(50, "Coupon code cannot exceed 50 characters")
            .transform((value) => value.toUpperCase()),

        discountType: discountTypeSchema,

        discountValue: z
            .number()
            .positive("Discount value must be greater than 0"),

        minimumOrderAmount: z
            .number()
            .nonnegative(
                "Minimum order amount cannot be negative"
            )
            .optional()
            .default(0),

        maximumDiscountAmount: z
            .number()
            .positive(
                "Maximum discount amount must be greater than 0"
            )
            .optional()
            .nullable(),

        usageLimit: z
            .number()
            .int("Usage limit must be a whole number")
            .positive("Usage limit must be greater than 0")
            .optional()
            .nullable(),

        perUserLimit: z
            .number()
            .int("Per-user limit must be a whole number")
            .positive("Per-user limit must be greater than 0")
            .optional()
            .default(1),

        startsAt: z
            .coerce
            .date()
            .optional(),

        expiresAt: z
            .coerce
            .date()
            .optional()
            .nullable(),

        isActive: z
            .boolean()
            .optional()
            .default(true),
    })
    .superRefine((data, ctx) => {
        // Percentage discount cannot exceed 100%
        if (
            data.discountType === "percentage" &&
            data.discountValue > 100
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["discountValue"],
                message:
                    "Percentage discount cannot exceed 100",
            });
        }

        // Maximum discount is only for percentage coupons
        if (
            data.discountType === "fixed" &&
            data.maximumDiscountAmount !== null &&
            data.maximumDiscountAmount !== undefined
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["maximumDiscountAmount"],
                message:
                    "Maximum discount amount is only applicable to percentage coupons",
            });
        }

        // Expiry must be after start
        if (
            data.startsAt &&
            data.expiresAt &&
            data.expiresAt <= data.startsAt
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["expiresAt"],
                message:
                    "Expiry date must be after start date",
            });
        }
    });

// ============================================================
// UPDATE COUPON
// ============================================================

export const updateCouponSchema = z
    .object({
        discountValue: z
            .number()
            .positive(
                "Discount value must be greater than 0"
            )
            .optional(),

        minimumOrderAmount: z
            .number()
            .nonnegative(
                "Minimum order amount cannot be negative"
            )
            .optional(),

        maximumDiscountAmount: z
            .number()
            .positive(
                "Maximum discount amount must be greater than 0"
            )
            .nullable()
            .optional(),

        usageLimit: z
            .number()
            .int("Usage limit must be a whole number")
            .positive("Usage limit must be greater than 0")
            .nullable()
            .optional(),

        perUserLimit: z
            .number()
            .int("Per-user limit must be a whole number")
            .positive("Per-user limit must be greater than 0")
            .optional(),

        startsAt: z
            .coerce
            .date()
            .optional(),

        expiresAt: z
            .coerce
            .date()
            .nullable()
            .optional(),

        isActive: z
            .boolean()
            .optional(),
    })
    .superRefine((data, ctx) => {
        // When both dates are supplied in the update,
        // expiry must be after start.
        if (
            data.startsAt &&
            data.expiresAt &&
            data.expiresAt <= data.startsAt
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["expiresAt"],
                message:
                    "Expiry date must be after start date",
            });
        }

        // Do not allow an empty update request
        if (Object.keys(data).length === 0) {
            ctx.addIssue({
                code: "custom",
                path: [],
                message:
                    "At least one field is required to update a coupon",
            });
        }
    });