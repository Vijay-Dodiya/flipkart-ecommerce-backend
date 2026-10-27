import crypto from "crypto";

import razorpay from "../config/razorpay.js";
import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import { createOrderStatusHistory } from "./orderStatusHistory.service.js";
import redisClient from "../config/redis.js";

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

const MAX_TRANSACTION_RETRIES = 3;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransactionConflict = (error) => {
  return (
    error?.code === "P2034" ||
    error?.message?.includes("write conflict") ||
    error?.message?.includes("deadlock")
  );
};

const runSerializableTransaction = async (
  callback,
  maxRetries = MAX_TRANSACTION_RETRIES,
) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      lastError = error;

      if (!isTransactionConflict(error) || attempt === maxRetries) {
        throw error;
      }

      await wait(50 * attempt);
    }
  }

  throw lastError;
};

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
    typeof expectedSignature !== "string" ||
    typeof receivedSignature !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(expectedSignature) ||
    !/^[a-fA-F0-9]{64}$/.test(receivedSignature)
  ) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  const receivedBuffer = Buffer.from(receivedSignature, "hex");

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
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

const RAZORPAY_ORDER_LOCK_TTL = 30000;
const RAZORPAY_ORDER_LOCK_RENEW_INTERVAL = 10000;

const acquireRazorpayOrderLock = async (orderId) => {
  const lockKey = `lock:razorpay-order:${orderId}`;

  const lockToken = `${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

  try {
    const result = await redisClient.set(lockKey, lockToken, {
      NX: true,
      PX: RAZORPAY_ORDER_LOCK_TTL,
    });

    if (result !== "OK") {
      return null;
    }

    return {
      lockKey,
      lockToken,
    };
  } catch (error) {
    console.error("Razorpay order lock acquisition failed:", error);

    throw new AppError("Unable to process payment order creation", 503);
  }
};

const renewRazorpayOrderLock = async (lockKey, lockToken) => {
  try {
    const result = await redisClient.eval(
      `
                if redis.call("GET", KEYS[1]) == ARGV[1]
                then
                    return redis.call(
                        "PEXPIRE",
                        KEYS[1],
                        ARGV[2]
                    )
                else
                    return 0
                end
                `,
      {
        keys: [lockKey],
        arguments: [lockToken, String(RAZORPAY_ORDER_LOCK_TTL)],
      },
    );

    return result === 1;
  } catch (error) {
    console.error("Razorpay order lock renewal failed:", error);

    return false;
  }
};

const releaseRazorpayOrderLock = async (lockKey, lockToken) => {
  try {
    await redisClient.eval(
      `
            if redis.call("GET", KEYS[1]) == ARGV[1]
            then
                return redis.call("DEL", KEYS[1])
            else
                return 0
            end
            `,
      {
        keys: [lockKey],
        arguments: [lockToken],
      },
    );
  } catch (error) {
    console.error("Razorpay order lock release failed:", error);
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

/**
 * Lock an order row inside a PostgreSQL transaction.
 *
 * IMPORTANT:
 * Prisma findUnique() does NOT create a database row lock.
 * FOR UPDATE is required when another process must not modify
 * the order concurrently.
 */
const lockOrderById = async (tx, orderId) => {
  const rows = await tx.$queryRaw`
    SELECT *
    FROM orders
    WHERE id = ${orderId}::uuid
    FOR UPDATE
  `;

  return rows[0] || null;
};

/**
 * Lock an order using its Razorpay order ID.
 */
const lockOrderByRazorpayOrderId = async (tx, razorpayOrderId) => {
  const rows = await tx.$queryRaw`
    SELECT *
    FROM orders
    WHERE razorpay_order_id = ${razorpayOrderId}
    FOR UPDATE
  `;

  return rows[0] || null;
};

/**
 * Safely record a webhook event.
 *
 * The database has a unique constraint on event_id.
 */
const recordWebhookEvent = async (tx, eventId, event) => {
  if (
    typeof eventId !== "string" ||
    !eventId.trim() ||
    typeof event !== "string" ||
    !event.trim()
  ) {
    throw new AppError(
      "Valid webhook event ID and event name are required",
      400,
    );
  }

  const result = await tx.payment_webhook_events.createMany({
    data: [
      {
        event_id: eventId,
        event,
      },
    ],
    skipDuplicates: true,
  });

  return result.count === 1;
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
    return await razorpay.payments.refund(paymentId, {
      amount: amountInPaise,
      notes: {
        ...notes,
        order_id: orderId,
        reason,
      },
    });
  } catch (error) {
    console.error(
      "Razorpay refund request outcome is uncertain:",
      error?.error || error?.message || error,
    );

    const refundError = new AppError(
      "Unable to confirm the Razorpay refund outcome. Reconcile the refund before retrying.",
      502,
    );

    refundError.code = "REFUND_OUTCOME_UNCERTAIN";

    throw refundError;
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
  | 1. Lock and load the latest order state
  |--------------------------------------------------------------------------
  |
  | Do not rely only on the order object passed by the caller.
  |
  | The caller may already have locked this row, but acquiring the lock
  | here as well is safe because this uses the same transaction.
  |
  | This guarantees that every payment decision below uses the latest
  | database state.
  |--------------------------------------------------------------------------
  */

  const lockedOrder = await lockOrderById(tx, order.id);

  if (!lockedOrder) {
    throw new AppError("Order not found", 404);
  }

  /*
  |--------------------------------------------------------------------------
  | 2. Already paid
  |--------------------------------------------------------------------------
  */

  if (lockedOrder.payment_status === PAYMENT_STATUS.PAID) {
    if (
      lockedOrder.razorpay_payment_id &&
      lockedOrder.razorpay_payment_id !== paymentId
    ) {
      throw new AppError("Order is already paid with another payment", 409);
    }

    return {
      order: lockedOrder,

      alreadyPaid: true,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | 3. Already refunded
  |--------------------------------------------------------------------------
  */

  if (lockedOrder.payment_status === PAYMENT_STATUS.REFUNDED) {
    throw new AppError("Payment has already been refunded", 409);
  }

  /*
  |--------------------------------------------------------------------------
  | 4. Cancelled order protection
  |--------------------------------------------------------------------------
  */

  if (lockedOrder.status === ORDER_STATUS.CANCELLED) {
    throw new AppError("Cancelled order cannot be marked as paid", 409);
  }

  /*
  |--------------------------------------------------------------------------
  | 5. Order must still be payable
  |--------------------------------------------------------------------------
  */

  if (
    lockedOrder.payment_status !== PAYMENT_STATUS.PENDING &&
    lockedOrder.payment_status !== PAYMENT_STATUS.FAILED
  ) {
    throw new AppError(
      `Order cannot be finalized from payment status "${lockedOrder.payment_status}"`,
      409,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | 6. Load order items
  |--------------------------------------------------------------------------
  */

  const items = await tx.order_items.findMany({
    where: {
      order_id: lockedOrder.id,
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
  | 7. Convert reserved stock into sold stock
  |--------------------------------------------------------------------------
  |
  | The reservation already happened during order creation.
  |
  | Payment success now performs:
  |
  | quantity          -= purchased quantity
  | reserved_quantity -= purchased quantity
  |
  | This means the reserved units become permanently sold units.
  |--------------------------------------------------------------------------
  */

  for (const item of items) {
    /*
    |--------------------------------------------------------------------------
    | Validate quantity
    |--------------------------------------------------------------------------
    */

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new AppError("Invalid order item quantity", 500);
    }

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
          `Unable to finalize inventory for variant ${item.variant_id}`,
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
        `Unable to finalize inventory for product ${item.product_id}`,
        409,
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | 8. Mark order paid
  |--------------------------------------------------------------------------
  */

  const updatedOrder = await tx.orders.update({
    where: {
      id: lockedOrder.id,
    },

    data: {
      payment_status: PAYMENT_STATUS.PAID,

      status: ORDER_STATUS.CONFIRMED,

      razorpay_payment_id: paymentId,

      confirmed_at: lockedOrder.confirmed_at ?? new Date(),

      updated_at: new Date(),
    },
  });

  /*
  |--------------------------------------------------------------------------
  | 9. Status history
  |--------------------------------------------------------------------------
  */

  await createOrderStatusHistory(
    tx,
    lockedOrder.id,
    ORDER_STATUS.CONFIRMED,
    null,
    historyReason,
  );

  /*
  |--------------------------------------------------------------------------
  | 10. Return
  |--------------------------------------------------------------------------
  */

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

  let lock;
  let lockRenewalInterval;
  let lockLost = false;

  try {
    lock = await acquireRazorpayOrderLock(orderId);

    if (!lock) {
      throw new AppError(
        "Payment order creation is already in progress. Please try again.",
        409,
      );
    }

    /*
     * Keep the distributed lock alive while
     * Razorpay order creation is in progress.
     */
    lockRenewalInterval = setInterval(async () => {
      const renewed = await renewRazorpayOrderLock(
        lock.lockKey,
        lock.lockToken,
      );

      if (!renewed) {
        lockLost = true;

        console.error(`Razorpay order lock lost for order ${orderId}`);
      }
    }, RAZORPAY_ORDER_LOCK_RENEW_INTERVAL);

    /*
     * Re-read the order AFTER acquiring
     * the Redis lock.
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
     * Another request may already have created
     * the Razorpay order.
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

    /*
     * If we lost the Redis lock while the
     * Razorpay request was running, do NOT
     * blindly write the Razorpay ID.
     *
     * Another request may now own the lock.
     */
    if (lockLost) {
      throw new AppError(
        "Payment order creation lock was lost. Please try again.",
        409,
      );
    }

    /*
     * Save the Razorpay order ID only if
     * another request has not already saved one.
     */
    const updatedOrder = await prisma.orders.updateMany({
      where: {
        id: order.id,
        razorpay_order_id: null,
      },
      data: {
        razorpay_order_id: razorpayOrder.id,
        updated_at: new Date(),
      },
    });

    if (updatedOrder.count !== 1) {
      /*
       * Another request already stored a
       * Razorpay order ID.
       *
       * Do not overwrite it.
       */
      const latestOrder = await prisma.orders.findUnique({
        where: {
          id: order.id,
        },
        select: {
          id: true,
          razorpay_order_id: true,
          total_amount: true,
        },
      });

      if (latestOrder?.razorpay_order_id) {
        return {
          id: latestOrder.razorpay_order_id,
          amount: getAmountInPaise(latestOrder.total_amount),
          currency: RAZORPAY_CURRENCY,
          orderId: latestOrder.id,
        };
      }

      throw new AppError("Unable to save Razorpay order", 409);
    }

    return {
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      orderId: order.id,
    };
  } finally {
    if (lockRenewalInterval) {
      clearInterval(lockRenewalInterval);
    }

    if (lock) {
      await releaseRazorpayOrderLock(lock.lockKey, lock.lockToken);
    }
  }
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

  const result = await runSerializableTransaction(async (tx) => {
    const lockedOrder = await lockOrderById(tx, orderId);

    if (!lockedOrder) {
      throw new AppError("Order not found", 404);
    }

    if (lockedOrder.user_id !== userId) {
      throw new AppError("You are not allowed to verify this order", 403);
    }

    /*
      |--------------------------------------------------------------------------
      | Re-check payment state after acquiring the lock
      |--------------------------------------------------------------------------
      */

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

    /*
      |--------------------------------------------------------------------------
      | Cancelled order
      |--------------------------------------------------------------------------
      */

    if (lockedOrder.status === ORDER_STATUS.CANCELLED) {
      throw new AppError("Cancelled order cannot be paid", 409);
    }

    /*
      |--------------------------------------------------------------------------
      | Razorpay order ID must still match
      |--------------------------------------------------------------------------
      */

    if (lockedOrder.razorpay_order_id !== razorpayOrderId) {
      throw new AppError("Invalid Razorpay order ID", 400);
    }

    /*
      |--------------------------------------------------------------------------
      | Revalidate payment against the LOCKED order
      |--------------------------------------------------------------------------
      */

    validatePaymentOrderRelationship(payment, lockedOrder);

    /*
      |--------------------------------------------------------------------------
      | Payment must still be captured
      |--------------------------------------------------------------------------
      */

    if (payment.status !== "captured") {
      throw new AppError(
        `Payment is no longer captured. Current status: ${payment.status}`,
        400,
      );
    }

    /*
      |--------------------------------------------------------------------------
      | Finalize payment + inventory atomically
      |--------------------------------------------------------------------------
      */

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

const getAlreadyRefundedAmountInPaise = (payment) => {
  const amountRefunded = Number(payment?.amount_refunded ?? 0);

  if (!Number.isFinite(amountRefunded) || amountRefunded < 0) {
    throw new AppError("Invalid refunded amount received from Razorpay", 502);
  }

  return Math.round(amountRefunded);
};

// const isRefundAlreadyCovered = (
//   payment,
//   refundAmountInPaise,
// ) => {
//   const refundedAmount =
//     getAlreadyRefundedAmountInPaise(
//       payment,
//     );

//   return (
//     refundedAmount >=
//     refundAmountInPaise
//   );
// };

const validateReturnRefundWebhook = (returnRecord, refund) => {
  const refundAmount = Number(returnRecord.refund_amount);

  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    throw new AppError("Invalid return refund amount", 400);
  }

  const expectedAmountInPaise = Math.round(refundAmount * 100);

  const actualAmountInPaise = getRefundAmountInPaise(refund);

  if (actualAmountInPaise !== expectedAmountInPaise) {
    throw new AppError(
      "Refund amount does not match the return refund amount",
      400,
    );
  }

  if (!returnRecord.orders?.razorpay_payment_id) {
    throw new AppError("Return order payment ID is missing", 500);
  }

  if (returnRecord.orders.razorpay_payment_id !== refund.payment_id) {
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
  /*
   * --------------------------------------------------------------------------
   * Basic validation
   * --------------------------------------------------------------------------
   */

  if (!rawBody) {
    throw new AppError("Webhook body is required", 400);
  }

  if (!webhookSignature) {
    throw new AppError("Webhook signature is required", 400);
  }

  if (typeof eventId !== "string" || !eventId.trim() || eventId.length > 100) {
    throw new AppError("A valid webhook event ID is required", 400);
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new AppError("Razorpay webhook secret is not configured", 500);
  }

  /*
   * --------------------------------------------------------------------------
   * Verify webhook signature
   * --------------------------------------------------------------------------
   */

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  if (!isValidSignature(expectedSignature, webhookSignature)) {
    throw new AppError("Invalid webhook signature", 400);
  }

  /*
   * --------------------------------------------------------------------------
   * Parse payload
   * --------------------------------------------------------------------------
   */

  let payload;

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new AppError("Invalid webhook payload", 400);
  }

  const event = payload?.event;

  if (typeof event !== "string" || !event.trim()) {
    throw new AppError("Webhook event is missing", 400);
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

  /*
   * --------------------------------------------------------------------------
   * PAYMENT WEBHOOKS
   * --------------------------------------------------------------------------
   */

  if (
    event === "payment.captured" ||
    event === "order.paid" ||
    event === "payment.failed"
  ) {
    const payment = payload?.payload?.payment?.entity;

    if (!payment) {
      throw new AppError("Payment entity missing from webhook", 400);
    }

    const paymentOrderId = payment.order_id;

    if (!paymentOrderId) {
      throw new AppError("Razorpay order ID missing from payment webhook", 400);
    }

    /*
     * ----------------------------------------------------------------------
     * PAYMENT FAILED
     * ----------------------------------------------------------------------
     */

    if (event === "payment.failed") {
      return runSerializableTransaction(async (tx) => {
        const order = await lockOrderByRazorpayOrderId(tx, paymentOrderId);

        if (!order) {
          const recorded = await recordWebhookEvent(tx, eventId, event);

          return {
            success: true,
            ignored: true,
            duplicate: !recorded,
            message: "Order not found for webhook",
          };
        }

        const existingEvent = await tx.payment_webhook_events.findUnique({
          where: {
            event_id: eventId,
          },
        });

        if (existingEvent) {
          return {
            success: true,
            duplicate: true,
          };
        }

        validatePaymentOrderRelationship(payment, order);

        /*
         * The insert is the final idempotency check.
         * Do not modify the order if another request recorded
         * this event after our initial lookup.
         */

        const recorded = await recordWebhookEvent(tx, eventId, event);

        if (!recorded) {
          return {
            success: true,
            duplicate: true,
          };
        }

        /*
         * Never move a paid or refunded order backwards.
         */

        if (
          order.payment_status === PAYMENT_STATUS.PAID ||
          order.payment_status === PAYMENT_STATUS.REFUNDED
        ) {
          return {
            success: true,
            ignored: true,
          };
        }

        /*
         * A cancelled order must remain cancelled.
         */

        if (order.status === ORDER_STATUS.CANCELLED) {
          return {
            success: true,
            ignored: true,
          };
        }

        /*
         * Only pending or already-failed payments are
         * acceptable here.
         */

        if (
          order.payment_status !== PAYMENT_STATUS.PENDING &&
          order.payment_status !== PAYMENT_STATUS.FAILED
        ) {
          return {
            success: true,
            ignored: true,
            message: `Payment failure ignored for order in payment status "${order.payment_status}"`,
          };
        }

        if (order.payment_status === PAYMENT_STATUS.FAILED) {
          return {
            success: true,
            paymentStatus: PAYMENT_STATUS.FAILED,
            alreadyFailed: true,
          };
        }

        const updatedOrder = await tx.orders.update({
          where: {
            id: order.id,
          },
          data: {
            payment_status: PAYMENT_STATUS.FAILED,
            updated_at: new Date(),
          },
        });

        return {
          success: true,
          paymentStatus: PAYMENT_STATUS.FAILED,
          order: updatedOrder,
        };
      });
    }

    /*
     * ----------------------------------------------------------------------
     * PAYMENT CAPTURED / ORDER.PAID
     * ----------------------------------------------------------------------
     */

    const paymentDecision = await runSerializableTransaction(async (tx) => {
      const order = await lockOrderByRazorpayOrderId(tx, paymentOrderId);

      if (!order) {
        const recorded = await recordWebhookEvent(tx, eventId, event);

        return {
          type: "ignored",
          success: true,
          ignored: true,
          duplicate: !recorded,
          message: "Order not found for webhook",
        };
      }

      const existingEvent = await tx.payment_webhook_events.findUnique({
        where: {
          event_id: eventId,
        },
      });

      if (existingEvent) {
        return {
          type: "duplicate",
          success: true,
          duplicate: true,
        };
      }

      /*
       * Verify the payment belongs to this order before
       * applying any payment-related state changes.
       */

      validatePaymentOrderRelationship(payment, order);

      if (payment.status !== "captured") {
        const recorded = await recordWebhookEvent(tx, eventId, event);

        return {
          type: "ignored",
          success: true,
          ignored: true,
          duplicate: !recorded,
          message: "Payment is not captured",
        };
      }

      // Validate the actual captured amount and currency
      // against our database order before processing payment.
      validatePaymentAmount(payment, order);

      /*
       * ------------------------------------------------------------------
       * Payment received after cancellation
       * ------------------------------------------------------------------
       *
       * The order remains cancelled. We must refund the late payment.
       * Razorpay is called outside the database transaction below.
       */

      if (
        order.status === ORDER_STATUS.CANCELLED &&
        order.payment_status !== PAYMENT_STATUS.PAID &&
        order.payment_status !== PAYMENT_STATUS.REFUNDED
      ) {
        /*
         * Do not associate a different captured payment with
         * an order that already has a payment ID.
         */

        if (
          order.razorpay_payment_id &&
          order.razorpay_payment_id !== payment.id
        ) {
          throw new AppError(
            "A different Razorpay payment is already associated with this order",
            400,
          );
        }

        /*
         * A pending marker means another request already
         * claimed the late-payment refund.
         */

        if (
          order.refund_status === REFUND_STATUS.PENDING &&
          order.razorpay_refund_id?.startsWith("PENDING-")
        ) {
          return {
            type: "refund_pending",
            success: true,
            refundPending: true,
          };
        }

        /*
         * A real refund ID means a refund is already
         * being processed. Never initiate another one here.
         */

        if (
          order.refund_status === REFUND_STATUS.PENDING &&
          order.razorpay_refund_id &&
          !order.razorpay_refund_id.startsWith("PENDING-")
        ) {
          return {
            type: "refund_already_in_progress",
            success: true,
            refundPending: true,
            refundId: order.razorpay_refund_id,
          };
        }

        const amountInPaise = getAmountInPaise(order.total_amount);

        if (amountInPaise <= 0) {
          throw new AppError("Invalid order refund amount", 400);
        }

        const pendingRefundId = `PENDING-${order.id}`;

        await tx.orders.update({
          where: {
            id: order.id,
          },
          data: {
            payment_status: PAYMENT_STATUS.PAID,
            refund_status: REFUND_STATUS.PENDING,
            razorpay_payment_id: payment.id,
            razorpay_refund_id: pendingRefundId,
            updated_at: new Date(),
          },
        });

        return {
          type: "refund_required",
          success: true,
          orderId: order.id,
          paymentId: payment.id,
          amountInPaise,
          pendingRefundId,
        };
      }

      /*
       * An already-paid order must not be finalized again.
       */

      if (order.payment_status === PAYMENT_STATUS.PAID) {
        const recorded = await recordWebhookEvent(tx, eventId, event);

        return {
          type: "already_paid",
          success: true,
          alreadyPaid: true,
          duplicate: !recorded,
        };
      }

      /*
       * An already-refunded order is terminal.
       */

      if (order.payment_status === PAYMENT_STATUS.REFUNDED) {
        const recorded = await recordWebhookEvent(tx, eventId, event);

        return {
          type: "already_refunded",
          success: true,
          alreadyRefunded: true,
          duplicate: !recorded,
        };
      }

      /*
       * Record the event before finalization, within the same
       * transaction. If finalization fails, the event insert
       * rolls back as well.
       */

      const recorded = await recordWebhookEvent(tx, eventId, event);

      if (!recorded) {
        return {
          type: "duplicate",
          success: true,
          duplicate: true,
        };
      }

      const result = await finalizeSuccessfulPayment(
        tx,
        order,
        payment.id,
        "Payment captured successfully via Razorpay webhook",
      );

      return {
        type: "finalized",
        success: true,
        order: result.order,
        alreadyPaid: result.alreadyPaid,
      };
    });

    /*
     * ----------------------------------------------------------------------
     * Return normal webhook decisions immediately.
     * ----------------------------------------------------------------------
     */

    if (paymentDecision.type !== "refund_required") {
      return paymentDecision;
    }

    /*
     * ----------------------------------------------------------------------
     * Create late-payment refund OUTSIDE the database transaction.
     * ----------------------------------------------------------------------
     *
     * If the request fails ambiguously, keep the PENDING marker.
     * Razorpay might have accepted the refund even if our application
     * did not receive the response.
     */

    let refund;

    try {
      refund = await requestRazorpayRefund(
        paymentDecision.paymentId,
        paymentDecision.amountInPaise,
        paymentDecision.orderId,
        "Payment received after order cancellation",
      );
    } catch (error) {
      console.error("Late payment refund failed:", error);
      throw error;
    }

    if (!refund?.id) {
      throw new AppError(
        "Razorpay refund response did not include a refund ID",
        502,
      );
    }

    /*
     * ----------------------------------------------------------------------
     * Finalize the late-payment refund and record the event atomically.
     * ----------------------------------------------------------------------
     */

    return runSerializableTransaction(async (tx) => {
      const order = await lockOrderById(tx, paymentDecision.orderId);

      if (!order) {
        throw new AppError("Order not found", 404);
      }

      const existingEvent = await tx.payment_webhook_events.findUnique({
        where: {
          event_id: eventId,
        },
      });

      if (existingEvent) {
        return {
          success: true,
          duplicate: true,
        };
      }

      /*
       * Confirm this request still owns the refund claim.
       */

      const ownsRefundClaim =
        order.refund_status === REFUND_STATUS.PENDING &&
        order.razorpay_refund_id === `PENDING-${paymentDecision.orderId}`;

      if (!ownsRefundClaim) {
        const recorded = await recordWebhookEvent(tx, eventId, event);

        return {
          success: true,
          duplicate: !recorded,
          refundAlreadyReconciled: true,
        };
      }

      const recorded = await recordWebhookEvent(tx, eventId, event);

      if (!recorded) {
        return {
          success: true,
          duplicate: true,
        };
      }

      const immediateRefundProcessed = refund.status === "processed";

      const immediateRefundFailed = refund.status === "failed";

      const updatedOrder = await tx.orders.update({
        where: {
          id: order.id,
        },
        data: {
          payment_status: immediateRefundProcessed
            ? PAYMENT_STATUS.REFUNDED
            : PAYMENT_STATUS.PAID,

          refund_status: immediateRefundProcessed
            ? REFUND_STATUS.PROCESSED
            : immediateRefundFailed
              ? REFUND_STATUS.FAILED
              : REFUND_STATUS.PENDING,

          razorpay_payment_id: paymentDecision.paymentId,
          razorpay_refund_id: refund.id,

          refunded_at: immediateRefundProcessed ? new Date() : null,

          updated_at: new Date(),
        },
      });

      return {
        success: true,
        refunded: immediateRefundProcessed,
        refundPending: !immediateRefundProcessed && !immediateRefundFailed,
        refundFailed: immediateRefundFailed,
        refundId: refund.id,
        refundStatus: refund.status,
        order: updatedOrder,
      };
    });
  }

  /*
   * --------------------------------------------------------------------------
   * REFUND WEBHOOKS
   * --------------------------------------------------------------------------
   */

  if (
    event === "refund.created" ||
    event === "refund.processed" ||
    event === "refund.failed"
  ) {
    const refund = payload?.payload?.refund?.entity;

    if (!refund) {
      throw new AppError("Refund entity missing from webhook", 400);
    }

    if (!refund.payment_id) {
      throw new AppError("Payment ID missing from refund webhook", 400);
    }

    if (typeof refund.id !== "string" || !refund.id.trim()) {
      throw new AppError("Refund ID missing from refund webhook", 400);
    }

    const paymentId = refund.payment_id;
    const returnId = refund?.notes?.return_id;

    /*
     * ----------------------------------------------------------------------
     * RETURN REFUND
     * ----------------------------------------------------------------------
     *
     * If Razorpay explicitly associates this refund with a return,
     * do not fall through to the normal order-refund flow.
     */

    if (returnId) {
      return runSerializableTransaction(async (tx) => {
        let returnRecord = await tx.returns.findUnique({
          where: {
            id: returnId,
          },
        });

        if (!returnRecord) {
          const recorded = await recordWebhookEvent(tx, eventId, event);

          return {
            success: true,
            ignored: true,
            duplicate: !recorded,
            message: "Return not found for refund webhook",
          };
        }

        /*
         * Lock the return row before inspecting or changing state.
         */

        const lockedReturnRows = await tx.$queryRaw`
                    SELECT *
                    FROM returns
                    WHERE id = ${returnRecord.id}::uuid
                    FOR UPDATE
                `;

        returnRecord = lockedReturnRows[0];

        if (!returnRecord) {
          throw new AppError("Return not found", 404);
        }

        const existingEvent = await tx.payment_webhook_events.findUnique({
          where: {
            event_id: eventId,
          },
        });

        if (existingEvent) {
          return {
            success: true,
            duplicate: true,
          };
        }

        const returnOrder = await tx.orders.findUnique({
          where: {
            id: returnRecord.order_id,
          },
        });

        if (!returnOrder) {
          throw new AppError("Return order not found", 404);
        }

        /*
         * Verify the refund is associated with the payment
         * belonging to this return's order.
         */

        if (returnOrder.razorpay_payment_id !== paymentId) {
          throw new AppError(
            "Refund payment does not belong to return order",
            400,
          );
        }

        validateReturnRefundWebhook(
          {
            ...returnRecord,
            orders: returnOrder,
          },
          refund,
        );

        /*
         * Never let an old refund overwrite a different,
         * currently tracked refund.
         */

        const currentRefundId = returnRecord.razorpay_refund_id;

        const hasPendingRefundMarker =
          typeof currentRefundId === "string" &&
          currentRefundId.startsWith("PENDING-");

        if (
          currentRefundId &&
          !hasPendingRefundMarker &&
          currentRefundId !== refund.id
        ) {
          const recorded = await recordWebhookEvent(tx, eventId, event);

          return {
            success: true,
            ignored: true,
            duplicate: !recorded,
            message:
              "Stale refund event ignored because another refund is tracked",
          };
        }

        // Ignore a delayed "refund.created" event for a
        // refund that has already been marked as failed.
        // It must not change FAILED back to PENDING.
        if (
          event === "refund.created" &&
          order.refund_status === REFUND_STATUS.FAILED &&
          order.razorpay_refund_id === refund.id
        ) {
          const recorded = await recordWebhookEvent(tx, eventId, event);

          return {
            success: true,
            ignored: true,
            duplicate: !recorded,
            message: "Stale refund.created event ignored for a failed refund",
          };
        }

        /*
         * REFUND CREATED
         *
         * Do not change the return's business status here.
         * Only bind the refund ID and let refund.processed
         * mark the return as refunded.
         */

        if (event === "refund.created") {
          if (returnRecord.status === RETURN_STATUS.REFUNDED) {
            const recorded = await recordWebhookEvent(tx, eventId, event);

            return {
              success: true,
              alreadyRefunded: true,
              duplicate: !recorded,
            };
          }

          const recorded = await recordWebhookEvent(tx, eventId, event);

          if (!recorded) {
            return {
              success: true,
              duplicate: true,
            };
          }

          const updatedReturn = await tx.returns.update({
            where: {
              id: returnRecord.id,
            },
            data: {
              razorpay_refund_id: refund.id,
              updated_at: new Date(),
            },
          });

          return {
            success: true,
            return: updatedReturn,
            refundStatus: REFUND_STATUS.PENDING,
          };
        }

        /*
         * REFUND PROCESSED
         *
         * A processed refund is terminal.
         */

        if (event === "refund.processed") {
          if (returnRecord.status === RETURN_STATUS.REFUNDED) {
            const recorded = await recordWebhookEvent(tx, eventId, event);

            return {
              success: true,
              alreadyRefunded: true,
              duplicate: !recorded,
            };
          }

          const recorded = await recordWebhookEvent(tx, eventId, event);

          if (!recorded) {
            return {
              success: true,
              duplicate: true,
            };
          }

          const updatedReturn = await tx.returns.update({
            where: {
              id: returnRecord.id,
            },
            data: {
              status: RETURN_STATUS.REFUNDED,
              razorpay_refund_id: refund.id,
              refunded_at: returnRecord.refunded_at ?? new Date(),
              updated_at: new Date(),
            },
          });

          return {
            success: true,
            return: updatedReturn,
            refundStatus: REFUND_STATUS.PROCESSED,
          };
        }

        /*
         * REFUND FAILED
         *
         * Never undo a completed refund. A failed event must
         * not clear a different, newer refund ID.
         */

        if (event === "refund.failed") {
          if (returnRecord.status === RETURN_STATUS.REFUNDED) {
            const recorded = await recordWebhookEvent(tx, eventId, event);

            return {
              success: true,
              ignored: true,
              alreadyRefunded: true,
              duplicate: !recorded,
            };
          }

          const recorded = await recordWebhookEvent(tx, eventId, event);

          if (!recorded) {
            return {
              success: true,
              duplicate: true,
            };
          }

          const updatedReturn = await tx.returns.update({
            where: {
              id: returnRecord.id,
            },
            data: {
              status: RETURN_STATUS.RECEIVED,
              razorpay_refund_id: null,
              refunded_at: null,
              updated_at: new Date(),
            },
          });

          return {
            success: true,
            return: updatedReturn,
            refundStatus: REFUND_STATUS.FAILED,
          };
        }

        return {
          success: true,
          ignored: true,
        };
      });
    }

    /*
     * ----------------------------------------------------------------------
     * NORMAL ORDER REFUND
     * ----------------------------------------------------------------------
     */

    return runSerializableTransaction(async (tx) => {
      const order = await lockOrderByPaymentId(tx, paymentId);

      if (!order) {
        const recorded = await recordWebhookEvent(tx, eventId, event);

        return {
          success: true,
          ignored: true,
          duplicate: !recorded,
          message: "Order not found for refund webhook",
        };
      }

      const existingEvent = await tx.payment_webhook_events.findUnique({
        where: {
          event_id: eventId,
        },
      });

      if (existingEvent) {
        return {
          success: true,
          duplicate: true,
        };
      }

      if (refund.payment_id !== order.razorpay_payment_id) {
        throw new AppError("Refund payment does not belong to order", 400);
      }

      /*
       * Normal order cancellation refunds must be full refunds.
       */

      const refundAmount = getRefundAmountInPaise(refund);
      const orderAmount = getAmountInPaise(order.total_amount);

      if (refundAmount <= 0 || refundAmount !== orderAmount) {
        throw new AppError(
          "Invalid partial refund for normal order cancellation",
          400,
        );
      }

      /*
       * A real refund ID that differs from the currently tracked
       * ID is treated as stale. A PENDING marker can be replaced
       * with the real Razorpay refund ID.
       */

      const currentRefundId = order.razorpay_refund_id;

      const hasPendingRefundMarker =
        typeof currentRefundId === "string" &&
        currentRefundId.startsWith("PENDING-");

      if (
        currentRefundId &&
        !hasPendingRefundMarker &&
        currentRefundId !== refund.id
      ) {
        const recorded = await recordWebhookEvent(tx, eventId, event);

        return {
          success: true,
          ignored: true,
          duplicate: !recorded,
          message:
            "Stale refund event ignored because another refund is tracked",
        };
      }

      /*
       * REFUND CREATED
       */

      if (event === "refund.created") {
        if (
          order.refund_status === REFUND_STATUS.PROCESSED ||
          order.payment_status === PAYMENT_STATUS.REFUNDED
        ) {
          const recorded = await recordWebhookEvent(tx, eventId, event);

          return {
            success: true,
            ignored: true,
            alreadyProcessed: true,
            duplicate: !recorded,
          };
        }

        const recorded = await recordWebhookEvent(tx, eventId, event);

        if (!recorded) {
          return {
            success: true,
            duplicate: true,
          };
        }

        const updatedOrder = await tx.orders.update({
          where: {
            id: order.id,
          },
          data: {
            refund_status: REFUND_STATUS.PENDING,
            razorpay_refund_id: refund.id,
            updated_at: new Date(),
          },
        });

        return {
          success: true,
          refundStatus: REFUND_STATUS.PENDING,
          order: updatedOrder,
        };
      }

      /*
       * REFUND PROCESSED
       *
       * A completed refund must never be downgraded.
       */

      if (event === "refund.processed") {
        if (
          order.refund_status === REFUND_STATUS.PROCESSED ||
          order.payment_status === PAYMENT_STATUS.REFUNDED
        ) {
          const recorded = await recordWebhookEvent(tx, eventId, event);

          return {
            success: true,
            alreadyProcessed: true,
            duplicate: !recorded,
          };
        }

        const recorded = await recordWebhookEvent(tx, eventId, event);

        if (!recorded) {
          return {
            success: true,
            duplicate: true,
          };
        }

        const updatedOrder = await tx.orders.update({
          where: {
            id: order.id,
          },
          data: {
            payment_status: PAYMENT_STATUS.REFUNDED,
            refund_status: REFUND_STATUS.PROCESSED,
            razorpay_refund_id: refund.id,
            refunded_at: order.refunded_at ?? new Date(),
            updated_at: new Date(),
          },
        });

        return {
          success: true,
          paymentStatus: PAYMENT_STATUS.REFUNDED,
          refundStatus: REFUND_STATUS.PROCESSED,
          order: updatedOrder,
        };
      }

      /*
       * REFUND FAILED
       *
       * Do not downgrade a completed refund.
       */

      if (event === "refund.failed") {
        if (
          order.refund_status === REFUND_STATUS.PROCESSED ||
          order.payment_status === PAYMENT_STATUS.REFUNDED
        ) {
          const recorded = await recordWebhookEvent(tx, eventId, event);

          return {
            success: true,
            ignored: true,
            alreadyProcessed: true,
            duplicate: !recorded,
          };
        }

        const recorded = await recordWebhookEvent(tx, eventId, event);

        if (!recorded) {
          return {
            success: true,
            duplicate: true,
          };
        }

        const updatedOrder = await tx.orders.update({
          where: {
            id: order.id,
          },
          data: {
            refund_status: REFUND_STATUS.FAILED,
            razorpay_refund_id: refund.id,
            updated_at: new Date(),
          },
        });

        return {
          success: true,
          refundStatus: REFUND_STATUS.FAILED,
          order: updatedOrder,
        };
      }

      return {
        success: true,
        ignored: true,
      };
    });
  }

  /*
   * --------------------------------------------------------------------------
   * Fallback
   * --------------------------------------------------------------------------
   */

  return {
    success: true,
    ignored: true,
  };
};

/*
|--------------------------------------------------------------------------
| Additional Order Lock Helper
|--------------------------------------------------------------------------
*/

/**
 * Lock an order using its Razorpay payment ID.
 *
 * Kept separate because refund webhooks naturally identify
 * the payment rather than our internal order ID.
 */
async function lockOrderByPaymentId(tx, paymentId) {
  const rows = await tx.$queryRaw`
    SELECT *
    FROM orders
    WHERE razorpay_payment_id = ${paymentId}
    FOR UPDATE
  `;

  return rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| Cancel Paid Order + Refund
|--------------------------------------------------------------------------
*/

export const cancelPaidOrder = async (userId, orderId) => {
  /*
  |--------------------------------------------------------------------------
  | 1. Get order
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

  /*
  |--------------------------------------------------------------------------
  | 2. Ownership
  |--------------------------------------------------------------------------
  */

  if (order.user_id !== userId) {
    throw new AppError("You are not allowed to cancel this order", 403);
  }

  /*
  |--------------------------------------------------------------------------
  | 3. Already cancelled + refund already processed
  |--------------------------------------------------------------------------
  */

  const alreadyCancelled = order.status === ORDER_STATUS.CANCELLED;

  if (alreadyCancelled && order.refund_status === REFUND_STATUS.PROCESSED) {
    return {
      order,

      message: "Order is already cancelled and refund is processed",
    };
  }

  /*
   * A failed refund must be retried through the dedicated
   * flow, which verifies the previous Razorpay refund first.
   */

  if (alreadyCancelled && order.refund_status === REFUND_STATUS.FAILED) {
    throw new AppError(
      "The previous refund failed. Use the refund retry flow to verify its status before retrying.",
      409,
    );
  }
  /*
  |--------------------------------------------------------------------------
  | 4. Payment must exist
  |--------------------------------------------------------------------------
  */

  if (!order.razorpay_payment_id) {
    throw new AppError("Payment information is missing for this order", 400);
  }

  /*
  |--------------------------------------------------------------------------
  | 5. Calculate refund amount
  |--------------------------------------------------------------------------
  */

  const refundAmountInPaise = getAmountInPaise(order.total_amount);

  if (refundAmountInPaise <= 0) {
    throw new AppError("Invalid order refund amount", 400);
  }

  /*
  |--------------------------------------------------------------------------
  | 6. Fetch latest Razorpay payment
  |--------------------------------------------------------------------------
  */

  let payment;

  try {
    payment = await razorpay.payments.fetch(order.razorpay_payment_id);
  } catch (error) {
    console.error("Failed to fetch Razorpay payment:", error?.error || error);

    throw new AppError("Unable to verify payment status", 502);
  }

  /*
  |--------------------------------------------------------------------------
  | 7. Validate payment relationship
  |--------------------------------------------------------------------------
  */

  validatePaymentOrderRelationship(payment, order);

  validatePaymentAmount(payment, order);
  /*
  |--------------------------------------------------------------------------
  | 8. Check whether Razorpay already refunded
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  |
  | This check happens BEFORE acquiring a new refund claim.
  |
  | This protects against:
  |
  | 1. Razorpay accepting the refund.
  | 2. Our application timing out/crashing.
  | 3. Database remaining at PENDING-<orderId>.
  | 4. Customer retrying cancellation.
  |
  | In that situation we reconcile instead of creating
  | another refund.
  |--------------------------------------------------------------------------
  */

  const alreadyRefundedAmount = getAlreadyRefundedAmountInPaise(payment);

  if (alreadyRefundedAmount >= refundAmountInPaise) {
    const refundId =
      payment.refunds?.items?.find(
        (item) => Number(item.amount ?? 0) >= refundAmountInPaise,
      )?.id ??
      payment.refunds?.items?.[0]?.id ??
      order.razorpay_refund_id ??
      null;

    const reconciledOrder = await runSerializableTransaction(async (tx) => {
      const lockedOrder = await lockOrderById(tx, orderId);

      if (!lockedOrder) {
        throw new AppError("Order not found", 404);
      }

      /*
          |--------------------------------------------------------------------------
          | Ownership must still be valid.
          |--------------------------------------------------------------------------
          */

      if (lockedOrder.user_id !== userId) {
        throw new AppError("You are not allowed to cancel this order", 403);
      }

      /*
          |--------------------------------------------------------------------------
          | Already fully reconciled.
          |--------------------------------------------------------------------------
          */

      if (
        lockedOrder.status === ORDER_STATUS.CANCELLED &&
        lockedOrder.payment_status === PAYMENT_STATUS.REFUNDED &&
        lockedOrder.refund_status === REFUND_STATUS.PROCESSED
      ) {
        return lockedOrder;
      }

      /*
          |--------------------------------------------------------------------------
          | Restore inventory ONLY if the order was
          | not already cancelled.
          |
          | This is extremely important.
          |
          | A cancelled order has already had its inventory
          | restored during the original cancellation flow.
          |--------------------------------------------------------------------------
          */

      if (lockedOrder.status !== ORDER_STATUS.CANCELLED) {
        await restorePaidOrderInventory(tx, lockedOrder.id);
      }

      return tx.orders.update({
        where: {
          id: lockedOrder.id,
        },

        data: {
          status: ORDER_STATUS.CANCELLED,

          payment_status: PAYMENT_STATUS.REFUNDED,

          refund_status: REFUND_STATUS.PROCESSED,

          razorpay_refund_id: refundId,

          refunded_at: lockedOrder.refunded_at ?? new Date(),

          updated_at: new Date(),
        },
      });
    });

    return {
      order: reconciledOrder,

      message:
        "Order cancelled and existing Razorpay refund reconciled successfully",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | 9. Payment must be captured
  |--------------------------------------------------------------------------
  */

  if (payment.status !== "captured") {
    throw new AppError(
      `Order cannot be cancelled because payment status is "${payment.status}"`,
      400,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | 10. Acquire real row lock and claim refund
  |--------------------------------------------------------------------------
  */

  const claim = await runSerializableTransaction(async (tx) => {
    const lockedOrder = await lockOrderById(tx, orderId);

    if (!lockedOrder) {
      throw new AppError("Order not found", 404);
    }

    /*
        |--------------------------------------------------------------------------
        | Ownership
        |--------------------------------------------------------------------------
        */

    if (lockedOrder.user_id !== userId) {
      throw new AppError("You are not allowed to cancel this order", 403);
    }

    /*
        |--------------------------------------------------------------------------
        | Payment must still be paid
        |--------------------------------------------------------------------------
        |
        | If a webhook/reconciliation changed the order to
        | refunded while we were waiting for the lock,
        | we should not create another refund.
        |--------------------------------------------------------------------------
        */

    if (
      lockedOrder.payment_status === PAYMENT_STATUS.REFUNDED &&
      lockedOrder.refund_status === REFUND_STATUS.PROCESSED
    ) {
      return {
        alreadyProcessed: true,

        order: lockedOrder,
      };
    }

    if (lockedOrder.payment_status !== PAYMENT_STATUS.PAID) {
      throw new AppError(
        "Only paid orders can use the paid-order refund flow",
        400,
      );
    }

    /*
        |--------------------------------------------------------------------------
        | Already cancelled orders
        |--------------------------------------------------------------------------
        |
        | Inventory must NEVER be restored here.
        |
        | The inventory was already handled when the order
        | became cancelled.
        |
        | paid cancellation:
        |   inventory restored
        |
        | unpaid cancellation:
        |   reserved inventory released
        |
        | At this point we only claim/retry the refund.
        |--------------------------------------------------------------------------
        */

    /*
        |--------------------------------------------------------------------------
        | A real Razorpay refund ID means Razorpay has
        | already created a refund.
        |--------------------------------------------------------------------------
        */

    if (
      lockedOrder.refund_status === REFUND_STATUS.PENDING &&
      lockedOrder.razorpay_refund_id &&
      !lockedOrder.razorpay_refund_id.startsWith("PENDING-")
    ) {
      return {
        refundInProgress: true,

        order: lockedOrder,
      };
    }

    /*
        |--------------------------------------------------------------------------
        | A PENDING marker means another application
        | process currently owns the refund claim.
        |--------------------------------------------------------------------------
        */

    if (
      lockedOrder.refund_status === REFUND_STATUS.PENDING &&
      lockedOrder.razorpay_refund_id?.startsWith("PENDING-")
    ) {
      return {
        refundInProgress: true,

        order: lockedOrder,
      };
    }

    /*
        |--------------------------------------------------------------------------
        | Claim refund
        |--------------------------------------------------------------------------
        */

    const pendingRefundId = `PENDING-${lockedOrder.id}`;

    const claimedOrder = await tx.orders.update({
      where: {
        id: lockedOrder.id,
      },

      data: {
        refund_status: REFUND_STATUS.PENDING,

        razorpay_refund_id: pendingRefundId,

        updated_at: new Date(),
      },
    });

    return {
      claimed: true,

      order: claimedOrder,
    };
  });

  /*
  |--------------------------------------------------------------------------
  | 11. Already processed
  |--------------------------------------------------------------------------
  */

  if (claim.alreadyProcessed) {
    return {
      order: claim.order,

      message: "Order is already cancelled and refund is processed",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | 12. Refund already being processed
  |--------------------------------------------------------------------------
  */

  if (claim.refundInProgress) {
    throw new AppError(
      "A refund for this order is already being processed by Razorpay or another application request",
      409,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | 13. Call Razorpay outside transaction
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  |
  | Never keep the Prisma transaction open while
  | communicating with Razorpay.
  |--------------------------------------------------------------------------
  */

  let refund;

  try {
    refund = await requestRazorpayRefund(
      order.razorpay_payment_id,
      refundAmountInPaise,
      order.id,
      "Order cancelled by customer",
    );
  } catch (error) {
    /*
    |--------------------------------------------------------------------------
    | Do NOT clear PENDING.
    |
    | Razorpay may have accepted the refund even if our
    | application did not receive the response.
    |--------------------------------------------------------------------------
    */

    console.error("Order cancellation refund request failed:", error);

    throw error;
  }

  /*
  |--------------------------------------------------------------------------
  | 14. Save refund result and cancel order atomically
  |--------------------------------------------------------------------------
  */

  const finalOrder = await runSerializableTransaction(async (tx) => {
    const lockedOrder = await lockOrderById(tx, orderId);

    if (!lockedOrder) {
      throw new AppError("Order not found", 404);
    }

    // If another webhook/request already
    // processed the refund, do not modify it.
    if (
      lockedOrder.refund_status === REFUND_STATUS.PROCESSED &&
      lockedOrder.payment_status === PAYMENT_STATUS.REFUNDED
    ) {
      return lockedOrder;
    }

    // Make sure this request still owns
    // the refund claim.
    if (
      lockedOrder.refund_status !== REFUND_STATUS.PENDING ||
      (lockedOrder.razorpay_refund_id &&
        !lockedOrder.razorpay_refund_id.startsWith("PENDING-") &&
        lockedOrder.razorpay_refund_id !== refund.id)
    ) {
      return lockedOrder;
    }

    // Accept only recognized refund states.
    const refundStatus = String(refund.status ?? "").toLowerCase();

    let paymentStatus;
    let localRefundStatus;

    if (refundStatus === "processed") {
      paymentStatus = PAYMENT_STATUS.REFUNDED;

      localRefundStatus = REFUND_STATUS.PROCESSED;
    } else if (refundStatus === "failed") {
      paymentStatus = PAYMENT_STATUS.PAID;

      localRefundStatus = REFUND_STATUS.FAILED;
    } else if (refundStatus === "pending") {
      paymentStatus = PAYMENT_STATUS.PAID;

      localRefundStatus = REFUND_STATUS.PENDING;
    } else {
      // Do not overwrite the claim when
      // Razorpay returns an unknown status.
      throw new AppError(
        "Razorpay returned an unrecognized refund status",
        502,
      );
    }

    // A recognized response must include
    // the real Razorpay refund ID.
    if (typeof refund.id !== "string" || !refund.id.trim()) {
      throw new AppError("Razorpay returned an invalid refund ID", 502);
    }

    // Restore inventory exactly once.
    if (lockedOrder.status !== ORDER_STATUS.CANCELLED) {
      await restorePaidOrderInventory(tx, lockedOrder.id);
    }

    return tx.orders.update({
      where: {
        id: lockedOrder.id,
      },
      data: {
        status: ORDER_STATUS.CANCELLED,

        payment_status: paymentStatus,

        refund_status: localRefundStatus,

        razorpay_refund_id: refund.id,

        refunded_at:
          localRefundStatus === REFUND_STATUS.PROCESSED ? new Date() : null,

        updated_at: new Date(),
      },
    });
  });

  /*
  |--------------------------------------------------------------------------
  | 15. Final response
  |--------------------------------------------------------------------------
  */

  const refundStatus = String(refund.status ?? "").toLowerCase();

  const message =
    refundStatus === "processed"
      ? "Order cancelled and refund processed successfully"
      : refundStatus === "failed"
        ? "Order cancelled, but the refund failed. Please retry after verifying the refund status."
        : "Order cancelled. The refund is pending with Razorpay.";
  return {
    order: finalOrder,
    message,
  };
};

/*
|--------------------------------------------------------------------------
| Retry Paid Order Refund
|--------------------------------------------------------------------------
*/

export const retryPaidOrderRefund = async (userId, orderId) => {
  // 1. Get order
  const order = await prisma.orders.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  // 2. Verify ownership
  if (order.user_id !== userId) {
    throw new AppError("You are not allowed to retry this refund", 403);
  }

  // 3. Only cancelled orders can use this flow
  if (order.status !== ORDER_STATUS.CANCELLED) {
    throw new AppError(
      "Only cancelled orders can have their refund retried",
      400,
    );
  }

  // 4. Payment must exist
  if (!order.razorpay_payment_id) {
    throw new AppError("Payment information is missing for this order", 400);
  }

  // 5. Calculate intended refund amount
  const refundAmountInPaise = getAmountInPaise(order.total_amount);

  if (!Number.isSafeInteger(refundAmountInPaise) || refundAmountInPaise <= 0) {
    throw new AppError("Invalid order refund amount", 400);
  }

  // 6. Fetch current Razorpay payment
  let payment;

  try {
    payment = await razorpay.payments.fetch(order.razorpay_payment_id);
  } catch (error) {
    console.error(
      "Failed to fetch Razorpay payment:",
      error?.error || error?.message || error,
    );

    throw new AppError("Unable to verify payment status", 502);
  }

  // 7. Verify payment belongs to this order
  validatePaymentOrderRelationship(payment, order);

  // 8. Reconcile an existing real refund ID.
  // Never create a second refund while the existing
  // Razorpay refund is pending or its outcome is unknown.
  const existingRefundId = order.razorpay_refund_id;
  let verifiedPreviousRefundFailed = false;

  if (existingRefundId && !existingRefundId.startsWith("PENDING-")) {
    let previousRefund;

    try {
      previousRefund = await razorpay.refunds.fetch(existingRefundId);
    } catch (error) {
      console.error(
        "Unable to fetch existing Razorpay refund:",
        error?.error || error?.message || error,
      );

      throw new AppError(
        "Unable to verify the existing refund. Reconciliation is required before retrying.",
        502,
      );
    }

    if (previousRefund.payment_id !== order.razorpay_payment_id) {
      throw new AppError(
        "Existing refund does not belong to this payment",
        409,
      );
    }

    const previousStatus = String(previousRefund.status ?? "").toLowerCase();

    if (previousStatus === "pending") {
      throw new AppError(
        "The existing Razorpay refund is still processing",
        409,
      );
    }

    if (previousStatus === "processed") {
      // The refund exists, but verify the total amount
      // below before marking the order fully refunded.
    } else if (previousStatus === "failed") {
      verifiedPreviousRefundFailed = true;
    } else {
      throw new AppError(
        "The existing refund has an unknown status. Manual reconciliation is required.",
        409,
      );
    }
  }

  // 9. Check the total amount Razorpay says was refunded.
  const alreadyRefundedAmount = getAlreadyRefundedAmountInPaise(payment);

  if (alreadyRefundedAmount >= refundAmountInPaise) {
    const refundItems = payment.refunds?.items ?? [];

    const matchingRefund = refundItems.find(
      (item) =>
        Number(item.amount ?? 0) >= refundAmountInPaise &&
        String(item.status ?? "").toLowerCase() === "processed",
    );

    const refundId =
      matchingRefund?.id ??
      (existingRefundId && !existingRefundId.startsWith("PENDING-")
        ? existingRefundId
        : null);

    const reconciledOrder = await runSerializableTransaction(async (tx) => {
      const lockedOrder = await lockOrderById(tx, orderId);

      if (!lockedOrder) {
        throw new AppError("Order not found", 404);
      }

      if (lockedOrder.user_id !== userId) {
        throw new AppError("You are not allowed to retry this refund", 403);
      }

      if (lockedOrder.status !== ORDER_STATUS.CANCELLED) {
        throw new AppError("Order is no longer cancelled", 409);
      }

      if (
        lockedOrder.refund_status === REFUND_STATUS.PROCESSED &&
        lockedOrder.payment_status === PAYMENT_STATUS.REFUNDED
      ) {
        return lockedOrder;
      }

      // Do not overwrite a different refund created
      // while we were querying Razorpay.
      if (lockedOrder.razorpay_refund_id !== order.razorpay_refund_id) {
        throw new AppError("Refund state changed during reconciliation", 409);
      }

      return tx.orders.update({
        where: { id: lockedOrder.id },
        data: {
          payment_status: PAYMENT_STATUS.REFUNDED,
          refund_status: REFUND_STATUS.PROCESSED,
          razorpay_refund_id: refundId,
          refunded_at: lockedOrder.refunded_at ?? new Date(),
          updated_at: new Date(),
        },
      });
    });

    return {
      order: reconciledOrder,
      message: "Existing Razorpay refund reconciled successfully",
    };
  }

  // If some money was refunded but the full amount wasn't,
  // don't issue another full refund automatically.
  if (alreadyRefundedAmount > 0) {
    throw new AppError(
      "A partial refund already exists. Reconcile the remaining refundable amount before retrying.",
      409,
    );
  }

  // 10. Payment must be captured
  if (payment.status !== "captured") {
    throw new AppError(
      `Refund cannot be retried because payment status is "${payment.status}"`,
      400,
    );
  }

  // If the order has a pending marker without a real Razorpay
  // refund ID, we cannot prove whether an earlier request succeeded.
  if (
    order.refund_status === REFUND_STATUS.PENDING &&
    (!existingRefundId || existingRefundId.startsWith("PENDING-"))
  ) {
    throw new AppError(
      "The previous refund outcome is uncertain. Reconcile with Razorpay before retrying.",
      409,
    );
  }

  // 11. If an existing refund was confirmed failed,
  // record that result before attempting another refund.
  if (
    verifiedPreviousRefundFailed &&
    order.refund_status !== REFUND_STATUS.FAILED
  ) {
    await runSerializableTransaction(async (tx) => {
      const lockedOrder = await lockOrderById(tx, orderId);

      if (!lockedOrder) {
        throw new AppError("Order not found", 404);
      }

      if (lockedOrder.razorpay_refund_id !== existingRefundId) {
        throw new AppError("Refund state changed during verification", 409);
      }

      if (lockedOrder.refund_status === REFUND_STATUS.PROCESSED) {
        throw new AppError("Refund has already been processed", 409);
      }

      await tx.orders.update({
        where: { id: orderId },
        data: {
          refund_status: REFUND_STATUS.FAILED,
          updated_at: new Date(),
        },
      });
    });
  }

  // 12. Acquire a new refund claim.
  const claim = await runSerializableTransaction(async (tx) => {
    const lockedOrder = await lockOrderById(tx, orderId);

    if (!lockedOrder) {
      throw new AppError("Order not found", 404);
    }

    if (lockedOrder.user_id !== userId) {
      throw new AppError("You are not allowed to retry this refund", 403);
    }

    if (lockedOrder.status !== ORDER_STATUS.CANCELLED) {
      throw new AppError(
        "Order must remain cancelled while retrying the refund",
        409,
      );
    }

    if (
      lockedOrder.refund_status === REFUND_STATUS.PROCESSED &&
      lockedOrder.payment_status === PAYMENT_STATUS.REFUNDED
    ) {
      return {
        alreadyProcessed: true,
        order: lockedOrder,
      };
    }

    // Only proceed from a clean state or a confirmed
    // failed refund that we verified above.
    if (lockedOrder.refund_status === REFUND_STATUS.PENDING) {
      return {
        refundInProgress: true,
        order: lockedOrder,
      };
    }

    if (lockedOrder.refund_status === REFUND_STATUS.FAILED) {
      if (
        !verifiedPreviousRefundFailed ||
        lockedOrder.razorpay_refund_id !== existingRefundId
      ) {
        throw new AppError(
          "The previous refund must be verified as failed before retrying",
          409,
        );
      }
    } else if (lockedOrder.refund_status != null) {
      throw new AppError("Refund is not in a retryable state", 409);
    }

    const pendingRefundId = `PENDING-${lockedOrder.id}`;

    const claimedOrder = await tx.orders.update({
      where: { id: lockedOrder.id },
      data: {
        refund_status: REFUND_STATUS.PENDING,
        razorpay_refund_id: pendingRefundId,
        updated_at: new Date(),
      },
    });

    return {
      claimed: true,
      order: claimedOrder,
    };
  });

  if (claim.alreadyProcessed) {
    return {
      order: claim.order,
      message: "Refund has already been processed",
    };
  }

  if (claim.refundInProgress) {
    throw new AppError(
      "A refund is already pending. Reconcile its status before retrying.",
      409,
    );
  }

  // 13. Request refund outside the database transaction.
  let refund;

  try {
    refund = await requestRazorpayRefund(
      order.razorpay_payment_id,
      refundAmountInPaise,
      order.id,
      "Retry refund for cancelled order",
    );
  } catch (error) {
    // Keep the pending marker. A network error does not prove
    // that Razorpay rejected the refund.
    console.error(
      "Retry Razorpay refund outcome is uncertain:",
      error?.error || error?.message || error,
    );

    throw error;
  }

  // 14. Validate Razorpay's response before saving it.
  const refundStatus = String(refund.status ?? "").toLowerCase();

  if (typeof refund.id !== "string" || !refund.id.trim()) {
    throw new AppError(
      "Razorpay returned an invalid refund ID. Reconciliation is required.",
      502,
    );
  }

  let paymentStatus;
  let localRefundStatus;

  if (refundStatus === "processed") {
    paymentStatus = PAYMENT_STATUS.REFUNDED;
    localRefundStatus = REFUND_STATUS.PROCESSED;
  } else if (refundStatus === "failed") {
    paymentStatus = PAYMENT_STATUS.PAID;
    localRefundStatus = REFUND_STATUS.FAILED;
  } else if (refundStatus === "pending") {
    paymentStatus = PAYMENT_STATUS.PAID;
    localRefundStatus = REFUND_STATUS.PENDING;
  } else {
    // Preserve the pending claim for reconciliation rather than
    // saving an unknown state.
    throw new AppError(
      "Razorpay returned an unrecognized refund status. Reconciliation is required.",
      502,
    );
  }

  // 15. Save the result only if this request still owns the claim.
  const finalOrder = await runSerializableTransaction(async (tx) => {
    const lockedOrder = await lockOrderById(tx, orderId);

    if (!lockedOrder) {
      throw new AppError("Order not found", 404);
    }

    if (
      lockedOrder.refund_status === REFUND_STATUS.PROCESSED &&
      lockedOrder.payment_status === PAYMENT_STATUS.REFUNDED
    ) {
      return lockedOrder;
    }

    if (
      lockedOrder.refund_status !== REFUND_STATUS.PENDING ||
      lockedOrder.razorpay_refund_id !== `PENDING-${orderId}`
    ) {
      return lockedOrder;
    }

    return tx.orders.update({
      where: { id: lockedOrder.id },
      data: {
        payment_status: paymentStatus,
        refund_status: localRefundStatus,
        razorpay_refund_id: refund.id,
        refunded_at:
          localRefundStatus === REFUND_STATUS.PROCESSED ? new Date() : null,
        updated_at: new Date(),
      },
    });
  });

  // 16. Final response
  return {
    order: finalOrder,
    message:
      localRefundStatus === REFUND_STATUS.PROCESSED
        ? "Refund retry processed successfully"
        : localRefundStatus === REFUND_STATUS.FAILED
          ? "Razorpay reported that the refund failed. Verify the refund before retrying again."
          : "Refund retry initiated and is pending with Razorpay",
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
    | Release reserved inventory
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
