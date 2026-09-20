import { z } from "zod";

// Admin can manually move an already-paid order
// through these fulfillment statuses.
//
// "confirmed" is NOT included here because
// successful payment already changes:
//
// pending → confirmed
//
// inside the payment service.

export const updateOrderStatusSchema = z.object({
    status: z.enum([
        "processing",
        "shipped",
        "delivered",
    ]),
});

export const createOrderSchema = z.object({
    addressId: z
        .string()
        .uuid("addressId must be a valid UUID"),
});