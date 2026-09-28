import { z } from "zod";

export const createReturnSchema = z.object({
    orderId: z
        .string()
        .uuid("Invalid order ID"),

    items: z
        .array(
            z.object({
                orderItemId: z
                    .string()
                    .uuid("Invalid order item ID"),

                quantity: z
                    .number()
                    .int()
                    .positive()
                    .max(100),
            })
        )
        .min(1, "At least one item is required"),

    reason: z.enum([
        "damaged",
        "defective",
        "wrong_item",
        "missing_item",
        "not_as_described",
        "size_issue",
        "changed_mind",
        "other",
    ]),

    customerNote: z
        .string()
        .trim()
        .max(1000)
        .optional(),
});


export const rejectReturnSchema = z.object({
    adminNote: z
        .string()
        .trim()
        .min(3)
        .max(1000),
});


export const approveReturnSchema = z.object({
    adminNote: z
        .string()
        .trim()
        .max(1000)
        .optional(),
});