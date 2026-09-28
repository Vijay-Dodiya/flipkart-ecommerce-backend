import { z } from "zod";

export const addToCartSchema = z
  .object({
    productId: z.string().uuid("Invalid product ID"),

    variantId: z
      .string()
      .uuid("variantId must be a valid UUID")
      .nullable()
      .optional(),

    quantity: z
      .number()
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1"),
  })
  .strict();
