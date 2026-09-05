import Cart from "../models/cart.model.js";
import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";

export const createOrder = async (userId) => {

    // 1. Get user's cart from MongoDB
    const cart = await Cart.findOne({
        userId,
    });

    if (!cart) {
        throw new AppError("Cart not found", 404);
    }

    if (cart.items.length === 0) {
        throw new AppError("Cart is empty", 400);
    }

    // 2. Create order inside PostgreSQL transaction
    const result = await prisma.$transaction(async (tx) => {

        let totalAmount = 0;

        const orderItemsData = [];

        // 3. Process every cart item
        for (const cartItem of cart.items) {

            const product = await tx.products.findUnique({
                where: {
                    id: cartItem.productId,
                },
                include: {
                    inventory: true,
                },
            });

            if (!product) {
                throw new AppError(
                    `Product ${cartItem.productId} not found`,
                    404
                );
            }

            if (!product.inventory) {
                throw new AppError(
                    `Inventory not found for ${product.name}`,
                    404
                );
            }

            // 4. Lock inventory row
            const inventoryRows = await tx.$queryRaw`
                SELECT id, product_id, quantity, reserved_quantity
                FROM inventory
                WHERE product_id = ${cartItem.productId}::uuid
                FOR UPDATE
            `;

            const inventory = inventoryRows[0];

            if (!inventory) {
                throw new AppError(
                    `Inventory not found for ${product.name}`,
                    404
                );
            }

            // 5. Calculate available stock
            const availableStock =
                inventory.quantity -
                inventory.reserved_quantity;

            if (cartItem.quantity > availableStock) {
                throw new AppError(
                    `Insufficient stock for ${product.name}`,
                    400
                );
            }

            // 6. Reserve inventory
            await tx.inventory.update({
                where: {
                    product_id: cartItem.productId,
                },
                data: {
                    reserved_quantity: {
                        increment: cartItem.quantity,
                    },
                },
            });

            // 7. Calculate item subtotal
            const unitPrice = Number(product.price);

            const subtotal =
                unitPrice * cartItem.quantity;

            totalAmount += subtotal;

            // 8. Store product snapshot
            orderItemsData.push({
                product_id: product.id,
                product_name: product.name,
                sku: product.sku,
                quantity: cartItem.quantity,
                unit_price: unitPrice,
                subtotal: subtotal,
            });
        }

        // 9. Create order
        const order = await tx.orders.create({
            data: {
                user_id: userId,
                status: "pending",
                payment_status: "pending",
                total_amount: totalAmount,
            },
        });

        // 10. Create order items
        await tx.order_items.createMany({
            data: orderItemsData.map((item) => ({
                order_id: order.id,
                product_id: item.product_id,
                product_name: item.product_name,
                sku: item.sku,
                quantity: item.quantity,
                unit_price: item.unit_price,
                subtotal: item.subtotal,
            })),
        });

        // 11. Get complete order
        const completeOrder = await tx.orders.findUnique({
            where: {
                id: order.id,
            },
            include: {
                order_items: true,
            },
        });

        return completeOrder;
    });

    // 12. Clear MongoDB cart
    cart.items = [];

    await cart.save();

    return result;
};


export const getMyOrders = async (userId) => {

    const orders = await prisma.orders.findMany({
        where: {
            user_id: userId,
        },
        include: {
            order_items: true,
        },
        orderBy: {
            created_at: "desc",
        },
    });

    return orders;
};


export const getOrderById = async (
    userId,
    orderId
) => {

    const order = await prisma.orders.findFirst({
        where: {
            id: orderId,
            user_id: userId,
        },
        include: {
            order_items: true,
        },
    });

    if (!order) {
        throw new AppError(
            "Order not found",
            404
        );
    }

    return order;
};

export const confirmPayment = async (userId, orderId) => {
    const result = await prisma.$transaction(async (tx) => {
        const order = await tx.orders.findFirst({
            where: {
                id: orderId,
                user_id: userId,
            },
            include: {
                order_items: true,
            },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (order.payment_status === "paid") {
            throw new AppError("Order is already paid", 400);
        }

        if (order.status === "cancelled") {
            throw new AppError("Cancelled order cannot be paid", 400);
        }

        for (const item of order.order_items) {
            await tx.inventory.update({
                where: {
                    product_id: item.product_id,
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
        }

        const updatedOrder = await tx.orders.update({
            where: {
                id: order.id,
            },
            data: {
                payment_status: "paid",
                status: "confirmed",
            },
            include: {
                order_items: true,
            },
        });

        return updatedOrder;
    });

    return result;
};

export const cancelOrder = async (userId, orderId) => {
    const result = await prisma.$transaction(async (tx) => {
        const order = await tx.orders.findFirst({
            where: {
                id: orderId,
                user_id: userId,
            },
            include: {
                order_items: true,
            },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (order.status === "cancelled") {
            throw new AppError("Order is already cancelled", 400);
        }

        if (order.payment_status === "paid") {
            throw new AppError(
                "Paid orders cannot be cancelled yet",
                400
            );
        }

        for (const item of order.order_items) {
            await tx.inventory.update({
                where: {
                    product_id: item.product_id,
                },
                data: {
                    reserved_quantity: {
                        decrement: item.quantity,
                    },
                },
            });
        }

        const updatedOrder = await tx.orders.update({
            where: {
                id: order.id,
            },
            data: {
                status: "cancelled",
            },
            include: {
                order_items: true,
            },
        });

        return updatedOrder;
    });

    return result;
};