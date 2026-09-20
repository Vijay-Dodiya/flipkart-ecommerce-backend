import { z } from "zod";

export const createOrderStatusHistorySchema = z.object({
    status: z.string()
        .trim()
        .min(2, "Status is required")
        .max(30, "Status must not exceed 30 characters"),

    actorType: z.enum([
        "system",
        "admin",
        "customer",
    ]),

    reason: z.string()
        .trim()
        .max(255, "Reason must not exceed 255 characters")
        .optional(),
});