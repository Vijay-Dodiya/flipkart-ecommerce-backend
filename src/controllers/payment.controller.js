import { asyncHandler } from "../utils/asyncHandler.js";

import {
    createRazorpayOrder,
    verifyRazorpayPayment
} from "../services/payment.service.js";

export const createRazorpayOrderController = asyncHandler(
    async (req, res) => {
        const { id: userId } = req.user;
        const { id: orderId } = req.params;

        const paymentOrder = await createRazorpayOrder(
            userId,
            orderId
        );

        res.status(201).json({
            success: true,
            message: "Razorpay order created successfully",
            data: paymentOrder,
        });
    }
);

export const verifyRazorpayPaymentController = asyncHandler(
    async (req, res) => {
        const { id: userId } = req.user;
        const { id: orderId } = req.params;

        const {
            razorpayPaymentId,
            razorpayOrderId,
            razorpaySignature,
        } = req.body;

        const updatedOrder = await verifyRazorpayPayment(
            userId,
            orderId,
            razorpayPaymentId,
            razorpayOrderId,
            razorpaySignature
        );

        res.status(200).json({
            success: true,
            message: "Payment verified successfully",
            data: {
                orderId: updatedOrder.id,
                paymentStatus: updatedOrder.payment_status,
                orderStatus: updatedOrder.status,
                razorpayPaymentId:
                    updatedOrder.razorpay_payment_id,
            },
        });
    }
);