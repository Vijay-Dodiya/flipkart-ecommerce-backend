import prisma from "../config/prisma.js";

import AppError from "../utils/AppError.js";

/**
 * --------------------------------------------------------------------------
 * Create Order Status History
 * --------------------------------------------------------------------------
 *
 * Creates an audit record whenever an order status changes.
 *
 * changedBy:
 * - User/admin ID when a human caused the change.
 * - null when the change was performed automatically by the system.
 *
 * reason:
 * - Explains why the status changed.
 *
 */

export const createOrderStatusHistory = async (
    tx,
    orderId,
    status,
    changedBy = null,
    reason = null
) => {
    return tx.order_status_history.create({
        data: {
            order_id: orderId,
            status,
            changed_by: changedBy,
            reason,
        },
    });
};

/**
 * --------------------------------------------------------------------------
 * Get My Order Status History
 * --------------------------------------------------------------------------
 */

export const getMyOrderStatusHistory = async (
    userId,
    orderId
) => {
    const order = await prisma.orders.findFirst({
        where: {
            id: orderId,
            user_id: userId,
        },
        select: {
            id: true,
        },
    });

    if (!order) {
        throw new AppError("Order not found", 404);
    }

    const history = await prisma.order_status_history.findMany({
        where: {
            order_id: orderId,
        },
        orderBy: {
            created_at: "asc",
        },
    });

    return history;
};

/**
 * --------------------------------------------------------------------------
 * Get Admin Order Status History
 * --------------------------------------------------------------------------
 */

export const getAdminOrderStatusHistory = async (
    orderId
) => {
    const order = await prisma.orders.findUnique({
        where: {
            id: orderId,
        },
        select: {
            id: true,
        },
    });

    if (!order) {
        throw new AppError("Order not found", 404);
    }

    const history = await prisma.order_status_history.findMany({
        where: {
            order_id: orderId,
        },
        orderBy: {
            created_at: "asc",
        },
    });

    return history;
};