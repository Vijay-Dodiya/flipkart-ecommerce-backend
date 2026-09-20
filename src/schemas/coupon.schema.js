import { z } from "zod";

const discountTypeSchema = z.enum([
    "percentage",
    "fixed",
]);

export const createCouponSchema = z.object({
    code: z
        .string()
        .trim()
        .min(3)
        .max(50)
        .transform((value) => value.toUpperCase()),

    discountType: discountTypeSchema,

    discountValue: z
        .number()
        .positive(),

    minimumOrderAmount: z
        .number()
        .nonnegative()
        .optional()
        .default(0),

    maximumDiscountAmount: z
        .number()
        .positive()
        .optional()
        .nullable(),

    usageLimit: z
        .number()
        .int()
        .positive()
        .optional()
        .nullable(),

    perUserLimit: z
        .number()
        .int()
        .positive()
        .optional()
        .default(1),

    startsAt: z
        .string()
        .datetime()
        .optional(),

    expiresAt: z
        .string()
        .datetime()
        .optional()
        .nullable(),

    isActive: z
        .boolean()
        .optional()
        .default(true),
}).superRefine((data, ctx) => {
    if (
        data.discountType === "percentage" &&
        data.discountValue > 100
    ) {
        ctx.addIssue({
            code: "custom",
            path: ["discountValue"],
            message: "Percentage discount cannot exceed 100",
        });
    }

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

    if (
        data.expiresAt &&
        data.startsAt &&
        new Date(data.expiresAt) <= new Date(data.startsAt)
    ) {
        ctx.addIssue({
            code: "custom",
            path: ["expiresAt"],
            message: "Expiry date must be after start date",
        });
    }
});

export const updateCouponSchema = z.object({
    discountValue: z
        .number()
        .positive()
        .optional(),

    minimumOrderAmount: z
        .number()
        .nonnegative()
        .optional(),

    maximumDiscountAmount: z
        .number()
        .positive()
        .nullable()
        .optional(),

    usageLimit: z
        .number()
        .int()
        .positive()
        .nullable()
        .optional(),

    perUserLimit: z
        .number()
        .int()
        .positive()
        .optional(),

    startsAt: z
        .string()
        .datetime()
        .optional(),

    expiresAt: z
        .string()
        .datetime()
        .nullable()
        .optional(),

    isActive: z
        .boolean()
        .optional(),
});