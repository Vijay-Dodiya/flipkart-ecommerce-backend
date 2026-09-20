import { z } from "zod";

export const createReviewSchema = z.object({
    rating: z
        .number()
        .int("Rating must be a whole number")
        .min(1, "Rating must be at least 1")
        .max(5, "Rating cannot be greater than 5"),

    review: z
        .string()
        .trim()
        .max(2000, "Review cannot exceed 2000 characters")
        .optional()
        .nullable(),
});

export const updateReviewSchema = z.object({
    rating: z
        .number()
        .int("Rating must be a whole number")
        .min(1, "Rating must be at least 1")
        .max(5, "Rating cannot be greater than 5")
        .optional(),

    review: z
        .string()
        .trim()
        .max(2000, "Review cannot exceed 2000 characters")
        .optional()
        .nullable(),
}).refine(
    (data) =>
        data.rating !== undefined ||
        data.review !== undefined,
    {
        message: "At least one field must be provided",
    }
);