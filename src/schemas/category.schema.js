import { z } from "zod";

export const categorySchema = z.object({
    name: z
        .string()
        .min(2, "Category name must be at least 2 characters"),

    slug: z
        .string()
        .min(2, "Category slug must be at least 2 characters")
        .regex(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            "Slug must contain only lowercase letters, numbers, and hyphens"
        ),

    parent_id: z
        .string()
        .uuid("Invalid parent category ID")
        .nullable()
        .optional(),
}).strict();

export const updateCategorySchema = categorySchema.partial();