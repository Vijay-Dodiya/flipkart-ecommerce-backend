import { z } from "zod";
export const updateCartSchema = z
  .object({
    quantity: z
      .number()
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1"),
    variantId: z
      .string()
      .uuid("variantId must be a valid UUID")
      .nullable()
      .optional(),
  })
  .strict();
