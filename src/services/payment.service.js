import crypto from "crypto";

import razorpay from "../config/razorpay.js";

import prisma from "../config/prisma.js";

import AppError from "../utils/AppError.js";

import { createOrderStatusHistory } from "./orderStatusHistory.service.js";

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const PAYMENT_STATUS = {
  PENDING: "pending",

  PAID: "paid",

  FAILED: "failed",

  REFUNDED: "refunded",
};

const ORDER_STATUS = {
  PENDING: "pending",

  CONFIRMED: "confirmed",

  PROCESSING: "processing",

  SHIPPED: "shipped",

  DELIVERED: "delivered",

  CANCELLED: "cancelled",
};

const REFUND_STATUS = {
  PENDING: "pending",

  PROCESSED: "processed",

  FAILED: "failed",
};

const RETURN_STATUS = {
  RECEIVED: "received",

  REFUNDED: "refunded",
};

const RAZORPAY_CURRENCY = "INR";

/*
|--------------------------------------------------------------------------
| Utility Functions
|--------------------------------------------------------------------------
*/

/**
 * Convert order amount to paise.
 *
 * PostgreSQL Decimal values may arrive as Decimal objects/strings,
 * therefore Number() is intentionally used here.
 */
const getAmountInPaise = (amount) => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw new AppError("Invalid order amount", 500);
  }

  return Math.round(numericAmount * 100);
};

/**
 * Generate Razorpay payment signature.
 */
const generatePaymentSignature = (razorpayOrderId, razorpayPaymentId) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (!secret) {
    throw new AppError("Razorpay secret is not configured", 500);
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
};

/**
 * Compare signatures safely.
 */
const isValidSignature = (expectedSignature, receivedSignature) => {
  if (
    !expectedSignature ||
    !receivedSignature ||
    expectedSignature.length !== receivedSignature.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(receivedSignature),
  );
};

/**
 * Validate payment amount and currency against our order.
 */
const validatePaymentAmount = (payment, order) => {
  const expectedAmount = getAmountInPaise(order.total_amount);

  if (payment.amount !== expectedAmount) {
    throw new AppError("Payment amount does not match order amount", 400);
  }

  if (payment.currency !== RAZORPAY_CURRENCY) {
    throw new AppError("Invalid payment currency", 400);
  }
};

/**
 * Validate common payment/order relationship.
 */
const validatePaymentOrderRelationship = (payment, order) => {
  if (payment.order_id !== order.razorpay_order_id) {
    throw new AppError("Payment does not belong to this order", 400);
  }

  validatePaymentAmount(payment, order);
};

/*
|--------------------------------------------------------------------------
| Razorpay Refund
|--------------------------------------------------------------------------
*/

/**
 * Request a refund from Razorpay.
 *
 * This function only talks to Razorpay.
 * Database state changes happen separately.
 */
export const requestRazorpayRefund = async (
  paymentId,
  amountInPaise,
  orderId,
  reason = "Order cancelled by customer",
  notes = {},
) => {
  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: amountInPaise,
      notes: {
        order_id: orderId,
        reason,
        ...notes,
      },
    });

    return refund;
  } catch (error) {
    console.error("Razorpay refund failed:", error?.error || error);

    throw new AppError("Unable to initiate Razorpay refund", 502);
  }
};

/*
|--------------------------------------------------------------------------
| Inventory Helpers
|--------------------------------------------------------------------------
*/

/**
 * Restore inventory after a paid order
 * is cancelled/refunded.
 *
 * Normal product:
 *     inventory.quantity += quantity
 *
 * Variant:
 *     variant_inventory.quantity += quantity
 *
 * reserved_quantity is NOT increased because
 * successful payment already converted reserved
 * stock into sold stock.
 */
const restorePaidOrderInventory = async (tx, orderId) => {
  const items = await tx.order_items.findMany({
    where: {
      order_id: orderId,
    },

    select: {
      product_id: true,

      variant_id: true,

      quantity: true,
    },
  });

  if (!items.length) {
    throw new AppError("Order has no items", 500);
  }

  for (const item of items) {
    /*
        |--------------------------------------------------------------------------
        | Variant inventory
        |--------------------------------------------------------------------------
        */

    if (item.variant_id) {
      const result = await tx.variant_inventory.updateMany({
        where: {
          variant_id: item.variant_id,
        },

        data: {
          quantity: {
            increment: item.quantity,
          },

          updated_at: new Date(),
        },
      });

      if (result.count !== 1) {
        throw new AppError(
          `Variant inventory not found for variant ${item.variant_id}`,
          500,
        );
      }

      continue;
    }

    /*
        |--------------------------------------------------------------------------
        | Normal product inventory
        |--------------------------------------------------------------------------
        */

    const result = await tx.inventory.updateMany({
      where: {
        product_id: item.product_id,
      },

      data: {
        quantity: {
          increment: item.quantity,
        },

        updated_at: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new AppError(
        `Inventory not found for product ${item.product_id}`,
        500,
      );
    }
  }
};

/**
 * Release reserved inventory for an unpaid order.
 *
 * Normal product:
 *     inventory.reserved_quantity -= quantity
 *
 * Variant:
 *     variant_inventory.reserved_quantity -= quantity
 */
const releaseReservedInventory = async (tx, orderId) => {
  const items = await tx.order_items.findMany({
    where: {
      order_id: orderId,
    },

    select: {
      product_id: true,

      variant_id: true,

      quantity: true,
    },
  });

  if (!items.length) {
    throw new AppError("Order has no items", 500);
  }

  for (const item of items) {
    /*
        |--------------------------------------------------------------------------
        | Variant inventory
        |--------------------------------------------------------------------------
        */

    if (item.variant_id) {
      const result = await tx.variant_inventory.updateMany({
        where: {
          variant_id: item.variant_id,

          reserved_quantity: {
            gte: item.quantity,
          },
        },

        data: {
          reserved_quantity: {
            decrement: item.quantity,
          },

          updated_at: new Date(),
        },
      });

      if (result.count !== 1) {
        throw new AppError(
          `Unable to release inventory for variant ${item.variant_id}`,
          409,
        );
      }

      continue;
    }

    /*
        |--------------------------------------------------------------------------
        | Normal product inventory
        |--------------------------------------------------------------------------
        */

    const result = await tx.inventory.updateMany({
      where: {
        product_id: item.product_id,

        reserved_quantity: {
          gte: item.quantity,
        },
      },

      data: {
        reserved_quantity: {
          decrement: item.quantity,
        },

        updated_at: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new AppError(
        `Unable to release inventory for product ${item.product_id}`,
        409,
      );
    }
  }
};

/*
|--------------------------------------------------------------------------
| Successful Payment Finalization
|--------------------------------------------------------------------------
*/

/**
 * Finalize a successfully captured payment.
 *
 * This function must run inside a Prisma transaction.
 */
const finalizeSuccessfulPayment = async (
  tx,
  order,
  paymentId,
  historyReason,
) => {
  /*
    |--------------------------------------------------------------------------
    | Duplicate-safe check
    |--------------------------------------------------------------------------
    */

  if (order.payment_status === PAYMENT_STATUS.PAID) {
    if (order.razorpay_payment_id && order.razorpay_payment_id !== paymentId) {
      throw new AppError("Order is already paid with another payment", 409);
    }

    return {
      order,

      alreadyPaid: true,
    };
  }

  if (order.payment_status === PAYMENT_STATUS.REFUNDED) {
    throw new AppError("Payment has already been refunded", 409);
  }

  /*
    |--------------------------------------------------------------------------
    | Cancelled order protection
    |--------------------------------------------------------------------------
    */

  if (order.status === ORDER_STATUS.CANCELLED) {
    throw new AppError("Cancelled order cannot be marked as paid", 409);
  }

  /*
    |--------------------------------------------------------------------------
    | Load order items
    |--------------------------------------------------------------------------
    */

  const items = await tx.order_items.findMany({
    where: {
      order_id: order.id,
    },

    select: {
      product_id: true,

      variant_id: true,

      quantity: true,
    },
  });

  if (!items.length) {
    throw new AppError("Order has no items", 500);
  }

  /*
    |--------------------------------------------------------------------------
    | Convert reserved stock into sold stock
    |--------------------------------------------------------------------------
    |
    | Normal product:
    |
    | quantity            -= order quantity
    | reserved_quantity   -= order quantity
    |
    |
    | Variant:
    |
    | variant_inventory.quantity
    |                     -= order quantity
    |
    | variant_inventory.reserved_quantity
    |                     -= order quantity
    |
    |--------------------------------------------------------------------------
    */

  for (const item of items) {
    /*
        |--------------------------------------------------------------------------
        | Variant inventory
        |--------------------------------------------------------------------------
        */

    if (item.variant_id) {
      const result = await tx.variant_inventory.updateMany({
        where: {
          variant_id: item.variant_id,

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

          updated_at: new Date(),
        },
      });

      if (result.count !== 1) {
        throw new AppError(
          `Insufficient inventory for variant ${item.variant_id}`,
          409,
        );
      }

      continue;
    }

    /*
        |--------------------------------------------------------------------------
        | Normal product inventory
        |--------------------------------------------------------------------------
        */

    const result = await tx.inventory.updateMany({
      where: {
        product_id: item.product_id,

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

        updated_at: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new AppError(
        `Insufficient inventory for product ${item.product_id}`,
        409,
      );
    }
  }

  /*
    |--------------------------------------------------------------------------
    | Mark order as paid and confirmed
    |--------------------------------------------------------------------------
    */

  const updatedOrder = await tx.orders.update({
    where: {
      id: order.id,
    },

    data: {
      payment_status: PAYMENT_STATUS.PAID,

      status: ORDER_STATUS.CONFIRMED,

      razorpay_payment_id: paymentId,

      confirmed_at: order.confirmed_at || new Date(),

      updated_at: new Date(),
    },
  });

  /*
    |--------------------------------------------------------------------------
    | Record status history
    |--------------------------------------------------------------------------
    */

  await createOrderStatusHistory(
    tx,

    order.id,

    ORDER_STATUS.CONFIRMED,

    null,

    historyReason,
  );

  return {
    order: updatedOrder,

    alreadyPaid: false,
  };
};

/*
|--------------------------------------------------------------------------
| Create Razorpay Order
|--------------------------------------------------------------------------
*/

export const createRazorpayOrder = async (userId, orderId) => {
  if (!userId || !orderId) {
    throw new AppError("User ID and order ID are required", 400);
  }

  const order = await prisma.orders.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (order.user_id !== userId) {
    throw new AppError("You are not allowed to access this order", 403);
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    throw new AppError("Cancelled order cannot be paid", 400);
  }

  if (order.payment_status === PAYMENT_STATUS.PAID) {
    throw new AppError("Order is already paid", 400);
  }

  if (order.payment_status === PAYMENT_STATUS.REFUNDED) {
    throw new AppError("Refunded order cannot be paid again", 400);
  }

  /*
    |--------------------------------------------------------------------------
    | Reuse existing Razorpay order
    |--------------------------------------------------------------------------
    */

  if (order.razorpay_order_id) {
    return {
      id: order.razorpay_order_id,

      amount: getAmountInPaise(order.total_amount),

      currency: RAZORPAY_CURRENCY,

      orderId: order.id,
    };
  }

  const amountInPaise = getAmountInPaise(order.total_amount);

  if (amountInPaise <= 0) {
    throw new AppError("Order amount must be greater than zero", 400);
  }

  let razorpayOrder;

  try {
    razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,

      currency: RAZORPAY_CURRENCY,

      receipt: order.id,

      notes: {
        order_id: order.id,

        user_id: userId,
      },
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error?.error || error);

    throw new AppError("Unable to create Razorpay order", 502);
  }

  await prisma.orders.update({
    where: {
      id: order.id,
    },

    data: {
      razorpay_order_id: razorpayOrder.id,

      updated_at: new Date(),
    },
  });

  return {
    id: razorpayOrder.id,

    amount: razorpayOrder.amount,

    currency: razorpayOrder.currency,

    orderId: order.id,
  };
};

/*
|--------------------------------------------------------------------------
| Verify Razorpay Payment
|--------------------------------------------------------------------------
*/

export const verifyRazorpayPayment = async ({
  userId,
  orderId,
  razorpayPaymentId,
  razorpayOrderId,
  razorpaySignature,
}) => {
  if (
    !userId ||
    !orderId ||
    !razorpayPaymentId ||
    !razorpayOrderId ||
    !razorpaySignature
  ) {
    throw new AppError("Payment verification data is incomplete", 400);
  }

  const order = await prisma.orders.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (order.user_id !== userId) {
    throw new AppError("You are not allowed to verify this order", 403);
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    throw new AppError("Cancelled order cannot be paid", 400);
  }

  if (order.payment_status === PAYMENT_STATUS.REFUNDED) {
    throw new AppError("Refunded order cannot be paid", 400);
  }

  /*
    |--------------------------------------------------------------------------
    | Idempotent verification
    |--------------------------------------------------------------------------
    */

  if (order.payment_status === PAYMENT_STATUS.PAID) {
    if (order.razorpay_payment_id === razorpayPaymentId) {
      return {
        success: true,

        alreadyPaid: true,

        order,
      };
    }

    throw new AppError("Order is already paid with another payment", 409);
  }

  if (!order.razorpay_order_id) {
    throw new AppError("Razorpay order has not been created", 400);
  }

  if (order.razorpay_order_id !== razorpayOrderId) {
    throw new AppError("Invalid Razorpay order ID", 400);
  }

  /*
    |--------------------------------------------------------------------------
    | Verify HMAC signature
    |--------------------------------------------------------------------------
    */

  const expectedSignature = generatePaymentSignature(
    razorpayOrderId,

    razorpayPaymentId,
  );

  if (!isValidSignature(expectedSignature, razorpaySignature)) {
    throw new AppError("Invalid payment signature", 400);
  }

  /*
    |--------------------------------------------------------------------------
    | Fetch payment directly from Razorpay
    |--------------------------------------------------------------------------
    */

  let payment;

  try {
    payment = await razorpay.payments.fetch(razorpayPaymentId);
  } catch (error) {
    console.error("Razorpay payment fetch failed:", error?.error || error);

    throw new AppError("Unable to verify payment with Razorpay", 502);
  }

  validatePaymentOrderRelationship(payment, order);

  if (payment.status !== "captured") {
    if (payment.status === "failed") {
      throw new AppError("Payment failed", 400);
    }

    throw new AppError(
      `Payment is not captured. Current status: ${payment.status}`,
      400,
    );
  }

  /*
    |--------------------------------------------------------------------------
    | Lock order and finalize payment
    |--------------------------------------------------------------------------
    */

  const result = await prisma.$transaction(async (tx) => {
    const lockedOrderRows = await tx.$queryRaw`

                        SELECT *
                        FROM orders
                        WHERE id = ${orderId}::uuid
                        FOR UPDATE

                    `;

    const lockedOrder = lockedOrderRows[0];

    if (!lockedOrder) {
      throw new AppError("Order not found", 404);
    }

    if (lockedOrder.user_id !== userId) {
      throw new AppError("You are not allowed to verify this order", 403);
    }

    if (lockedOrder.payment_status === PAYMENT_STATUS.PAID) {
      if (lockedOrder.razorpay_payment_id === razorpayPaymentId) {
        return {
          order: lockedOrder,

          alreadyPaid: true,
        };
      }

      throw new AppError("Order is already paid with another payment", 409);
    }

    if (lockedOrder.payment_status === PAYMENT_STATUS.REFUNDED) {
      throw new AppError("Payment has already been refunded", 409);
    }

    if (lockedOrder.status === ORDER_STATUS.CANCELLED) {
      throw new AppError("Cancelled order cannot be paid", 409);
    }

    return finalizeSuccessfulPayment(
      tx,

      lockedOrder,

      razorpayPaymentId,

      "Payment captured successfully",
    );
  });

  return {
    success: true,

    alreadyPaid: result.alreadyPaid,

    order: result.order,
  };
};

const getRefundAmountInPaise = (refund) => {
  const amount = Number(refund?.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("Invalid refund amount received from Razorpay", 400);
  }

  return Math.round(amount);
};

const validateReturnRefundWebhook = (returnRecord, refund) => {
    const refundAmount = Number(returnRecord.refund_amount);

    if (
        !Number.isFinite(refundAmount) ||
        refundAmount <= 0
    ) {
        throw new AppError(
            "Invalid return refund amount",
            400,
        );
    }

    const expectedAmountInPaise =
        Math.round(refundAmount * 100);

    const actualAmountInPaise =
        getRefundAmountInPaise(refund);

    if (
        actualAmountInPaise !==
        expectedAmountInPaise
    ) {
        throw new AppError(
            "Refund amount does not match the return refund amount",
            400,
        );
    }

    if (!returnRecord.orders?.razorpay_payment_id) {
        throw new AppError(
            "Return order payment ID is missing",
            500,
        );
    }

    if (
        returnRecord.orders.razorpay_payment_id !==
        refund.payment_id
    ) {
        throw new AppError(
            "Refund payment does not belong to the return order",
            400,
        );
    }
};

/*
|--------------------------------------------------------------------------
| Payment Webhook
|--------------------------------------------------------------------------
*/

export const handleRazorpayWebhook = async (
    rawBody,
    webhookSignature,
    eventId,
) => {
    if (!rawBody) {
        throw new AppError(
            "Webhook body is required",
            400,
        );
    }

    if (!webhookSignature) {
        throw new AppError(
            "Webhook signature is required",
            400,
        );
    }

    if (!eventId) {
        throw new AppError(
            "Webhook event ID is required",
            400,
        );
    }

    const webhookSecret =
        process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
        throw new AppError(
            "Razorpay webhook secret is not configured",
            500,
        );
    }

    // ============================================================
    // VERIFY WEBHOOK SIGNATURE
    // ============================================================

    const expectedSignature = crypto
        .createHmac(
            "sha256",
            webhookSecret,
        )
        .update(rawBody)
        .digest("hex");

    if (
        !isValidSignature(
            expectedSignature,
            webhookSignature,
        )
    ) {
        throw new AppError(
            "Invalid webhook signature",
            400,
        );
    }

    // ============================================================
    // PARSE PAYLOAD
    // ============================================================

    let payload;

    try {
        payload = JSON.parse(
            rawBody.toString("utf8"),
        );
    } catch {
        throw new AppError(
            "Invalid webhook payload",
            400,
        );
    }

    const event = payload.event;

    if (!event) {
        throw new AppError(
            "Webhook event is missing",
            400,
        );
    }

    const supportedEvents = [
        "payment.captured",
        "order.paid",
        "payment.failed",
        "refund.created",
        "refund.processed",
        "refund.failed",
    ];

    if (!supportedEvents.includes(event)) {
        return {
            success: true,
            ignored: true,
            message: `Unsupported webhook event: ${event}`,
        };
    }

    // ============================================================
    // PAYMENT WEBHOOKS
    // ============================================================

    if (
        event === "payment.captured" ||
        event === "order.paid" ||
        event === "payment.failed"
    ) {
        const payment =
            payload?.payload?.payment?.entity;

        if (!payment) {
            throw new AppError(
                "Payment entity missing from webhook",
                400,
            );
        }

        const paymentOrderId =
            payment.order_id;

        if (!paymentOrderId) {
            throw new AppError(
                "Razorpay order ID missing from payment webhook",
                400,
            );
        }

        return prisma.$transaction(
            async (tx) => {
                // ====================================================
                // IDEMPOTENCY
                // ====================================================

                const existingEvent =
                    await tx.payment_webhook_events.findUnique(
                        {
                            where: {
                                event_id: eventId,
                            },
                        },
                    );

                if (existingEvent) {
                    return {
                        success: true,
                        duplicate: true,
                    };
                }

                // ====================================================
                // LOCK ORDER
                // ====================================================

                const orderRows =
                    await tx.$queryRaw`
                        SELECT *
                        FROM orders
                        WHERE razorpay_order_id = ${paymentOrderId}
                        FOR UPDATE
                    `;

                const order = orderRows[0];

                if (!order) {
                    await tx.payment_webhook_events.create(
                        {
                            data: {
                                event_id: eventId,
                                event,
                            },
                        },
                    );

                    return {
                        success: true,
                        ignored: true,
                        message:
                            "Order not found for webhook",
                    };
                }

                // ====================================================
                // PAYMENT FAILED
                // ====================================================

                if (
                    event ===
                    "payment.failed"
                ) {
                    await tx.payment_webhook_events.create(
                        {
                            data: {
                                event_id: eventId,
                                event,
                            },
                        },
                    );

                    if (
                        order.payment_status ===
                            PAYMENT_STATUS.PAID ||
                        order.payment_status ===
                            PAYMENT_STATUS.REFUNDED
                    ) {
                        return {
                            success: true,
                            ignored: true,
                        };
                    }

                    if (
                        order.status ===
                        ORDER_STATUS.CANCELLED
                    ) {
                        return {
                            success: true,
                            ignored: true,
                        };
                    }

                    await tx.orders.update(
                        {
                            where: {
                                id: order.id,
                            },
                            data: {
                                payment_status:
                                    PAYMENT_STATUS.FAILED,
                                updated_at:
                                    new Date(),
                            },
                        },
                    );

                    return {
                        success: true,
                        paymentStatus:
                            PAYMENT_STATUS.FAILED,
                    };
                }

                // ====================================================
                // CAPTURED / ORDER.PAID VALIDATION
                // ====================================================

                if (
                    payment.status !==
                    "captured"
                ) {
                    await tx.payment_webhook_events.create(
                        {
                            data: {
                                event_id: eventId,
                                event,
                            },
                        },
                    );

                    return {
                        success: true,
                        ignored: true,
                        message:
                            "Payment is not captured",
                    };
                }

                validatePaymentOrderRelationship(
                    payment,
                    order,
                );

                // ====================================================
                // PAYMENT ARRIVES AFTER CANCELLATION
                // ====================================================

                if (
                    order.status ===
                        ORDER_STATUS.CANCELLED &&
                    order.payment_status !==
                        PAYMENT_STATUS.PAID &&
                    order.payment_status !==
                        PAYMENT_STATUS.REFUNDED
                ) {
                    const amountInPaise =
                        getAmountInPaise(
                            order.total_amount,
                        );

                    let refund;

                    try {
                        refund =
                            await requestRazorpayRefund(
                                payment.id,
                                amountInPaise,
                                order.id,
                                "Payment received after order cancellation",
                            );
                    } catch (error) {
                        await tx.payment_webhook_events.create(
                            {
                                data: {
                                    event_id:
                                        eventId,
                                    event,
                                },
                            },
                        );

                        throw error;
                    }

                    await tx.payment_webhook_events.create(
                        {
                            data: {
                                event_id: eventId,
                                event,
                            },
                        },
                    );

                    const immediateRefundProcessed =
                        refund.status ===
                        "processed";

                    await tx.orders.update(
                        {
                            where: {
                                id: order.id,
                            },
                            data: {
                                payment_status:
                                    immediateRefundProcessed
                                        ? PAYMENT_STATUS.REFUNDED
                                        : PAYMENT_STATUS.PAID,

                                refund_status:
                                    immediateRefundProcessed
                                        ? REFUND_STATUS.PROCESSED
                                        : REFUND_STATUS.PENDING,

                                razorpay_payment_id:
                                    payment.id,

                                razorpay_refund_id:
                                    refund.id,

                                refunded_at:
                                    immediateRefundProcessed
                                        ? new Date()
                                        : null,

                                updated_at:
                                    new Date(),
                            },
                        },
                    );

                    return {
                        success: true,
                        refunded: true,
                        refundId:
                            refund.id,
                        refundStatus:
                            refund.status,
                    };
                }

                // ====================================================
                // ALREADY PAID
                // ====================================================

                if (
                    order.payment_status ===
                    PAYMENT_STATUS.PAID
                ) {
                    await tx.payment_webhook_events.create(
                        {
                            data: {
                                event_id: eventId,
                                event,
                            },
                        },
                    );

                    return {
                        success: true,
                        alreadyPaid: true,
                    };
                }

                // ====================================================
                // ALREADY REFUNDED
                // ====================================================

                if (
                    order.payment_status ===
                    PAYMENT_STATUS.REFUNDED
                ) {
                    await tx.payment_webhook_events.create(
                        {
                            data: {
                                event_id: eventId,
                                event,
                            },
                        },
                    );

                    return {
                        success: true,
                        alreadyRefunded: true,
                    };
                }

                // ====================================================
                // MARK WEBHOOK AS PROCESSED
                // ====================================================

                await tx.payment_webhook_events.create(
                    {
                        data: {
                            event_id: eventId,
                            event,
                        },
                    },
                );

                const result =
                    await finalizeSuccessfulPayment(
                        tx,
                        order,
                        payment.id,
                        "Payment captured successfully via Razorpay webhook",
                    );

                return {
                    success: true,
                    order: result.order,
                    alreadyPaid:
                        result.alreadyPaid,
                };
            },
        );
    }

    // ============================================================
    // REFUND WEBHOOKS
    // ============================================================

    if (
        event === "refund.created" ||
        event === "refund.processed" ||
        event === "refund.failed"
    ) {
        const refund =
            payload?.payload?.refund?.entity;

        if (!refund) {
            throw new AppError(
                "Refund entity missing from webhook",
                400,
            );
        }

        const paymentId =
            refund.payment_id;

        if (!paymentId) {
            throw new AppError(
                "Payment ID missing from refund webhook",
                400,
            );
        }

        const returnId =
            refund?.notes?.return_id;

        return prisma.$transaction(
            async (tx) => {
                // ====================================================
                // IDEMPOTENCY
                // ====================================================

                const existingEvent =
                    await tx.payment_webhook_events.findUnique(
                        {
                            where: {
                                event_id: eventId,
                            },
                        },
                    );

                if (existingEvent) {
                    return {
                        success: true,
                        duplicate: true,
                    };
                }

                // ====================================================
                // RETURN REFUND
                // ====================================================

                if (returnId) {
                    let returnRecord =
                        await tx.returns.findUnique(
                            {
                                where: {
                                    id: returnId,
                                },
                                include: {
                                    orders: true,
                                },
                            },
                        );

                    // ------------------------------------------------
                    // FALLBACK: FIND BY RAZORPAY REFUND ID
                    // ------------------------------------------------

                    if (
                        !returnRecord &&
                        refund.id
                    ) {
                        returnRecord =
                            await tx.returns.findUnique(
                                {
                                    where: {
                                        razorpay_refund_id:
                                            refund.id,
                                    },
                                    include: {
                                        orders: true,
                                    },
                                },
                            );
                    }

                    if (!returnRecord) {
                        await tx.payment_webhook_events.create(
                            {
                                data: {
                                    event_id:
                                        eventId,
                                    event,
                                },
                            },
                        );

                        return {
                            success: true,
                            ignored: true,
                            message:
                                "Return not found for refund webhook",
                        };
                    }

                    // ------------------------------------------------
                    // VERIFY PAYMENT RELATIONSHIP
                    // ------------------------------------------------

                    if (
                        returnRecord.orders
                            ?.razorpay_payment_id !==
                        paymentId
                    ) {
                        throw new AppError(
                            "Refund payment does not belong to return order",
                            400,
                        );
                    }

                    // ------------------------------------------------
                    // VERIFY REFUND AMOUNT
                    // ------------------------------------------------

                    validateReturnRefundWebhook(
                        returnRecord,
                        refund,
                    );

                    // ------------------------------------------------
                    // RECORD WEBHOOK
                    // ------------------------------------------------

                    await tx.payment_webhook_events.create(
                        {
                            data: {
                                event_id:
                                    eventId,
                                event,
                            },
                        },
                    );

                    // =================================================
                    // REFUND CREATED
                    // =================================================

                    if (
                        event ===
                        "refund.created"
                    ) {
                        if (
                            returnRecord.status ===
                            RETURN_STATUS.REFUNDED
                        ) {
                            return {
                                success: true,
                                alreadyRefunded:
                                    true,
                            };
                        }

                        const updatedReturn =
                            await tx.returns.update(
                                {
                                    where: {
                                        id: returnRecord.id,
                                    },
                                    data: {
                                        razorpay_refund_id:
                                            refund.id,

                                        status:
                                            RETURN_STATUS.RECEIVED,

                                        updated_at:
                                            new Date(),
                                    },
                                },
                            );

                        return {
                            success: true,
                            return:
                                updatedReturn,
                            refundStatus:
                                REFUND_STATUS.PENDING,
                        };
                    }

                    // =================================================
                    // REFUND PROCESSED
                    // =================================================

                    if (
                        event ===
                        "refund.processed"
                    ) {
                        if (
                            returnRecord.status ===
                            RETURN_STATUS.REFUNDED
                        ) {
                            return {
                                success: true,
                                alreadyRefunded:
                                    true,
                            };
                        }

                        const updatedReturn =
                            await tx.returns.update(
                                {
                                    where: {
                                        id: returnRecord.id,
                                    },
                                    data: {
                                        status:
                                            RETURN_STATUS.REFUNDED,

                                        razorpay_refund_id:
                                            refund.id,

                                        refunded_at:
                                            returnRecord.refunded_at ??
                                            new Date(),

                                        updated_at:
                                            new Date(),
                                    },
                                },
                            );

                        return {
                            success: true,
                            return:
                                updatedReturn,

                            refundStatus:
                                REFUND_STATUS.PROCESSED,
                        };
                    }

                    // =================================================
                    // REFUND FAILED
                    // =================================================

                    if (
                        event ===
                        "refund.failed"
                    ) {
                        const updatedReturn =
                            await tx.returns.update(
                                {
                                    where: {
                                        id: returnRecord.id,
                                    },
                                    data: {
                                        status:
                                            RETURN_STATUS.RECEIVED,

                                        razorpay_refund_id:
                                            null,

                                        refunded_at:
                                            null,

                                        updated_at:
                                            new Date(),
                                    },
                                },
                            );

                        return {
                            success: true,
                            return:
                                updatedReturn,

                            refundStatus:
                                REFUND_STATUS.FAILED,
                        };
                    }
                }

                // ====================================================
                // NORMAL ORDER REFUND
                // ====================================================

                const orderRows =
                    await tx.$queryRaw`
                        SELECT *
                        FROM orders
                        WHERE razorpay_payment_id = ${paymentId}
                        FOR UPDATE
                    `;

                const order =
                    orderRows[0];

                if (!order) {
                    await tx.payment_webhook_events.create(
                        {
                            data: {
                                event_id:
                                    eventId,
                                event,
                            },
                        },
                    );

                    return {
                        success: true,
                        ignored: true,
                        message:
                            "Order not found for refund webhook",
                    };
                }

                // ------------------------------------------------
                // NORMAL ORDER REFUND MUST BE FULL REFUND
                // ------------------------------------------------

                const refundAmount =
                    Number(refund.amount);

                const orderAmount =
                    getAmountInPaise(
                        order.total_amount,
                    );

                if (
                    refundAmount !==
                    orderAmount
                ) {
                    throw new AppError(
                        "Invalid partial refund for normal order cancellation",
                        400,
                    );
                }

                await tx.payment_webhook_events.create(
                    {
                        data: {
                            event_id: eventId,
                            event,
                        },
                    },
                );

                // =================================================
                // REFUND CREATED
                // =================================================

                if (
                    event ===
                    "refund.created"
                ) {
                    if (
                        order.refund_status ===
                        REFUND_STATUS.PROCESSED
                    ) {
                        return {
                            success: true,
                            ignored: true,
                        };
                    }

                    await tx.orders.update(
                        {
                            where: {
                                id: order.id,
                            },
                            data: {
                                refund_status:
                                    REFUND_STATUS.PENDING,

                                razorpay_refund_id:
                                    refund.id,

                                updated_at:
                                    new Date(),
                            },
                        },
                    );

                    return {
                        success: true,
                        refundStatus:
                            REFUND_STATUS.PENDING,
                    };
                }

                // =================================================
                // REFUND PROCESSED
                // =================================================

                if (
                    event ===
                    "refund.processed"
                ) {
                    if (
                        order.refund_status ===
                        REFUND_STATUS.PROCESSED
                    ) {
                        return {
                            success: true,
                            alreadyProcessed:
                                true,
                        };
                    }

                    await tx.orders.update(
                        {
                            where: {
                                id: order.id,
                            },
                            data: {
                                payment_status:
                                    PAYMENT_STATUS.REFUNDED,

                                refund_status:
                                    REFUND_STATUS.PROCESSED,

                                razorpay_refund_id:
                                    refund.id,

                                refunded_at:
                                    order.refunded_at ??
                                    new Date(),

                                updated_at:
                                    new Date(),
                            },
                        },
                    );

                    return {
                        success: true,
                        paymentStatus:
                            PAYMENT_STATUS.REFUNDED,

                        refundStatus:
                            REFUND_STATUS.PROCESSED,
                    };
                }

                // =================================================
                // REFUND FAILED
                // =================================================

                if (
                    event ===
                    "refund.failed"
                ) {
                    await tx.orders.update(
                        {
                            where: {
                                id: order.id,
                            },
                            data: {
                                refund_status:
                                    REFUND_STATUS.FAILED,

                                razorpay_refund_id:
                                    refund.id,

                                updated_at:
                                    new Date(),
                            },
                        },
                    );

                    return {
                        success: true,
                        refundStatus:
                            REFUND_STATUS.FAILED,
                    };
                }

                return {
                    success: true,
                };
            },
        );
    }

    // ============================================================
    // UNSUPPORTED / FALLBACK
    // ============================================================

    return {
        success: true,
        ignored: true,
    };
};

/*
|--------------------------------------------------------------------------
| Cancel Paid Order + Refund
|--------------------------------------------------------------------------
*/

export const cancelPaidOrder = async (userId, orderId) => {
  if (!userId || !orderId) {
    throw new AppError("User ID and order ID are required", 400);
  }

  /*
    |--------------------------------------------------------------------------
    | Load order
    |--------------------------------------------------------------------------
    */

  const order = await prisma.orders.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (order.user_id !== userId) {
    throw new AppError("You are not allowed to cancel this order", 403);
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    /*
        |--------------------------------------------------------------------------
        | Allow retry when previous refund failed
        |--------------------------------------------------------------------------
        */

    if (
      order.payment_status === PAYMENT_STATUS.PAID &&
      order.refund_status === REFUND_STATUS.FAILED
    ) {
      return retryPaidOrderRefund(userId, orderId);
    }

    throw new AppError("Order is already cancelled", 400);
  }

  if (
    order.status === ORDER_STATUS.SHIPPED ||
    order.status === ORDER_STATUS.DELIVERED
  ) {
    throw new AppError("Order cannot be cancelled after shipment", 400);
  }

  if (order.payment_status !== PAYMENT_STATUS.PAID) {
    throw new AppError("Order is not paid. Use normal cancellation flow", 400);
  }

  if (
    order.status !== ORDER_STATUS.CONFIRMED &&
    order.status !== ORDER_STATUS.PROCESSING
  ) {
    throw new AppError("Order cannot be cancelled in its current state", 400);
  }

  if (!order.razorpay_payment_id) {
    throw new AppError("Razorpay payment ID is missing", 500);
  }

  /*
    |--------------------------------------------------------------------------
    | Fetch payment from Razorpay
    |--------------------------------------------------------------------------
    */

  let payment;

  try {
    payment = await razorpay.payments.fetch(order.razorpay_payment_id);
  } catch (error) {
    console.error("Unable to fetch Razorpay payment:", error?.error || error);

    throw new AppError("Unable to verify payment status with Razorpay", 502);
  }

  validatePaymentOrderRelationship(payment, order);

  /*
    |--------------------------------------------------------------------------
    | Already refunded externally
    |--------------------------------------------------------------------------
    */

  if (payment.status === "refunded") {
    const result = await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw`
            SELECT *
            FROM orders
            WHERE id = ${orderId}::uuid
            FOR UPDATE
        `;

      const lockedOrder = lockedRows[0];

      if (!lockedOrder) {
        throw new AppError("Order not found", 404);
      }

      if (lockedOrder.user_id !== userId) {
        throw new AppError("You are not authorized to retry this refund.", 403);
      }

      /*
       * If the order was already cancelled, inventory
       * was already restored during the original
       * cancellation flow.
       *
       * Therefore, only reconcile the local payment
       * and refund state.
       */
      if (lockedOrder.status === ORDER_STATUS.CANCELLED) {
        const updatedOrder = await tx.orders.update({
          where: {
            id: orderId,
          },
          data: {
            payment_status: PAYMENT_STATUS.REFUNDED,

            refund_status: REFUND_STATUS.PROCESSED,

            refunded_at: lockedOrder.refunded_at || new Date(),

            updated_at: new Date(),
          },
        });

        await createOrderStatusHistory(
          tx,
          orderId,
          ORDER_STATUS.CANCELLED,
          userId,
          "Refund was already processed by Razorpay and the local order state was reconciled",
        );

        return updatedOrder;
      }

      /*
       * --------------------------------------------------------------------------
       * Restore inventory
       * --------------------------------------------------------------------------
       *
       * Razorpay has already processed the refund, but the
       * local order has not been cancelled yet.
       *
       * Restore the inventory before cancelling the order.
       */
      await restorePaidOrderInventory(tx, orderId);

      const updatedOrder = await tx.orders.update({
        where: {
          id: orderId,
        },
        data: {
          status: ORDER_STATUS.CANCELLED,

          payment_status: PAYMENT_STATUS.REFUNDED,

          refund_status: REFUND_STATUS.PROCESSED,

          cancelled_at: new Date(),

          refunded_at: lockedOrder.refunded_at || new Date(),

          updated_at: new Date(),
        },
      });

      await createOrderStatusHistory(
        tx,
        orderId,
        ORDER_STATUS.CANCELLED,
        userId,
        "Customer cancelled the order and refund was already processed",
      );

      return updatedOrder;
    });

    return {
      success: true,
      message:
        "Payment was already refunded by Razorpay. Local order state has been reconciled.",
      order: result,
    };
  }

  if (payment.status !== "captured") {
    throw new AppError(
      `Payment cannot be refunded. Current status: ${payment.status}`,
      400,
    );
  }

  const amountInPaise = getAmountInPaise(order.total_amount);

  /*
    |--------------------------------------------------------------------------
    | Request Razorpay refund before local mutation
    |--------------------------------------------------------------------------
    */

  const refund = await requestRazorpayRefund(
    order.razorpay_payment_id,

    amountInPaise,

    order.id,

    "Customer cancelled the order",
  );

  const immediateRefundProcessed = refund.status === "processed";

  /*
    |--------------------------------------------------------------------------
    | Update local database
    |--------------------------------------------------------------------------
    */

  return prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw`

                    SELECT *
                    FROM orders
                    WHERE id = ${orderId}::uuid
                    FOR UPDATE

                `;

    const lockedOrder = lockedRows[0];

    if (!lockedOrder) {
      throw new AppError("Order not found", 404);
    }

    /*
            |--------------------------------------------------------------------------
            | Another request may have completed cancellation
            |--------------------------------------------------------------------------
            */

    if (lockedOrder.status === ORDER_STATUS.CANCELLED) {
      return lockedOrder;
    }

    /*
            |--------------------------------------------------------------------------
            | Restore inventory exactly once
            |--------------------------------------------------------------------------
            */

    await restorePaidOrderInventory(tx, orderId);

    const updatedOrder = await tx.orders.update({
      where: {
        id: orderId,
      },

      data: {
        status: ORDER_STATUS.CANCELLED,

        payment_status: immediateRefundProcessed
          ? PAYMENT_STATUS.REFUNDED
          : PAYMENT_STATUS.PAID,

        refund_status: immediateRefundProcessed
          ? REFUND_STATUS.PROCESSED
          : REFUND_STATUS.PENDING,

        razorpay_refund_id: refund.id,

        cancelled_at: new Date(),

        refunded_at: immediateRefundProcessed ? new Date() : null,

        updated_at: new Date(),
      },
    });

    await createOrderStatusHistory(
      tx,

      orderId,

      ORDER_STATUS.CANCELLED,

      userId,

      immediateRefundProcessed
        ? "Customer cancelled the order and refund was processed"
        : "Customer cancelled the order and refund was initiated",
    );

    return updatedOrder;
  });
};

/*
|--------------------------------------------------------------------------
| Retry Failed Paid Order Refund
|--------------------------------------------------------------------------
*/

const retryPaidOrderRefund = async (userId, orderId) => {
  const order = await prisma.orders.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (order.user_id !== userId) {
    throw new AppError("You are not allowed to refund this order", 403);
  }

  if (order.status !== ORDER_STATUS.CANCELLED) {
    throw new AppError("Order is not cancelled", 400);
  }

  if (order.payment_status !== PAYMENT_STATUS.PAID) {
    throw new AppError("Order does not require a refund retry", 400);
  }

  if (order.refund_status !== REFUND_STATUS.FAILED) {
    throw new AppError("Refund retry is not required", 400);
  }

  if (!order.razorpay_payment_id) {
    throw new AppError("Razorpay payment ID is missing", 500);
  }

  const amountInPaise = getAmountInPaise(order.total_amount);

  /*
   * --------------------------------------------------------------------------
   * Check Razorpay payment
   * --------------------------------------------------------------------------
   */

  let payment;

  try {
    payment = await razorpay.payments.fetch(order.razorpay_payment_id);
  } catch (error) {
    console.error("Razorpay payment fetch failed:", error?.error || error);

    throw new AppError("Unable to verify payment with Razorpay", 502);
  }

  /*
   * --------------------------------------------------------------------------
   * Already refunded externally
   * --------------------------------------------------------------------------
   *
   * The order is already cancelled.
   *
   * Inventory was already restored during the original
   * cancelPaidOrder() flow.
   *
   * Therefore, we ONLY reconcile the local payment/refund
   * state here.
   *
   * We must NOT call restorePaidOrderInventory() again.
   * Otherwise, stock could be restored twice.
   */

  if (payment.status === "refunded") {
    const result = await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw`
                    SELECT *
                    FROM orders
                    WHERE id = ${orderId}::uuid
                    FOR UPDATE
                `;

      const lockedOrder = lockedRows[0];

      if (!lockedOrder) {
        throw new AppError("Order not found", 404);
      }

      if (lockedOrder.user_id !== userId) {
        throw new AppError("You are not authorized to retry this refund.", 403);
      }

      /*
       * The order must already be cancelled because this
       * function is only called for a failed refund retry.
       */

      if (lockedOrder.status !== ORDER_STATUS.CANCELLED) {
        throw new AppError("Only cancelled orders can retry a refund.", 409);
      }

      /*
       * If the local state was already reconciled by
       * another request/webhook, do not perform the
       * operation again.
       */

      if (
        lockedOrder.payment_status === PAYMENT_STATUS.REFUNDED &&
        lockedOrder.refund_status === REFUND_STATUS.PROCESSED
      ) {
        return lockedOrder;
      }

      /*
       * IMPORTANT:
       *
       * Do NOT restore inventory here.
       *
       * Inventory was already restored when the order
       * was cancelled in cancelPaidOrder().
       */

      const updatedOrder = await tx.orders.update({
        where: {
          id: orderId,
        },
        data: {
          payment_status: PAYMENT_STATUS.REFUNDED,

          refund_status: REFUND_STATUS.PROCESSED,

          razorpay_refund_id:
            payment.refunds?.items?.[0]?.id ?? lockedOrder.razorpay_refund_id,

          refunded_at: lockedOrder.refunded_at || new Date(),

          updated_at: new Date(),
        },
      });

      await createOrderStatusHistory(
        tx,
        orderId,
        ORDER_STATUS.CANCELLED,
        userId,
        "Refund was already processed by Razorpay and the local order state was reconciled",
      );

      return updatedOrder;
    });

    return {
      success: true,
      message:
        "Payment was already refunded by Razorpay. Local order state has been reconciled.",
      order: result,
    };
  }

  /*
   * --------------------------------------------------------------------------
   * Payment must be captured before requesting refund
   * --------------------------------------------------------------------------
   */

  if (payment.status !== "captured") {
    throw new AppError(
      `Payment cannot be refunded. Current status: ${payment.status}`,
      400,
    );
  }

  /*
   * --------------------------------------------------------------------------
   * Request Razorpay refund
   * --------------------------------------------------------------------------
   */

  const refund = await requestRazorpayRefund(
    order.razorpay_payment_id,
    amountInPaise,
    order.id,
    "Retry failed order refund",
  );

  const immediateRefundProcessed = refund.status === "processed";

  /*
   * --------------------------------------------------------------------------
   * Update local database
   * --------------------------------------------------------------------------
   */

  const result = await prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw`
                SELECT *
                FROM orders
                WHERE id = ${orderId}::uuid
                FOR UPDATE
            `;

    const lockedOrder = lockedRows[0];

    if (!lockedOrder) {
      throw new AppError("Order not found", 404);
    }

    if (lockedOrder.user_id !== userId) {
      throw new AppError("You are not authorized to retry this refund.", 403);
    }

    if (lockedOrder.status !== ORDER_STATUS.CANCELLED) {
      throw new AppError("Only cancelled orders can retry a refund.", 409);
    }

    const updatedOrder = await tx.orders.update({
      where: {
        id: orderId,
      },
      data: {
        payment_status: immediateRefundProcessed
          ? PAYMENT_STATUS.REFUNDED
          : PAYMENT_STATUS.PAID,

        refund_status: immediateRefundProcessed
          ? REFUND_STATUS.PROCESSED
          : REFUND_STATUS.PENDING,

        razorpay_refund_id: refund.id,

        refunded_at: immediateRefundProcessed ? new Date() : null,

        updated_at: new Date(),
      },
    });

    return updatedOrder;
  });

  return {
    success: true,
    message: immediateRefundProcessed
      ? "Refund was successfully processed."
      : "Refund was successfully initiated and is pending.",
    order: result,
  };
};

/*
|--------------------------------------------------------------------------
| Cancel Unpaid Order
|--------------------------------------------------------------------------
*/

/**
 * This helper can be used by order.service.js when cancelling
 * pending/failed unpaid orders.
 *
 * It releases reserved stock and marks the order cancelled.
 */
export const cancelUnpaidOrderPaymentState = async (
  tx,
  orderId,
  changedBy = null,
  reason = "Unpaid order cancelled",
) => {
  const orderRows = await tx.$queryRaw`

                SELECT *
                FROM orders
                WHERE id = ${orderId}::uuid
                FOR UPDATE

            `;

  const order = orderRows[0];

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (order.payment_status === PAYMENT_STATUS.PAID) {
    throw new AppError("Paid order requires refund flow", 400);
  }

  if (order.payment_status === PAYMENT_STATUS.REFUNDED) {
    throw new AppError("Order is already refunded", 400);
  }

  if (order.status === ORDER_STATUS.CANCELLED) {
    return order;
  }

  /*
        |--------------------------------------------------------------------------
        | Release normal or variant reserved inventory
        |--------------------------------------------------------------------------
        */

  await releaseReservedInventory(tx, orderId);

  const updatedOrder = await tx.orders.update({
    where: {
      id: orderId,
    },

    data: {
      status: ORDER_STATUS.CANCELLED,

      updated_at: new Date(),
    },
  });

  await createOrderStatusHistory(
    tx,

    orderId,

    ORDER_STATUS.CANCELLED,

    changedBy,

    reason,
  );

  return updatedOrder;
};
