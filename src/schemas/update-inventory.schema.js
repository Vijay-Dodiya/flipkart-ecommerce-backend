import { z } from "zod";

export const updateInventorySchema = z
    .object({
        quantity: z
            .number()
            .int("Quantity must be an integer")
            .min(0, "Quantity cannot be negative")
            .optional(),

        reserved_quantity: z
            .number()
            .int("Reserved quantity must be an integer")
            .min(0, "Reserved quantity cannot be negative")
            .optional(),

        low_stock_threshold: z
            .number()
            .int("Low stock threshold must be an integer")
            .min(0, "Low stock threshold cannot be negative")
            .optional(),
    })
    .strict()
    .refine(
        (data) => Object.keys(data).length > 0,
        {
            message: "At least one inventory field must be provided",
        }
    );
