import {
    createOrder,
    getMyOrders,
    getOrderById,
    confirmPayment,
    cancelOrder,
} from "../services/order.service.js";


export const createOrderController = async (req, res) => {

    const order = await createOrder(
        req.user.id
    );

    res.status(201).json({
        success: true,
        message: "Order created successfully",
        order,
    });
};


export const getMyOrdersController = async (req, res) => {

    const orders = await getMyOrders(
        req.user.id
    );

    res.status(200).json({
        success: true,
        message: "Orders fetched successfully",
        orders,
    });
};


export const getOrderByIdController = async (req, res) => {

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

export const confirmPaymentController = async (req, res) => {
    const { id } = req.params;

    const order = await confirmPayment(
        req.user.id,
        id
    );

    res.status(200).json({
        success: true,
        message: "Payment confirmed successfully",
        order,
    });
};

export const cancelOrderController = async (req, res) => {
    const { id } = req.params;

    const order = await cancelOrder(
        req.user.id,
        id
    );

    res.status(200).json({
        success: true,
        message: "Order cancelled successfully",
        order,
    });
};