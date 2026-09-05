import { z } from "zod";

export const inventorySchema = z.object({
    product_id: z
        .string()
        .uuid("Invalid product ID"),

    quantity: z
        .number()
        .int("Quantity must be an integer")
        .min(0, "Quantity cannot be negative"),

    reserved_quantity: z
        .number()
        .int("Reserved quantity must be an integer")
        .min(0, "Reserved quantity cannot be negative")
        .default(0),

    low_stock_threshold: z
        .number()
        .int("Low stock threshold must be an integer")
        .min(0, "Low stock threshold cannot be negative")
        .default(10),
}).strict();