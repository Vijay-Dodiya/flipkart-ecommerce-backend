import Cart from "../models/cart.model.js";
import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import { createOrderStatusHistory } from "./orderStatusHistory.service.js";

/**
 * ============================================================
 * Allowed Order Status Transitions
 * ============================================================
 *
 * Payment service:
 * pending → confirmed
 *
 * Admin:
 * confirmed → processing
 *
 * Shipment service:
 * processing → shipped
 * shipped → delivered
 *
 * Cancelled and delivered are terminal states.
 * ============================================================
 */

const allowedTransitions = {
    pending: [],
    confirmed: ["processing"],
    processing: [],
    shipped: [],
    delivered: [],
    cancelled: [],
};

/**
 * ============================================================
 * Create Order
 * ============================================================
 */
export const createOrder = async (
    userId,
    addressId
) => {
    /**
     * 1. Find customer's cart
     */
    const cart = await Cart.findOne({
        userId,
    });

    if (!cart) {
        throw new AppError(
            "Cart not found",
            404
        );
    }

    if (cart.items.length === 0) {
        throw new AppError(
            "Cart is empty",
            400
        );
    }

    /**
     * 2. Verify selected address belongs to customer
     */
    const selectedAddress =
        await prisma.addresses.findFirst({
            where: {
                id: addressId,
                user_id: userId,
            },
        });

    if (!selectedAddress) {
        throw new AppError(
            "Address not found or does not belong to you",
            404
        );
    }

    /**
     * 3. Create order inside transaction
     */
    const result = await prisma.$transaction(
        async (tx) => {
            let subtotal = 0;

            /**
             * These are zero for now.
             *
             * Coupons, shipping calculation and tax
             * configuration can be added later.
             */
            const discount = 0;
            const shippingFee = 0;
            const taxAmount = 0;

            const orderItemsData = [];

            /**
             * 4. Process every cart item
             */
            for (const cartItem of cart.items) {
                const product =
                    await tx.products.findUnique({
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

                /**
                 * 5. Lock inventory row
                 */
                const inventoryRows =
                    await tx.$queryRaw`
                        SELECT
                            id,
                            product_id,
                            quantity,
                            reserved_quantity
                        FROM inventory
                        WHERE product_id = ${cartItem.productId}::uuid
                        FOR UPDATE
                    `;

                const inventory =
                    inventoryRows[0];

                if (!inventory) {
                    throw new AppError(
                        `Inventory not found for ${product.name}`,
                        404
                    );
                }

                /**
                 * 6. Check available stock
                 */
                const availableStock =
                    inventory.quantity -
                    inventory.reserved_quantity;

                if (
                    cartItem.quantity >
                    availableStock
                ) {
                    throw new AppError(
                        `Insufficient stock for ${product.name}`,
                        400
                    );
                }

                /**
                 * 7. Reserve inventory
                 */
                await tx.inventory.update({
                    where: {
                        product_id:
                            cartItem.productId,
                    },
                    data: {
                        reserved_quantity: {
                            increment:
                                cartItem.quantity,
                        },
                        updated_at:
                            new Date(),
                    },
                });

                /**
                 * 8. Calculate item subtotal
                 */
                const unitPrice =
                    Number(product.price);

                const itemSubtotal =
                    unitPrice *
                    cartItem.quantity;

                subtotal += itemSubtotal;

                orderItemsData.push({
                    product_id:
                        product.id,
                    product_name:
                        product.name,
                    sku: product.sku,
                    quantity:
                        cartItem.quantity,
                    unit_price:
                        unitPrice,
                    subtotal:
                        itemSubtotal,
                });
            }

            /**
             * 9. Calculate final order total
             */
            const totalAmount =
                subtotal -
                discount +
                shippingFee +
                taxAmount;

            /**
             * 10. Create order
             */
            const order =
                await tx.orders.create({
                    data: {
                        user_id:
                            userId,
                        status:
                            "pending",
                        payment_status:
                            "pending",
                        subtotal:
                            subtotal,
                        discount:
                            discount,
                        shipping_fee:
                            shippingFee,
                        tax_amount:
                            taxAmount,
                        total_amount:
                            totalAmount,
                    },
                });

            /**
             * 11. Create initial order status history
             */
            await createOrderStatusHistory(
                tx,
                order.id,
                "pending",
                userId,
                "Order created"
            );

            /**
             * 12. Create order items
             */
            await tx.order_items.createMany({
                data:
                    orderItemsData.map(
                        (item) => ({
                            order_id:
                                order.id,
                            product_id:
                                item.product_id,
                            product_name:
                                item.product_name,
                            sku:
                                item.sku,
                            quantity:
                                item.quantity,
                            unit_price:
                                item.unit_price,
                            subtotal:
                                item.subtotal,
                        })
                    ),
            });

            /**
             * 13. Create order address snapshot
             */
            await tx.order_addresses.create({
                data: {
                    order_id:
                        order.id,
                    full_name:
                        selectedAddress.full_name,
                    phone:
                        selectedAddress.phone,
                    address_line1:
                        selectedAddress.address_line1,
                    address_line2:
                        selectedAddress.address_line2,
                    city:
                        selectedAddress.city,
                    state:
                        selectedAddress.state,
                    postal_code:
                        selectedAddress.postal_code,
                    country:
                        selectedAddress.country,
                },
            });

            /**
             * 14. Get complete order
             */
            const completeOrder =
                await tx.orders.findUnique({
                    where: {
                        id: order.id,
                    },
                    include: {
                        order_items: true,
                        order_address: true,
                    },
                });

            return completeOrder;
        }
    );

    /**
     * 15. Clear customer's cart
     */
    cart.items = [];

    await cart.save();

    return result;
};

/**
 * ============================================================
 * Customer - Get My Orders
 * ============================================================
 */
export const getMyOrders = async (
    userId
) => {
    const orders =
        await prisma.orders.findMany({
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

/**
 * ============================================================
 * Customer - Get My Order By ID
 * ============================================================
 */
export const getOrderById = async (
    userId,
    orderId
) => {
    const order =
        await prisma.orders.findFirst({
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

/**
 * ============================================================
 * Admin - Get All Orders
 * ============================================================
 */
export const getAllOrders = async () => {
    const orders =
        await prisma.orders.findMany({
            include: {
                users: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        created_at: true,
                        updated_at: true,
                    },
                },
                order_items: true,
            },
            orderBy: {
                created_at: "desc",
            },
        });

    return orders;
};

/**
 * ============================================================
 * Admin - Get Any Order By ID
 * ============================================================
 */
export const getAdminOrderById = async (
    orderId
) => {
    const order =
        await prisma.orders.findUnique({
            where: {
                id: orderId,
            },
            include: {
                users: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        created_at: true,
                        updated_at: true,
                    },
                },
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

/**
 * ============================================================
 * Admin - Update Order Status
 * ============================================================
 *
 * confirmed → processing
 *
 * Shipment service handles:
 *
 * processing → shipped
 * shipped → delivered
 * ============================================================
 */
export const updateOrderStatus = async (
    userId,
    orderId,
    newStatus
) => {
    const result =
        await prisma.$transaction(
            async (tx) => {
                /**
                 * Lock order row
                 */
                const orderRows =
                    await tx.$queryRaw`
                        SELECT
                            id,
                            user_id,
                            status,
                            payment_status
                        FROM orders
                        WHERE id = ${orderId}::uuid
                        FOR UPDATE
                    `;

                const order =
                    orderRows[0];

                if (!order) {
                    throw new AppError(
                        "Order not found",
                        404
                    );
                }

                /**
                 * Check allowed transition
                 */
                const possibleStatuses =
                    allowedTransitions[
                        order.status
                    ] || [];

                if (
                    !possibleStatuses.includes(
                        newStatus
                    )
                ) {
                    throw new AppError(
                        `Cannot change order status from ${order.status} to ${newStatus}`,
                        400
                    );
                }

                /**
                 * Payment safety check
                 */
                if (
                    newStatus ===
                        "processing" ||
                    newStatus ===
                        "shipped" ||
                    newStatus ===
                        "delivered"
                ) {
                    if (
                        order.payment_status !==
                        "paid"
                    ) {
                        throw new AppError(
                            "Cannot move an unpaid order into fulfillment",
                            400
                        );
                    }
                }

                /**
                 * Update order status
                 */
                const updatedOrder =
                    await tx.orders.update({
                        where: {
                            id: order.id,
                        },
                        data: {
                            status:
                                newStatus,
                            updated_at:
                                new Date(),
                        },
                        include: {
                            users: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                    created_at:
                                        true,
                                    updated_at:
                                        true,
                                },
                            },
                            order_items:
                                true,
                        },
                    });

                /**
                 * Create status history
                 */
                await createOrderStatusHistory(
                    tx,
                    order.id,
                    newStatus,
                    userId,
                    "Order moved to processing"
                );

                return updatedOrder;
            }
        );

    return result;
};

/**
 * ============================================================
 * Customer - Cancel Unpaid Order
 * ============================================================
 *
 * Paid orders are handled by cancelPaidOrder()
 * inside payment.service.js.
 *
 * Unpaid cancellation:
 *
 * pending / failed payment
 *          ↓
 * release reserved_quantity
 *          ↓
 * cancel order
 *          ↓
 * create history
 * ============================================================
 */
export const cancelOrder = async (
    userId,
    orderId
) => {
    return prisma.$transaction(
        async (tx) => {
            /**
             * 1. Lock order
             */
            const orderRows =
                await tx.$queryRaw`
                    SELECT
                        id,
                        user_id,
                        status,
                        payment_status
                    FROM orders
                    WHERE id = ${orderId}::uuid
                    FOR UPDATE
                `;

            const order =
                orderRows[0];

            if (!order) {
                throw new AppError(
                    "Order not found",
                    404
                );
            }

            /**
             * 2. Ownership
             */
            if (
                order.user_id !== userId
            ) {
                throw new AppError(
                    "Order not found",
                    404
                );
            }

            /**
             * 3. Already cancelled
             */
            if (
                order.status ===
                "cancelled"
            ) {
                throw new AppError(
                    "Order is already cancelled",
                    400
                );
            }

            /**
             * 4. Paid orders use refund flow
             */
            if (
                order.payment_status ===
                "paid"
            ) {
                throw new AppError(
                    "Paid orders require the refund flow",
                    400
                );
            }

            /**
             * 5. Only pending unpaid orders
             * can be cancelled.
             *
             * Failed payment orders are also still
             * pending from an order-lifecycle perspective,
             * so they can be cancelled.
             */
            if (
                order.status !==
                "pending"
            ) {
                throw new AppError(
                    "Only pending unpaid orders can be cancelled",
                    400
                );
            }

            /**
             * 6. Get order items
             */
            const orderItems =
                await tx.order_items.findMany({
                    where: {
                        order_id:
                            order.id,
                    },
                });

            if (
                !orderItems.length
            ) {
                throw new AppError(
                    "Order has no items",
                    400
                );
            }

            /**
             * 7. Release reserved inventory
             *
             * IMPORTANT:
             *
             * The payment has NOT been finalized,
             * therefore quantity remains unchanged.
             *
             * We only reduce reserved_quantity.
             */
            for (
                const item of orderItems
            ) {
                const inventoryUpdate =
                    await tx.inventory.updateMany(
                        {
                            where: {
                                product_id:
                                    item.product_id,
                                reserved_quantity:
                                    {
                                        gte: item.quantity,
                                    },
                            },
                            data: {
                                reserved_quantity:
                                    {
                                        decrement:
                                            item.quantity,
                                    },
                                updated_at:
                                    new Date(),
                            },
                        }
                    );

                if (
                    inventoryUpdate.count !==
                    1
                ) {
                    throw new AppError(
                        `Unable to release inventory for product ${item.product_id}`,
                        409
                    );
                }
            }

            /**
             * 8. Cancel order
             */
            const cancelledOrder =
                await tx.orders.update({
                    where: {
                        id: order.id,
                    },
                    data: {
                        status:
                            "cancelled",
                        cancelled_at:
                            new Date(),
                        updated_at:
                            new Date(),
                    },
                    include: {
                        order_items:
                            true,
                        order_address:
                            true,
                    },
                });

            /**
             * 9. Create history
             */
            await createOrderStatusHistory(
                tx,
                order.id,
                "cancelled",
                userId,
                "Customer cancelled the unpaid order"
            );

            return cancelledOrder;
        }
    );
};