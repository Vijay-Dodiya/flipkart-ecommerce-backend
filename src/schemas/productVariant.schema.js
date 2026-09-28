import { z } from "zod";

export const createProductVariantSchema = z.object({
    productId: z
        .string()
        .uuid("productId must be a valid UUID"),

    name: z
        .string()
        .trim()
        .min(2, "Variant name must be at least 2 characters")
        .max(255, "Variant name cannot exceed 255 characters"),

    sku: z
        .string()
        .trim()
        .min(2, "SKU must be at least 2 characters")
        .max(100, "SKU cannot exceed 100 characters")
        .transform((value) => value.toUpperCase()),

    price: z
        .number()
        .positive("Price must be greater than 0")
        .nullable()
        .optional(),

    attributes: z
        .record(z.string(), z.any()),

    quantity: z
        .number()
        .int("Quantity must be a whole number")
        .nonnegative("Quantity cannot be negative")
        .default(0),

    lowStockThreshold: z
        .number()
        .int("Low stock threshold must be a whole number")
        .nonnegative("Low stock threshold cannot be negative")
        .default(5),

    isActive: z
        .boolean()
        .optional()
        .default(true),
});

export const updateProductVariantSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2)
            .max(255)
            .optional(),

        sku: z
            .string()
            .trim()
            .min(2)
            .max(100)
            .transform((value) => value.toUpperCase())
            .optional(),

        price: z
            .number()
            .positive()
            .nullable()
            .optional(),

        attributes: z
            .record(z.string(), z.any())
            .optional(),

        quantity: z
            .number()
            .int()
            .nonnegative()
            .optional(),

        lowStockThreshold: z
            .number()
            .int()
            .nonnegative()
            .optional(),

        isActive: z
            .boolean()
            .optional(),
    })
    .refine(
        (data) => Object.keys(data).length > 0,
        {
            message:
                "At least one field is required to update a variant",
        }
    );