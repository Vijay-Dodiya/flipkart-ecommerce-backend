import { z } from "zod";

export const productQuerySchema = z
  .object({
    // -------------------------
    // PAGINATION
    // -------------------------

    page: z.coerce
      .number()
      .int("Page must be an integer")
      .min(1, "Page must be at least 1")
      .default(1),

    limit: z.coerce
      .number()
      .int("Limit must be an integer")
      .min(1, "Limit must be at least 1")
      .max(100, "Limit cannot exceed 100")
      .default(10),

    // -------------------------
    // SEARCH
    // -------------------------

    search: z
      .string()
      .trim()
      .min(1, "Search cannot be empty")
      .optional(),

    // -------------------------
    // BRAND FILTER
    // Example:
    // ?brand=Samsung,Apple
    // -------------------------

    brand: z
      .string()
      .trim()
      .min(1, "Brand cannot be empty")
      .transform((value) =>
        value
          .split(",")
          .map((brand) => brand.trim())
          .filter(Boolean),
      )
      .optional(),

    // -------------------------
    // CATEGORY ID FILTER
    // Example:
    // ?categoryId=uuid
    // -------------------------

    categoryId: z
      .string()
      .uuid("Invalid category ID")
      .optional(),

    // -------------------------
    // CATEGORY SLUG FILTER
    // Example:
    // ?category=mobiles-tablets,electronics
    // -------------------------

    category: z
      .string()
      .trim()
      .min(1, "Category cannot be empty")
      .transform((value) =>
        value
          .split(",")
          .map((category) => category.trim())
          .filter(Boolean),
      )
      .optional(),

    // -------------------------
    // PRICE FILTER
    // -------------------------

    minPrice: z.coerce
      .number()
      .min(0, "Minimum price cannot be negative")
      .optional(),

    maxPrice: z.coerce
      .number()
      .min(0, "Maximum price cannot be negative")
      .optional(),

    // -------------------------
    // STOCK FILTER
    // -------------------------

    inStock: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),

    // -------------------------
    // SORTING
    // -------------------------

    sort: z
      .enum([
        "price_asc",
        "price_desc",
        "newest",
        "oldest",
        "name_asc",
        "name_desc",
      ])
      .default("newest"),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.minPrice !== undefined &&
      data.maxPrice !== undefined &&
      data.minPrice > data.maxPrice
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minPrice cannot be greater than maxPrice",
        path: ["minPrice"],
      });
    }
  });