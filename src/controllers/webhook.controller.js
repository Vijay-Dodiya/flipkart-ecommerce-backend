import { asyncHandler } from "../utils/asyncHandler.js";

import {
    handleRazorpayWebhook,
} from "../services/payment.service.js";


export const razorpayWebhookController = asyncHandler(
    async (req, res) => {

        const signature =
            req.headers["x-razorpay-signature"];

        const eventId =
            req.headers["x-razorpay-event-id"];


        const result =
            await handleRazorpayWebhook(
                req.body,
                signature,
                eventId
            );


        return res.status(200).json({
            success: true,
            message: result.message,
            data: result,
        });
    }
);