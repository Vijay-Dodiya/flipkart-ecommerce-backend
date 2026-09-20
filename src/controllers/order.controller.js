import {
    createOrder,
    getMyOrders,
    getOrderById,
    getAllOrders,
    getAdminOrderById,
    updateOrderStatus,
    cancelOrder,
} from "../services/order.service.js";

import {
    cancelPaidOrder,
} from "../services/payment.service.js";

/**
 * |--------------------------------------------------------------------------
 * | Customer - Create Order
 * |--------------------------------------------------------------------------
 */
export const createOrderController = async (
    req,
    res
) => {
    const { addressId } = req.body;

    const order = await createOrder(
        req.user.id,
        addressId
    );

    res.status(201).json({
        success: true,
        message: "Order created successfully",
        order,
    });
};

/**
 * |--------------------------------------------------------------------------
 * | Customer - Get My Orders
 * |--------------------------------------------------------------------------
 */
export const getMyOrdersController = async (
    req,
    res
) => {
    const orders = await getMyOrders(
        req.user.id
    );

    res.status(200).json({
        success: true,
        message: "Orders fetched successfully",
        orders,
    });
};

/**
 * |--------------------------------------------------------------------------
 * | Customer - Get My Order
 * |--------------------------------------------------------------------------
 */
export const getOrderByIdController = async (
    req,
    res
) => {
    const { id } = req.params;

    const order = await getOrderById(
        req.user.id,
        id
    );

    res.status(200).json({
        success: true,
        message: "Order fetched successfully",
        order,
    });
};

/**
 * |--------------------------------------------------------------------------
 * | Customer - Cancel Order
 * |--------------------------------------------------------------------------
 *
 * Unpaid order:
 *     order.service.js
 *     → releases reserved inventory
 *
 * Paid order:
 *     payment.service.js
 *     → Razorpay refund
 *     → restores inventory
 *     → cancels order
 */
export const cancelOrderController = async (
    req,
    res
) => {
    const { id } = req.params;

    /**
     * Get the current order so we know which
     * cancellation flow should be used.
     */
    const existingOrder = await getOrderById(
        req.user.id,
        id
    );

    let order;
    let message;

    /**
     * ============================================================
     * PAID ORDER
     * ============================================================
     *
     * Paid orders require a Razorpay refund.
     */
    if (
        existingOrder.payment_status === "paid"
    ) {
        order = await cancelPaidOrder(
            req.user.id,
            id
        );

        if (
            order.refund_status === "processed"
        ) {
            message =
                "Order cancelled and refund processed successfully";
        } else if (
            order.refund_status === "pending"
        ) {
            message =
                "Order cancelled successfully. Refund has been initiated";
        } else if (
            order.refund_status === "failed"
        ) {
            message =
                "Order cancelled, but the refund failed";
        } else {
            message =
                "Order cancellation processed successfully";
        }
    }

    /**
     * ============================================================
     * UNPAID / FAILED PAYMENT ORDER
     * ============================================================
     *
     * No refund is required.
     *
     * The reserved inventory is released.
     */
    else {
        order = await cancelOrder(
            req.user.id,
            id
        );

        message =
            "Order cancelled successfully";
    }

    res.status(200).json({
        success: true,
        message,
        order,
    });
};

/**
 * |--------------------------------------------------------------------------
 * | Admin - Get All Orders
 * |--------------------------------------------------------------------------
 */
export const getAllOrdersController = async (
    req,
    res
) => {
    const orders = await getAllOrders();

    res.status(200).json({
        success: true,
        message: "All orders fetched successfully",
        orders,
    });
};

/**
 * |--------------------------------------------------------------------------
 * | Admin - Get Any Order
 * |--------------------------------------------------------------------------
 */
export const getAdminOrderByIdController = async (
    req,
    res
) => {
    const { id } = req.params;

    const order = await getAdminOrderById(
        id
    );

    res.status(200).json({
        success: true,
        message: "Order fetched successfully",
        order,
    });
};

/**
 * |--------------------------------------------------------------------------
 * | Admin - Update Order Status
 * |--------------------------------------------------------------------------
 */
export const updateOrderStatusController = async (
    req,
    res
) => {
    const { id } = req.params;
    const { status } = req.body;

    /**
     * Pass admin user ID so it can be stored
     * in order_status_history.
     */
    const order = await updateOrderStatus(
        req.user.id,
        id,
        status
    );

    res.status(200).json({
        success: true,
        message: "Order status updated successfully",
        order,
    });
};