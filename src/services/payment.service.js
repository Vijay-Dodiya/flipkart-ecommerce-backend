import crypto from "crypto";

import razorpay from "../config/razorpay.js";
import prisma from "../config/prisma.js";

import AppError from "../utils/AppError.js";


// ============================================================
// CREATE RAZORPAY ORDER
// ============================================================

export const createRazorpayOrder = async (userId, orderId) => {

    // Find our internal order
    const order = await prisma.orders.findFirst({
        where: {
            id: orderId,
            user_id: userId,
        },
    });

    if (!order) {
        throw new AppError("Order not found", 404);
    }

    // Do not create another payment for an already paid order
    if (order.payment_status === "paid") {
        throw new AppError("Order is already paid", 400);
    }

    // Do not allow payment for cancelled orders
    if (order.status === "cancelled") {
        throw new AppError(
            "Cannot create payment for a cancelled order",
            400
        );
    }


    // --------------------------------------------------------
    // If Razorpay order already exists, reuse it
    // --------------------------------------------------------

    if (order.razorpay_order_id) {

        return {
            razorpayOrderId: order.razorpay_order_id,

            amount: Math.round(
                Number(order.total_amount) * 100
            ),

            currency: "INR",
        };
    }


    // --------------------------------------------------------
    // Convert rupees to paise
    // Example:
    // ₹1499.99 -> 149999 paise
    // --------------------------------------------------------

    const amountInPaise = Math.round(
        Number(order.total_amount) * 100
    );


    // --------------------------------------------------------
    // Create Razorpay order
    // --------------------------------------------------------

    const razorpayOrder = await razorpay.orders.create({

        amount: amountInPaise,

        currency: "INR",

        // Our internal order ID
        // This helps us identify the order later
        receipt: order.id,
    });


    // --------------------------------------------------------
    // Save Razorpay order ID in PostgreSQL
    // --------------------------------------------------------

    await prisma.orders.update({

        where: {
            id: order.id,
        },

        data: {
            razorpay_order_id: razorpayOrder.id,
        },
    });


    return {

        razorpayOrderId: razorpayOrder.id,

        amount: razorpayOrder.amount,

        currency: razorpayOrder.currency,
    };
};



// ============================================================
// VERIFY RAZORPAY PAYMENT
// ============================================================

export const verifyRazorpayPayment = async (

    userId,

    orderId,

    razorpayPaymentId,

    razorpayOrderId,

    razorpaySignature

) => {


    // ========================================================
    // STEP 1 — Validate required values
    // ========================================================

    if (
        !razorpayPaymentId ||
        !razorpayOrderId ||
        !razorpaySignature
    ) {
        throw new AppError(
            "Payment verification data is incomplete",
            400
        );
    }


    // ========================================================
    // STEP 2 — Find our internal order
    // ========================================================

    const order = await prisma.orders.findFirst({

        where: {
            id: orderId,
            user_id: userId,
        },
    });


    if (!order) {
        throw new AppError("Order not found", 404);
    }


    // ========================================================
    // STEP 3 — Check order state
    // ========================================================

    if (order.status === "cancelled") {

        throw new AppError(
            "Cannot verify payment for a cancelled order",
            400
        );
    }


    // ========================================================
    // STEP 4 — Make sure Razorpay order belongs to our order
    // ========================================================

    if (
        !order.razorpay_order_id ||
        order.razorpay_order_id !== razorpayOrderId
    ) {

        throw new AppError(
            "Razorpay order does not match our order",
            400
        );
    }


    // ========================================================
    // STEP 5 — Verify Razorpay signature
    // ========================================================

    if (!process.env.RAZORPAY_KEY_SECRET) {

        throw new Error(
            "RAZORPAY_KEY_SECRET is not configured"
        );
    }


    const generatedSignature = crypto

        .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
        )

        .update(
            `${order.razorpay_order_id}|${razorpayPaymentId}`
        )

        .digest("hex");


    if (generatedSignature !== razorpaySignature) {

        throw new AppError(
            "Payment signature verification failed",
            400
        );
    }


    // ========================================================
    // STEP 6 — Fetch actual payment from Razorpay
    // ========================================================

    let razorpayPayment;

    try {

        razorpayPayment =
            await razorpay.payments.fetch(
                razorpayPaymentId
            );

    } catch (error) {

        console.error(
            "Razorpay payment fetch failed:",
            error
        );

        throw new AppError(
            "Unable to verify payment with Razorpay",
            502
        );
    }


    // ========================================================
    // STEP 7 — Make sure payment belongs to our Razorpay order
    // ========================================================

    if (
        razorpayPayment.order_id !==
        order.razorpay_order_id
    ) {

        throw new AppError(
            "Payment does not belong to this Razorpay order",
            400
        );
    }


    // ========================================================
    // STEP 8 — Check payment amount
    // ========================================================

    const expectedAmountInPaise = Math.round(
        Number(order.total_amount) * 100
    );


    if (
        razorpayPayment.amount !==
        expectedAmountInPaise
    ) {

        throw new AppError(
            "Payment amount does not match order amount",
            400
        );
    }


    // ========================================================
    // STEP 9 — Check currency
    // ========================================================

    if (razorpayPayment.currency !== "INR") {

        throw new AppError(
            "Invalid payment currency",
            400
        );
    }


    // ========================================================
    // STEP 10 — Payment must be captured
    // ========================================================

    if (razorpayPayment.status !== "captured") {

        throw new AppError(
            `Payment is not captured. Current status: ${razorpayPayment.status}`,
            400
        );
    }


    // ========================================================
    // STEP 11 — Finalize payment + inventory atomically
    // ========================================================

    const updatedOrder = await prisma.$transaction(
        async (tx) => {

            // -----------------------------------------------
            // Re-fetch order inside transaction
            // This protects against duplicate verification
            // requests arriving at the same time.
            // -----------------------------------------------

            const currentOrder =
                await tx.orders.findFirst({

                    where: {
                        id: orderId,
                        user_id: userId,
                    },

                    include: {
                        order_items: true,
                    },
                });


            if (!currentOrder) {

                throw new AppError(
                    "Order not found",
                    404
                );
            }


            // -----------------------------------------------
            // If another request already completed payment
            // -----------------------------------------------

            if (
                currentOrder.payment_status === "paid"
            ) {

                // Same payment = safe duplicate request
                if (
                    currentOrder.razorpay_payment_id ===
                    razorpayPaymentId
                ) {

                    return currentOrder;
                }


                // Different payment attempting to pay an
                // already-paid order
                throw new AppError(
                    "Order has already been paid",
                    400
                );
            }


            // -----------------------------------------------
            // Make sure order is not cancelled
            // -----------------------------------------------

            if (
                currentOrder.status === "cancelled"
            ) {

                throw new AppError(
                    "Cannot complete payment for a cancelled order",
                    400
                );
            }


            // -----------------------------------------------
            // Finalize every order item
            // -----------------------------------------------

            for (
                const item of currentOrder.order_items
            ) {

                // Reduce actual inventory quantity
                // and release the reserved quantity.
                //
                // Example:
                //
                // quantity = 20
                // reserved = 1
                //
                // After payment:
                //
                // quantity = 19
                // reserved = 0

                const inventoryUpdate =
                    await tx.inventory.updateMany({

                        where: {
                            product_id: item.product_id,

                            // Safety checks
                            quantity: {
                                gte: item.quantity,
                            },

                            reserved_quantity: {
                                gte: item.quantity,
                            },
                        },

                        data: {

                            quantity: {
                                decrement: item.quantity,
                            },

                            reserved_quantity: {
                                decrement: item.quantity,
                            },
                        },
                    });


                // -------------------------------------------
                // If no inventory row was updated, something
                // went wrong with stock data.
                // -------------------------------------------

                if (
                    inventoryUpdate.count !== 1
                ) {

                    throw new AppError(
                        `Unable to finalize inventory for product ${item.product_id}`,
                        409
                    );
                }
            }


            // -----------------------------------------------
            // Mark order as paid and confirmed
            // -----------------------------------------------

            const finalOrder =
                await tx.orders.update({

                    where: {
                        id: currentOrder.id,
                    },

                    data: {

                        razorpay_payment_id:
                            razorpayPaymentId,

                        payment_status:
                            "paid",

                        status:
                            "confirmed",
                    },

                    include: {
                        order_items: true,
                    },
                });


            return finalOrder;
        }
    );


    // ========================================================
    // STEP 12 — Return updated order
    // ========================================================

    return updatedOrder;
};


// ============================================================
// HANDLE RAZORPAY WEBHOOK
// ============================================================

export const handleRazorpayWebhook = async (
    rawBody,
    webhookSignature,
    eventId
) => {

    // ========================================================
    // STEP 1 — Validate configuration
    // ========================================================

    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
        throw new Error(
            "RAZORPAY_WEBHOOK_SECRET is not configured"
        );
    }


    // ========================================================
    // STEP 2 — Validate required webhook headers
    // ========================================================

    if (!webhookSignature) {
        throw new AppError(
            "Razorpay webhook signature is missing",
            400
        );
    }

    if (!eventId) {
        throw new AppError(
            "Razorpay event ID is missing",
            400
        );
    }


    // ========================================================
    // STEP 3 — Verify webhook signature
    //
    // IMPORTANT:
    // rawBody must be the original request body.
    // Do NOT JSON.stringify(req.body) here.
    // ========================================================

    const expectedSignature = crypto
        .createHmac(
            "sha256",
            process.env.RAZORPAY_WEBHOOK_SECRET
        )
        .update(rawBody)
        .digest("hex");


    if (
        !crypto.timingSafeEqual(
            Buffer.from(expectedSignature),
            Buffer.from(webhookSignature)
        )
    ) {
        throw new AppError(
            "Invalid Razorpay webhook signature",
            400
        );
    }


    // ========================================================
    // STEP 4 — Parse raw JSON body
    // ========================================================

    let webhookData;

    try {

        webhookData = JSON.parse(
            rawBody.toString("utf8")
        );

    } catch (error) {

        throw new AppError(
            "Invalid webhook JSON payload",
            400
        );
    }


    const event = webhookData.event;


    // ========================================================
    // STEP 5 — Only process payment events that can
    //          finalize an order
    // ========================================================

    if (
        event !== "payment.captured" &&
        event !== "order.paid"
    ) {

        // We don't need to modify the order for events
        // such as payment.failed at this stage.

        return {
            processed: false,
            message: `Webhook event ${event} received but no action was required`,
        };
    }


    // ========================================================
    // STEP 6 — Extract payment entity
    // ========================================================

    const payment =
        webhookData?.payload?.payment?.entity;


    if (!payment) {

        throw new AppError(
            "Payment information missing from webhook",
            400
        );
    }


    const razorpayOrderId =
        payment.order_id;

    const razorpayPaymentId =
        payment.id;


    if (
        !razorpayOrderId ||
        !razorpayPaymentId
    ) {

        throw new AppError(
            "Invalid payment information in webhook",
            400
        );
    }


    // ========================================================
    // STEP 7 — Process everything in ONE transaction
    // ========================================================

    try {

        const result =
            await prisma.$transaction(
                async (tx) => {

                    // ----------------------------------------
                    // Check duplicate webhook
                    // ----------------------------------------

                    const existingEvent =
                        await tx.payment_webhook_events.findUnique({

                            where: {
                                event_id: eventId,
                            },
                        });


                    if (existingEvent) {

                        return {
                            duplicate: true,
                            order: null,
                        };
                    }


                    // ----------------------------------------
                    // Find our internal order
                    // ----------------------------------------

                    const order =
                        await tx.orders.findFirst({

                            where: {
                                razorpay_order_id:
                                    razorpayOrderId,
                            },

                            include: {
                                order_items: true,
                            },
                        });


                    if (!order) {

                        throw new AppError(
                            "Internal order not found for Razorpay order",
                            404
                        );
                    }


                    // ----------------------------------------
                    // Verify payment amount
                    // ----------------------------------------

                    const expectedAmount =
                        Math.round(
                            Number(order.total_amount) * 100
                        );


                    if (
                        payment.amount !==
                        expectedAmount
                    ) {

                        throw new AppError(
                            "Webhook payment amount does not match order amount",
                            400
                        );
                    }


                    // ----------------------------------------
                    // Verify currency
                    // ----------------------------------------

                    if (
                        payment.currency !== "INR"
                    ) {

                        throw new AppError(
                            "Invalid webhook payment currency",
                            400
                        );
                    }


                    // ----------------------------------------
                    // Verify payment status
                    // ----------------------------------------

                    if (
                        payment.status !== "captured"
                    ) {

                        throw new AppError(
                            "Webhook payment is not captured",
                            400
                        );
                    }


                    // ----------------------------------------
                    // Record webhook event
                    // ----------------------------------------

                    await tx.payment_webhook_events.create({

                        data: {
                            event_id: eventId,
                            event: event,
                        },
                    });


                    // ----------------------------------------
                    // Already-paid order
                    // ----------------------------------------

                    if (
                        order.payment_status === "paid"
                    ) {

                        return {
                            duplicate: false,
                            alreadyPaid: true,
                            order: order,
                        };
                    }


                    // ----------------------------------------
                    // Cancelled order
                    // ----------------------------------------

                    if (
                        order.status === "cancelled"
                    ) {

                        throw new AppError(
                            "Cannot complete payment for cancelled order",
                            400
                        );
                    }


                    // ----------------------------------------
                    // Finalize inventory
                    // ----------------------------------------

                    for (
                        const item of order.order_items
                    ) {

                        const inventoryUpdate =
                            await tx.inventory.updateMany({

                                where: {

                                    product_id:
                                        item.product_id,

                                    quantity: {
                                        gte: item.quantity,
                                    },

                                    reserved_quantity: {
                                        gte: item.quantity,
                                    },
                                },

                                data: {

                                    quantity: {
                                        decrement:
                                            item.quantity,
                                    },

                                    reserved_quantity: {
                                        decrement:
                                            item.quantity,
                                    },
                                },
                            });


                        if (
                            inventoryUpdate.count !== 1
                        ) {

                            throw new AppError(
                                `Unable to finalize inventory for product ${item.product_id}`,
                                409
                            );
                        }
                    }


                    // ----------------------------------------
                    // Mark order as paid
                    // ----------------------------------------

                    const updatedOrder =
                        await tx.orders.update({

                            where: {
                                id: order.id,
                            },

                            data: {

                                razorpay_payment_id:
                                    razorpayPaymentId,

                                payment_status:
                                    "paid",

                                status:
                                    "confirmed",
                            },
                        });


                    return {
                        duplicate: false,
                        alreadyPaid: false,
                        order: updatedOrder,
                    };
                }
            );


        // ====================================================
        // Duplicate event
        // ====================================================

        if (result.duplicate) {

            return {
                processed: false,
                duplicate: true,
                message:
                    "Webhook event already processed",
            };
        }


        // ====================================================
        // Already paid
        // ====================================================

        if (result.alreadyPaid) {

            return {
                processed: false,
                duplicate: false,
                message:
                    "Order was already paid",
            };
        }


        // ====================================================
        // Successfully processed
        // ====================================================

        return {
            processed: true,
            duplicate: false,
            message:
                "Razorpay webhook processed successfully",
            orderId: result.order.id,
        };

    } catch (error) {

        // Prisma duplicate event race condition
        if (error?.code === "P2002") {

            return {
                processed: false,
                duplicate: true,
                message:
                    "Webhook event already processed",
            };
        }

        throw error;
    }
};