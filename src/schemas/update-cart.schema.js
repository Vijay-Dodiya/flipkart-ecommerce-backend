import { z } from "zod";

export const updateCartSchema = z.object({
    quantity: z
        .number()
        .int("Quantity must be an integer")
        .min(1, "Quantity must be at least 1"),
}).strict();