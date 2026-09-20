import { z } from "zod";

/*
|--------------------------------------------------------------------------
| Create Address Schema
|--------------------------------------------------------------------------
| Used when a user creates a new saved address.
*/
export const createAddressSchema = z.object({
    label: z
        .string()
        .trim()
        .min(2, "Label must be at least 2 characters")
        .max(50, "Label cannot exceed 50 characters"),

    full_name: z
        .string()
        .trim()
        .min(2, "Full name must be at least 2 characters")
        .max(100, "Full name cannot exceed 100 characters"),

    phone: z
        .string()
        .trim()
        .regex(
            /^[6-9]\d{9}$/,
            "Please provide a valid 10-digit Indian mobile number"
        ),

    address_line1: z
        .string()
        .trim()
        .min(5, "Address line 1 must be at least 5 characters")
        .max(255, "Address line 1 cannot exceed 255 characters"),

    address_line2: z
        .string()
        .trim()
        .max(255, "Address line 2 cannot exceed 255 characters")
        .optional()
        .or(z.literal("")),

    city: z
        .string()
        .trim()
        .min(2, "City must be at least 2 characters")
        .max(100, "City cannot exceed 100 characters"),

    state: z
        .string()
        .trim()
        .min(2, "State must be at least 2 characters")
        .max(100, "State cannot exceed 100 characters"),

    postal_code: z
        .string()
        .trim()
        .regex(
            /^[1-9][0-9]{5}$/,
            "Please provide a valid 6-digit Indian postal code"
        ),

    country: z
        .string()
        .trim()
        .min(2, "Country must be at least 2 characters")
        .max(100, "Country cannot exceed 100 characters")
        .default("India"),

    is_default: z
        .boolean()
        .optional()
        .default(false),
});


/*
|--------------------------------------------------------------------------
| Update Address Schema
|--------------------------------------------------------------------------
| Every field is optional because the user may update only one field.
*/
export const updateAddressSchema = z.object({
    label: z
        .string()
        .trim()
        .min(2, "Label must be at least 2 characters")
        .max(50, "Label cannot exceed 50 characters")
        .optional(),

    full_name: z
        .string()
        .trim()
        .min(2, "Full name must be at least 2 characters")
        .max(100, "Full name cannot exceed 100 characters")
        .optional(),

    phone: z
        .string()
        .trim()
        .regex(
            /^[6-9]\d{9}$/,
            "Please provide a valid 10-digit Indian mobile number"
        )
        .optional(),

    address_line1: z
        .string()
        .trim()
        .min(5, "Address line 1 must be at least 5 characters")
        .max(255, "Address line 1 cannot exceed 255 characters")
        .optional(),

    address_line2: z
        .string()
        .trim()
        .max(255, "Address line 2 cannot exceed 255 characters")
        .optional()
        .or(z.literal("")),

    city: z
        .string()
        .trim()
        .min(2, "City must be at least 2 characters")
        .max(100, "City cannot exceed 100 characters")
        .optional(),

    state: z
        .string()
        .trim()
        .min(2, "State must be at least 2 characters")
        .max(100, "State cannot exceed 100 characters")
        .optional(),

    postal_code: z
        .string()
        .trim()
        .regex(
            /^[1-9][0-9]{5}$/,
            "Please provide a valid 6-digit Indian postal code"
        )
        .optional(),

    country: z
        .string()
        .trim()
        .min(2, "Country must be at least 2 characters")
        .max(100, "Country cannot exceed 100 characters")
        .optional(),

    is_default: z
        .boolean()
        .optional(),
});