import { z } from "zod";

export const addToCartSchema = z.object({
    productId: z
        .string()
        .uuid("Invalid product ID"),

    quantity: z
        .number()
        .int("Quantity must be an integer")
        .min(1, "Quantity must be at least 1"),
}).strict();