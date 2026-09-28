import prisma from "../config/prisma.js";
import razorpay from "../config/razorpay.js";
import AppError from "../utils/AppError.js";

import { requestRazorpayRefund } from "./payment.service.js";

// ============================================================
// CONFIGURATION
// ============================================================

const RETURN_WINDOW_DAYS = 7;

const RETURN_STATUS = {
  REQUESTED: "requested",
  APPROVED: "approved",
  REJECTED: "rejected",
  RECEIVED: "received",
  REFUNDED: "refunded",
  CANCELLED: "cancelled",
};

// ============================================================
// HELPERS
// ============================================================

const calculateReturnDeadline = (deliveredAt) => {
  const deadline = new Date(deliveredAt);

  deadline.setDate(deadline.getDate() + RETURN_WINDOW_DAYS);

  return deadline;
};

const getReturnOrThrow = async (returnId, db = prisma) => {
  const returnRecord = await db.returns.findUnique({
    where: {
      id: returnId,
    },
    include: {
      orders: true,
      return_items: {
        include: {
          order_items: true,
        },
      },
    },
  });

  if (!returnRecord) {
    throw new AppError("Return request not found", 404);
  }

  return returnRecord;
};

// ============================================================
// CUSTOMER
// CREATE RETURN REQUEST
// ============================================================

export const createReturnRequest = async (userId, data) => {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // ------------------------------------------------
          // 1. Find order
          // ------------------------------------------------

          const order = await tx.orders.findFirst({
            where: {
              id: data.orderId,
              user_id: userId,
            },
            include: {
              order_items: true,
            },
          });

          if (!order) {
            throw new AppError("Order not found", 404);
          }

          // ------------------------------------------------
          // 2. Order must be delivered
          // ------------------------------------------------

          if (order.status !== "delivered") {
            throw new AppError("Only delivered orders can be returned", 400);
          }

          if (!order.delivered_at) {
            throw new AppError("Order delivery date is missing", 400);
          }

          // ------------------------------------------------
          // 3. Check return window
          // ------------------------------------------------

          const deadline = calculateReturnDeadline(order.delivered_at);

          if (new Date() > deadline) {
            throw new AppError(
              `Return window has expired. Returns are allowed within ${RETURN_WINDOW_DAYS} days of delivery.`,
              400,
            );
          }

          // ------------------------------------------------
          // 4. Order must be paid
          // ------------------------------------------------

          if (order.payment_status !== "paid") {
            throw new AppError("Only paid orders can be returned", 400);
          }

          // ------------------------------------------------
          // 5. Validate requested items
          // ------------------------------------------------

          const orderItemMap = new Map(
            order.order_items.map((item) => [item.id, item]),
          );

          const requestedItemIds = new Set();

          for (const requestedItem of data.items) {
            if (requestedItemIds.has(requestedItem.orderItemId)) {
              throw new AppError("Duplicate order item in return request", 400);
            }

            requestedItemIds.add(requestedItem.orderItemId);

            const orderItem = orderItemMap.get(requestedItem.orderItemId);

            if (!orderItem) {
              throw new AppError(
                "One or more order items do not belong to this order",
                400,
              );
            }

            if (requestedItem.quantity > orderItem.quantity) {
              throw new AppError(
                `Return quantity cannot exceed purchased quantity for ${orderItem.product_name}`,
                400,
              );
            }
          }

          // ------------------------------------------------
          // 6. Find already returned quantities
          // ------------------------------------------------

          const existingReturnItems = await tx.return_items.findMany({
            where: {
              order_items: {
                order_id: order.id,
              },
            },
          });

          const returnedQuantityMap = new Map();

          for (const item of existingReturnItems) {
            const current = returnedQuantityMap.get(item.order_item_id) || 0;

            returnedQuantityMap.set(
              item.order_item_id,
              current + item.quantity,
            );
          }

          // ------------------------------------------------
          // 7. Validate remaining quantity
          // ------------------------------------------------

          for (const requestedItem of data.items) {
            const orderItem = orderItemMap.get(requestedItem.orderItemId);

            const alreadyReturned =
              returnedQuantityMap.get(requestedItem.orderItemId) || 0;

            const remainingQuantity = orderItem.quantity - alreadyReturned;

            if (requestedItem.quantity > remainingQuantity) {
              throw new AppError(
                `Only ${remainingQuantity} unit(s) remain eligible for return for ${orderItem.product_name}`,
                400,
              );
            }
          }

          // ------------------------------------------------
          // 8. Calculate refund
          // ------------------------------------------------

          let refundAmount = 0;

          for (const requestedItem of data.items) {
            const orderItem = orderItemMap.get(requestedItem.orderItemId);

            refundAmount +=
              Number(orderItem.unit_price) * requestedItem.quantity;
          }

          refundAmount = Number(refundAmount.toFixed(2));

          // ------------------------------------------------
          // 9. Create return
          // ------------------------------------------------

          const returnRecord = await tx.returns.create({
            data: {
              order_id: order.id,
              user_id: userId,
              status: RETURN_STATUS.REQUESTED,
              reason: data.reason,
              customer_note: data.customerNote ?? null,
              refund_amount: refundAmount,

              return_items: {
                create: data.items.map((item) => {
                  const orderItem = orderItemMap.get(item.orderItemId);

                  return {
                    order_item_id: orderItem.id,

                    quantity: item.quantity,

                    unit_price: orderItem.unit_price,

                    refund_amount: Number(
                      (Number(orderItem.unit_price) * item.quantity).toFixed(2),
                    ),
                  };
                }),
              },
            },

            include: {
              return_items: true,
            },
          });

          return returnRecord;
        },
        {
          isolationLevel: "Serializable",
        },
      );
    } catch (error) {
      // Retry transaction if PostgreSQL/Prisma
      // reports a serialization conflict.

      if (error?.code === "P2034" && attempt < MAX_RETRIES) {
        continue;
      }

      throw error;
    }
  }
};

// ============================================================
// CUSTOMER
// GET MY RETURNS
// ============================================================

export const getMyReturns = async (userId) => {
  return prisma.returns.findMany({
    where: {
      user_id: userId,
    },

    include: {
      return_items: {
        include: {
          order_items: true,
        },
      },
    },

    orderBy: {
      created_at: "desc",
    },
  });
};

// ============================================================
// CUSTOMER
// GET SINGLE RETURN
// ============================================================

export const getMyReturnById = async (userId, returnId) => {
  const returnRecord = await prisma.returns.findFirst({
    where: {
      id: returnId,
      user_id: userId,
    },

    include: {
      orders: true,

      return_items: {
        include: {
          order_items: true,
        },
      },
    },
  });

  if (!returnRecord) {
    throw new AppError("Return request not found", 404);
  }

  return returnRecord;
};

// ============================================================
// CUSTOMER
// CANCEL RETURN REQUEST
// ============================================================

export const cancelReturnRequest = async (userId, returnId) => {
  const returnRecord = await prisma.returns.findFirst({
    where: {
      id: returnId,
      user_id: userId,
    },
  });

  if (!returnRecord) {
    throw new AppError("Return request not found", 404);
  }

  if (returnRecord.status !== RETURN_STATUS.REQUESTED) {
    throw new AppError("Only requested returns can be cancelled", 400);
  }

  return prisma.returns.update({
    where: {
      id: returnId,
    },

    data: {
      status: RETURN_STATUS.CANCELLED,

      cancelled_at: new Date(),

      updated_at: new Date(),
    },
  });
};

// ============================================================
// ADMIN
// GET ALL RETURNS
// ============================================================

export const getAllReturns = async () => {
  return prisma.returns.findMany({
    include: {
      orders: {
        include: {
          users: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },

      return_items: {
        include: {
          order_items: true,
        },
      },
    },

    orderBy: {
      created_at: "desc",
    },
  });
};

// ============================================================
// ADMIN
// GET RETURN
// ============================================================

export const getReturnById = async (returnId) => {
  return getReturnOrThrow(returnId);
};

// ============================================================
// ADMIN
// APPROVE RETURN
// ============================================================

export const approveReturn = async (adminId, returnId, adminNote) => {
  const returnRecord = await getReturnOrThrow(returnId);

  if (returnRecord.status !== RETURN_STATUS.REQUESTED) {
    throw new AppError("Only requested returns can be approved", 400);
  }

  return prisma.returns.update({
    where: {
      id: returnId,
    },

    data: {
      status: RETURN_STATUS.APPROVED,

      admin_note: adminNote ?? null,

      approved_by: adminId,

      approved_at: new Date(),

      updated_at: new Date(),
    },
  });
};

// ============================================================
// ADMIN
// REJECT RETURN
// ============================================================

export const rejectReturn = async (adminId, returnId, adminNote) => {
  const returnRecord = await getReturnOrThrow(returnId);

  if (returnRecord.status !== RETURN_STATUS.REQUESTED) {
    throw new AppError("Only requested returns can be rejected", 400);
  }

  if (!adminNote) {
    throw new AppError("Admin note is required when rejecting a return", 400);
  }

  return prisma.returns.update({
    where: {
      id: returnId,
    },

    data: {
      status: RETURN_STATUS.REJECTED,

      admin_note: adminNote,

      rejected_by: adminId,

      rejected_at: new Date(),

      updated_at: new Date(),
    },
  });
};

// ============================================================
// ADMIN
// MARK RETURN AS RECEIVED
// ============================================================

export const markReturnReceived = async (adminId, returnId, adminNote) => {
  const returnRecord = await getReturnOrThrow(returnId);

  if (returnRecord.status !== RETURN_STATUS.APPROVED) {
    throw new AppError("Only approved returns can be marked as received", 400);
  }

  return prisma.$transaction(async (tx) => {
    const currentReturn = await tx.returns.findUnique({
      where: {
        id: returnId,
      },

      include: {
        return_items: {
          include: {
            order_items: true,
          },
        },
      },
    });

    if (!currentReturn) {
      throw new AppError("Return request not found", 404);
    }

    if (currentReturn.status !== RETURN_STATUS.APPROVED) {
      throw new AppError("Return is no longer awaiting receipt", 409);
    }

    // --------------------------------------------
    // Restore inventory
    // --------------------------------------------

    for (const returnItem of currentReturn.return_items) {
      const orderItem = returnItem.order_items;

      // --------------------------------------------
      // Variant inventory
      // --------------------------------------------

      if (orderItem.variant_id) {
        const inventoryUpdate = await tx.variant_inventory.updateMany({
          where: {
            variant_id: orderItem.variant_id,
          },

          data: {
            quantity: {
              increment: returnItem.quantity,
            },

            updated_at: new Date(),
          },
        });

        if (inventoryUpdate.count !== 1) {
          throw new AppError(
            `Variant inventory not found for ${orderItem.variant_id}`,
            409,
          );
        }
      }

      // --------------------------------------------
      // Normal product inventory
      // --------------------------------------------
      else {
        const inventoryUpdate = await tx.inventory.updateMany({
          where: {
            product_id: orderItem.product_id,
          },

          data: {
            quantity: {
              increment: returnItem.quantity,
            },

            updated_at: new Date(),
          },
        });

        if (inventoryUpdate.count !== 1) {
          throw new AppError(
            `Inventory not found for ${orderItem.product_id}`,
            409,
          );
        }
      }
    }

    // --------------------------------------------
    // Mark return as received
    // --------------------------------------------

    return tx.returns.update({
      where: {
        id: returnId,
      },

      data: {
        status: RETURN_STATUS.RECEIVED,

        admin_note: adminNote ?? undefined,

        received_by: adminId,

        received_at: new Date(),

        updated_at: new Date(),
      },
    });
  });
};

// ============================================================
// ADMIN
// PROCESS REFUND
// ============================================================

export const processReturnRefund = async (
    returnId
) => {
    // ========================================================
    // STEP 1 — Atomically claim the refund
    // ========================================================

    const claimResult =
        await prisma.returns.updateMany({
            where: {
                id: returnId,
                status: RETURN_STATUS.RECEIVED,
                razorpay_refund_id: null,
            },
            data: {
                razorpay_refund_id: `PENDING-${returnId}`,
                updated_at: new Date(),
            },
        });

    if (claimResult.count !== 1) {
        const currentReturn =
            await getReturnOrThrow(returnId);

        if (
            currentReturn.status ===
            RETURN_STATUS.REFUNDED
        ) {
            throw new AppError(
                "This return has already been refunded",
                409
            );
        }

        if (
            currentReturn.razorpay_refund_id
        ) {
            throw new AppError(
                "A refund is already being processed for this return",
                409
            );
        }

        throw new AppError(
            "Return is not eligible for refund",
            400
        );
    }

    // ========================================================
    // STEP 2 — Load the return after claiming it
    // ========================================================

    let returnRecord;

    try {
        returnRecord =
            await getReturnOrThrow(returnId);
    } catch (error) {
        // Release claim if something went wrong
        await prisma.returns.updateMany({
            where: {
                id: returnId,
                razorpay_refund_id: `PENDING-${returnId}`,
            },
            data: {
                razorpay_refund_id: null,
                updated_at: new Date(),
            },
        });

        throw error;
    }

    const order =
        returnRecord.orders;

    // ========================================================
    // STEP 3 — Validate payment
    // ========================================================

    if (
        order.payment_status !==
        "paid"
    ) {
        await prisma.returns.updateMany({
            where: {
                id: returnId,
                razorpay_refund_id:
                    `PENDING-${returnId}`,
            },
            data: {
                razorpay_refund_id: null,
                updated_at: new Date(),
            },
        });

        throw new AppError(
            "Order payment is not eligible for refund",
            400
        );
    }

    if (!order.razorpay_payment_id) {
        await prisma.returns.updateMany({
            where: {
                id: returnId,
                razorpay_refund_id:
                    `PENDING-${returnId}`,
            },
            data: {
                razorpay_refund_id: null,
                updated_at: new Date(),
            },
        });

        throw new AppError(
            "Razorpay payment ID is missing",
            500
        );
    }

    // ========================================================
    // STEP 4 — Validate refund amount
    // ========================================================

    const refundAmount =
        Number(
            returnRecord.refund_amount
        );

    if (
        !Number.isFinite(
            refundAmount
        ) ||
        refundAmount <= 0
    ) {
        await prisma.returns.updateMany({
            where: {
                id: returnId,
                razorpay_refund_id:
                    `PENDING-${returnId}`,
            },
            data: {
                razorpay_refund_id: null,
                updated_at: new Date(),
            },
        });

        throw new AppError(
            "Invalid return refund amount",
            400
        );
    }

    const amountInPaise =
        Math.round(
            refundAmount * 100
        );

    // ========================================================
    // STEP 5 — Verify payment directly with Razorpay
    // ========================================================

    let payment;

    try {
        payment =
            await razorpay.payments.fetch(
                order.razorpay_payment_id
            );
    } catch (error) {
        console.error(
            "Razorpay payment fetch failed:",
            error?.error || error
        );

        await prisma.returns.updateMany({
            where: {
                id: returnId,
                razorpay_refund_id:
                    `PENDING-${returnId}`,
            },
            data: {
                razorpay_refund_id: null,
                updated_at: new Date(),
            },
        });

        throw new AppError(
            "Unable to verify payment with Razorpay",
            502
        );
    }

    // ========================================================
    // STEP 6 — Payment must be captured/refunded
    // ========================================================

    if (
        payment.status !== "captured"
        // &&ṭ
        // payment.status !== "refunded"
    ) {
        await prisma.returns.updateMany({
            where: {
                id: returnId,
                razorpay_refund_id:
                    `PENDING-${returnId}`,
            },
            data: {
                razorpay_refund_id: null,
                updated_at: new Date(),
            },
        });

        throw new AppError(
            `Payment cannot be refunded. Current status: ${payment.status}`,
            400
        );
    }

    // ========================================================
    // STEP 7 — Check remaining refundable amount
    // ========================================================

    const alreadyRefundedAmount =
        Number(
            payment.amount_refunded || 0
        );

    const remainingRefundableAmount =
        Number(payment.amount) -
        alreadyRefundedAmount;

    if (
        amountInPaise >
        remainingRefundableAmount
    ) {
        await prisma.returns.updateMany({
            where: {
                id: returnId,
                razorpay_refund_id:
                    `PENDING-${returnId}`,
            },
            data: {
                razorpay_refund_id: null,
                updated_at: new Date(),
            },
        });

        throw new AppError(
            "Return refund amount exceeds the remaining refundable amount",
            400
        );
    }

    // ========================================================
    // STEP 8 — Request Razorpay refund
    // ========================================================

    let refund;

    try {
        refund =
            await requestRazorpayRefund(
                order.razorpay_payment_id,
                amountInPaise,
                order.id,
                `Return refund for ${returnId}`,
                {
                    return_id: returnId,
                }
            );
    } catch (error) {
        // We only clear the claim when Razorpay explicitly
        // reports that the refund request failed.
        await prisma.returns.updateMany({
            where: {
                id: returnId,
                razorpay_refund_id:
                    `PENDING-${returnId}`,
            },
            data: {
                razorpay_refund_id: null,
                updated_at: new Date(),
            },
        });

        throw error;
    }

    // ========================================================
    // STEP 9 — Save the real Razorpay refund ID
    // ========================================================

    const immediateRefundProcessed =
        refund.status === "processed";

    const updatedReturn =
        await prisma.returns.update({
            where: {
                id: returnId,
            },
            data: {
                razorpay_refund_id:
                    refund.id,

                status:
                    immediateRefundProcessed
                        ? RETURN_STATUS.REFUNDED
                        : RETURN_STATUS.RECEIVED,

                refunded_at:
                    immediateRefundProcessed
                        ? new Date()
                        : null,

                updated_at: new Date(),
            },

            include: {
                return_items: true,
            },
        });

    return {
        success: true,

        message:
            immediateRefundProcessed
                ? "Return refund was successfully processed."
                : "Return refund was initiated and is pending.",

        return: updatedReturn,

        refundId:
            refund.id,

        refundStatus:
            refund.status,
    };
};
