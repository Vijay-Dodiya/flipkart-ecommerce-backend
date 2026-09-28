import { z } from "zod";

export const createProductImageSchema = z.object({
    imageUrl: z
        .string()
        .trim()
        .url("Image URL must be a valid URL"),

    altText: z
        .string()
        .trim()
        .max(255, "Alt text cannot exceed 255 characters")
        .optional()
        .nullable(),

    isPrimary: z
        .boolean()
        .optional()
        .default(false),

    sortOrder: z
        .number()
        .int()
        .min(0, "Sort order cannot be negative")
        .optional()
        .default(0),
});

export const updateProductImageSchema = z.object({
    imageUrl: z
        .string()
        .trim()
        .url("Image URL must be a valid URL")
        .optional(),

    altText: z
        .string()
        .trim()
        .max(255, "Alt text cannot exceed 255 characters")
        .optional()
        .nullable(),

    isPrimary: z
        .boolean()
        .optional(),

    sortOrder: z
        .number()
        .int()
        .min(0, "Sort order cannot be negative")
        .optional(),
});