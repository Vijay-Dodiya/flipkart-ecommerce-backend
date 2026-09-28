import { z } from "zod";

export const updateOrderStatusSchema = z.object({
    status: z.enum([
        "processing",
        "shipped",
        "delivered",
    ]),
});

export const createOrderSchema = z.object({
    addressId: z
        .string()
        .uuid("addressId must be a valid UUID"),

    couponCode: z
        .string()
        .trim()
        .min(3, "Coupon code must be at least 3 characters")
        .max(50, "Coupon code cannot exceed 50 characters")
        .transform((value) =>
            value.toUpperCase()
        )
        .optional()
        .nullable(),
});