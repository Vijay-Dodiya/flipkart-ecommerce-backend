import { z } from "zod";

export const productSchema = z.object({
    name: z
        .string()
        .min(2, "Product name must be at least 2 characters"),

    description: z
        .string()
        .optional(),

    price: z
        .number()
        .positive("Price must be greater than 0"),

    brand: z
        .string()
        .optional(),

    sku: z
        .string()
        .min(2, "SKU must be at least 2 characters"),

    category_id: z
        .string()
        .uuid("Invalid category ID"),

    quantity: z
        .number()
        .int("Quantity must be an integer")
        .min(0, "Quantity cannot be negative"),
}).strict();