import { z } from "zod";


/*
|--------------------------------------------------------------------------
| Create Shipment Schema
|--------------------------------------------------------------------------
*/

export const createShipmentSchema = z.object({
    carrier: z
        .string()
        .trim()
        .min(2, "Carrier is required")
        .max(100),

    trackingNumber: z
        .string()
        .trim()
        .min(2, "Tracking number is required")
        .max(100),
});


/*
|--------------------------------------------------------------------------
| Update Shipment Status Schema
|--------------------------------------------------------------------------
*/

export const updateShipmentStatusSchema = z.object({
    status: z.enum([
        "shipped",
        "in_transit",
        "out_for_delivery",
        "delivered",
    ]),
});


/*
|--------------------------------------------------------------------------
| Add Tracking Event Schema
|--------------------------------------------------------------------------
|
| These are general logistics events.
|
| They do NOT automatically change the shipment's main status.
|
| Example:
|
| status: "facility_arrival"
| description: "Package arrived at Indore sorting facility"
| location: "Indore, Madhya Pradesh"
|
*/

export const addTrackingEventSchema = z.object({
    status: z
        .string()
        .trim()
        .min(2, "Tracking event status is required")
        .max(50),

    description: z
        .string()
        .trim()
        .max(255)
        .optional(),

    location: z
        .string()
        .trim()
        .max(255)
        .optional(),
});


/*
|--------------------------------------------------------------------------
| Record Delivery Attempt Schema
|--------------------------------------------------------------------------
|
| Used when the delivery agent attempts to deliver the package.
|
| This creates a tracking event:
|
| status = "delivery_attempted"
|
| It does NOT change the shipment's main status.
|
*/

export const recordDeliveryAttemptSchema = z.object({
    description: z
        .string()
        .trim()
        .max(255)
        .optional(),

    location: z
        .string()
        .trim()
        .max(255)
        .optional(),
});


/*
|--------------------------------------------------------------------------
| Record Failed Delivery Schema
|--------------------------------------------------------------------------
|
| Used when a delivery attempt could not be completed.
|
| Example reasons:
|
| - Customer unavailable
| - Address issue
| - Customer refused delivery
|
| This creates a tracking event:
|
| status = "delivery_failed"
|
*/

export const recordFailedDeliverySchema = z.object({
    reason: z
        .string()
        .trim()
        .min(2, "Failure reason is required")
        .max(255),

    location: z
        .string()
        .trim()
        .max(255)
        .optional(),
});


/*
|--------------------------------------------------------------------------
| Record Return To Sender Schema
|--------------------------------------------------------------------------
|
| Used when the shipment is being returned to the sender.
|
| This creates a tracking event:
|
| status = "return_to_sender"
|
*/

export const recordReturnToSenderSchema = z.object({
    reason: z
        .string()
        .trim()
        .min(2, "Return reason is required")
        .max(255),

    location: z
        .string()
        .trim()
        .max(255)
        .optional(),
});