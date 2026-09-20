import {
    getMyOrderStatusHistory,
    getAdminOrderStatusHistory,
} from "../services/orderStatusHistory.service.js";


/*
 * Customer:
 * Get status history for their own order.
 */
export const getMyOrderStatusHistoryController = async (
    req,
    res
) => {
    const { orderId } = req.params;

    const history = await getMyOrderStatusHistory(
        req.user.id,
        orderId
    );

    res.status(200).json({
        success: true,
        message: "Order status history fetched successfully",
        history,
    });
};


/*
 * Admin:
 * Get status history for any order.
 */
export const getAdminOrderStatusHistoryController = async (
    req,
    res
) => {
    const { orderId } = req.params;

    const history = await getAdminOrderStatusHistory(
        orderId
    );

    res.status(200).json({
        success: true,
        message: "Order status history fetched successfully",
        history,
    });
};