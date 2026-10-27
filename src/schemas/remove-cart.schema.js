import { z } from "zod";

export const removeCartItemSchema = z
    .object({
        variantId: z
            .string()
            .uuid("variantId must be a valid UUID")
            .nullable()
            .optional(),
    })
    .strict();