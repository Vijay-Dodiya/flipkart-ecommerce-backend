import Cart from "../models/cart.model.js";

import prisma from "../config/prisma.js";

import AppError from "../utils/AppError.js";

import { createOrderStatusHistory } from "./orderStatusHistory.service.js";

import {
    validateCoupon,
    recordCouponUsage,
} from "./coupon.service.js";


/**
 * ============================================================
 * ORDER STATUS TRANSITIONS
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
 * Cancellation and delivery are terminal states.
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
 * CONSTANTS
 * ============================================================
 */

const MAX_TRANSACTION_RETRIES = 3;


/**
 * ============================================================
 * HELPERS
 * ============================================================
 */


/**
 * Normalize MongoDB cart variant IDs.
 *
 * undefined and null both mean:
 * "this is a normal product without a variant".
 */
const normalizeVariantId = (variantId) => {
    return variantId ?? null;
};


/**
 * Check whether an error is a Prisma
 * serialization / transaction conflict.
 *
 * P2034:
 * Transaction failed due to a write conflict
 * or deadlock.
 */
const isTransactionConflict = (error) => {
    return error?.code === "P2034";
};


/**
 * Small delay before retrying a transaction.
 */
const wait = (ms) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });


/**
 * ============================================================
 * CREATE ORDER
 * ============================================================
 *
 * Flow:
 *
 * Cart
 *   ↓
 * Validate address
 *   ↓
 * Validate product / variant
 *   ↓
 * Lock inventory row
 *   ↓
 * Validate available stock
 *   ↓
 * Reserve inventory
 *   ↓
 * Validate coupon
 *   ↓
 * Create order
 *   ↓
 * Create order items
 *   ↓
 * Create address snapshot
 *   ↓
 * Record coupon usage
 *   ↓
 * Commit transaction
 *   ↓
 * Remove only the cart items that were checked out
 *
 * IMPORTANT:
 *
 * Inventory reservation happens inside PostgreSQL
 * transaction with row locking.
 *
 * MongoDB cart is intentionally not modified until
 * the PostgreSQL transaction succeeds.
 * ============================================================
 */

export const createOrder = async (
    userId,
    addressId,
    couponCode = null
) => {

    /**
     * ---------------------------------------------------------
     * 1. Read cart snapshot
     * ---------------------------------------------------------
     *
     * We intentionally take a snapshot before entering
     * PostgreSQL transaction.
     *
     * The cart itself is stored in MongoDB, while inventory
     * and orders are stored in PostgreSQL.
     */

    const cart = await Cart.findOne({
        userId,
    }).lean();


    if (!cart || !cart.items?.length) {
        throw new AppError(
            "Cart is empty",
            400
        );
    }


    /**
     * ---------------------------------------------------------
     * 2. Validate address
     * ---------------------------------------------------------
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
            "Address not found or does not belong to the user",
            404
        );
    }


    /**
     * ---------------------------------------------------------
     * 3. Execute transaction with retry
     * ---------------------------------------------------------
     */

    let result;
    let lastError;


    for (
        let attempt = 1;
        attempt <= MAX_TRANSACTION_RETRIES;
        attempt++
    ) {

        try {

            result =
                await prisma.$transaction(
                    async (tx) => {

                        let subtotal = 0;

                        let discount = 0;

                        const shippingFee = 0;

                        const taxAmount = 0;

                        const orderItemsData = [];


                        /**
                         * =================================================
                         * PROCESS EACH CART ITEM
                         * =================================================
                         */

                        for (
                            const cartItem of cart.items
                        ) {

                            const normalizedVariantId =
                                normalizeVariantId(
                                    cartItem.variantId
                                );


                            /**
                             * -------------------------------------------------
                             * Validate cart quantity
                             * -------------------------------------------------
                             */

                            if (
                                !Number.isInteger(
                                    cartItem.quantity
                                ) ||
                                cartItem.quantity < 1
                            ) {
                                throw new AppError(
                                    `Invalid quantity for product ${cartItem.productId}`,
                                    400
                                );
                            }


                            /**
                             * -------------------------------------------------
                             * Find product
                             * -------------------------------------------------
                             */

                            const product =
                                await tx.products.findUnique({
                                    where: {
                                        id: cartItem.productId,
                                    },
                                });


                            if (!product) {
                                throw new AppError(
                                    `Product ${cartItem.productId} not found`,
                                    404
                                );
                            }


                            let unitPrice;

                            let sku;

                            let variantName = null;


                            /**
                             * =================================================
                             * VARIANT PRODUCT
                             * =================================================
                             */

                            if (normalizedVariantId) {

                                const variant =
                                    await tx.product_variants.findUnique({
                                        where: {
                                            id: normalizedVariantId,
                                        },
                                    });


                                if (!variant) {
                                    throw new AppError(
                                        `Product variant ${normalizedVariantId} not found`,
                                        404
                                    );
                                }


                                /**
                                 * Variant must belong to
                                 * cart item's product.
                                 */

                                if (
                                    variant.product_id !==
                                    product.id
                                ) {
                                    throw new AppError(
                                        `Variant ${variant.id} does not belong to product ${product.name}`,
                                        400
                                    );
                                }


                                /**
                                 * Variant must be active.
                                 */

                                if (!variant.is_active) {
                                    throw new AppError(
                                        `Product variant ${variant.name} is not available`,
                                        400
                                    );
                                }


                                /**
                                 * -------------------------------------------------
                                 * Lock variant inventory row
                                 * -------------------------------------------------
                                 *
                                 * FOR UPDATE prevents two checkout
                                 * transactions from reserving the same
                                 * inventory simultaneously.
                                 */

                                const inventoryRows =
                                    await tx.$queryRaw`
                                        SELECT
                                            id,
                                            variant_id,
                                            quantity,
                                            reserved_quantity
                                        FROM variant_inventory
                                        WHERE variant_id = ${normalizedVariantId}::uuid
                                        FOR UPDATE
                                    `;


                                if (
                                    !inventoryRows.length
                                ) {
                                    throw new AppError(
                                        `Inventory not found for variant ${variant.name}`,
                                        400
                                    );
                                }


                                const inventory =
                                    inventoryRows[0];


                                const inventoryQuantity =
                                    Number(
                                        inventory.quantity
                                    );


                                const inventoryReserved =
                                    Number(
                                        inventory.reserved_quantity
                                    );


                                const availableStock =
                                    inventoryQuantity -
                                    inventoryReserved;


                                /**
                                 * -------------------------------------------------
                                 * Check available stock
                                 * -------------------------------------------------
                                 */

                                if (
                                    availableStock <
                                    cartItem.quantity
                                ) {
                                    throw new AppError(
                                        `Insufficient stock for variant ${variant.name}. Only ${availableStock} units are available.`,
                                        400
                                    );
                                }


                                /**
                                 * -------------------------------------------------
                                 * Reserve variant inventory
                                 * -------------------------------------------------
                                 */

                                const reservationResult =
                                    await tx.variant_inventory.updateMany({
                                        where: {
                                            variant_id:
                                                normalizedVariantId,

                                            reserved_quantity: {
                                                lte:
                                                    inventoryQuantity -
                                                    cartItem.quantity,
                                            },
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


                                if (
                                    reservationResult.count !==
                                    1
                                ) {
                                    throw new AppError(
                                        `Unable to reserve inventory for variant ${variant.name}`,
                                        409
                                    );
                                }


                                /**
                                 * -------------------------------------------------
                                 * Variant price
                                 * -------------------------------------------------
                                 *
                                 * Variant price overrides product price
                                 * when present.
                                 */

                                unitPrice =
                                    variant.price !== null
                                        ? Number(
                                            variant.price
                                        )
                                        : Number(
                                            product.price
                                        );


                                sku =
                                    variant.sku;


                                variantName =
                                    variant.name;

                            }


                            /**
                             * =================================================
                             * NORMAL PRODUCT
                             * =================================================
                             */

                            else {

                                /**
                                 * -------------------------------------------------
                                 * Check whether this product actually has variants
                                 * -------------------------------------------------
                                 *
                                 * If variants exist, the cart must specify
                                 * which variant the customer selected.
                                 */

                                const variantCount =
                                    await tx.product_variants.count({
                                        where: {
                                            product_id:
                                                product.id,
                                        },
                                    });


                                if (
                                    variantCount > 0
                                ) {
                                    throw new AppError(
                                        `Variant selection is required for product ${product.name}`,
                                        400
                                    );
                                }


                                /**
                                 * -------------------------------------------------
                                 * Lock product inventory row
                                 * -------------------------------------------------
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


                                if (
                                    !inventoryRows.length
                                ) {
                                    throw new AppError(
                                        `Inventory not found for product ${product.name}`,
                                        400
                                    );
                                }


                                const inventory =
                                    inventoryRows[0];


                                const inventoryQuantity =
                                    Number(
                                        inventory.quantity
                                    );


                                const inventoryReserved =
                                    Number(
                                        inventory.reserved_quantity
                                    );


                                const availableStock =
                                    inventoryQuantity -
                                    inventoryReserved;


                                /**
                                 * -------------------------------------------------
                                 * Check available stock
                                 * -------------------------------------------------
                                 */

                                if (
                                    availableStock <
                                    cartItem.quantity
                                ) {
                                    throw new AppError(
                                        `Insufficient stock for product ${product.name}. Only ${availableStock} units are available.`,
                                        400
                                    );
                                }


                                /**
                                 * -------------------------------------------------
                                 * Reserve product inventory
                                 * -------------------------------------------------
                                 */

                                const reservationResult =
                                    await tx.inventory.updateMany({
                                        where: {
                                            product_id:
                                                cartItem.productId,

                                            reserved_quantity: {
                                                lte:
                                                    inventoryQuantity -
                                                    cartItem.quantity,
                                            },
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


                                if (
                                    reservationResult.count !==
                                    1
                                ) {
                                    throw new AppError(
                                        `Unable to reserve inventory for product ${product.name}`,
                                        409
                                    );
                                }


                                unitPrice =
                                    Number(
                                        product.price
                                    );


                                sku =
                                    product.sku;
                            }


                            /**
                             * -------------------------------------------------
                             * Calculate item subtotal
                             * -------------------------------------------------
                             */

                            const itemSubtotal =
                                Number(
                                    (
                                        unitPrice *
                                        cartItem.quantity
                                    ).toFixed(2)
                                );


                            subtotal +=
                                itemSubtotal;


                            /**
                             * -------------------------------------------------
                             * Prepare order item
                             * -------------------------------------------------
                             *
                             * This creates a price/name/SKU snapshot.
                             *
                             * Future product or variant changes will
                             * therefore not change historical orders.
                             */

                            orderItemsData.push({
                                product_id:
                                    product.id,

                                variant_id:
                                    normalizedVariantId,

                                product_name:
                                    product.name,

                                variant_name:
                                    variantName,

                                sku,

                                quantity:
                                    cartItem.quantity,

                                unit_price:
                                    unitPrice,

                                subtotal:
                                    itemSubtotal,
                            });
                        }


                        /**
                         * =================================================
                         * CALCULATE COUPON
                         * =================================================
                         */

                        let appliedCoupon = null;


                        if (couponCode) {

                            const couponResult =
                                await validateCoupon(
                                    userId,
                                    couponCode,
                                    subtotal,
                                    tx
                                );


                            appliedCoupon =
                                couponResult.coupon;


                            discount =
                                couponResult.discountAmount;
                        }


                        /**
                         * =================================================
                         * FINAL ORDER TOTAL
                         * =================================================
                         */

                        const totalAmount =
                            Number(
                                (
                                    subtotal -
                                    discount +
                                    shippingFee +
                                    taxAmount
                                ).toFixed(2)
                            );


                        /**
                         * Prevent impossible negative totals.
                         */

                        if (
                            totalAmount < 0
                        ) {
                            throw new AppError(
                                "Order total cannot be negative",
                                400
                            );
                        }


                        /**
                         * =================================================
                         * CREATE ORDER
                         * =================================================
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

                                    subtotal,

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
                         * =================================================
                         * INITIAL STATUS HISTORY
                         * =================================================
                         */

                        await createOrderStatusHistory(
                            tx,
                            order.id,
                            "pending",
                            userId,
                            "Order created"
                        );


                        /**
                         * =================================================
                         * CREATE ORDER ITEMS
                         * =================================================
                         */

                        await tx.order_items.createMany({
                            data:
                                orderItemsData.map(
                                    (item) => ({
                                        order_id:
                                            order.id,

                                        product_id:
                                            item.product_id,

                                        variant_id:
                                            item.variant_id,

                                        product_name:
                                            item.product_name,

                                        variant_name:
                                            item.variant_name,

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
                         * =================================================
                         * CREATE ADDRESS SNAPSHOT
                         * =================================================
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
                         * =================================================
                         * RECORD COUPON USAGE
                         * =================================================
                         */

                        if (appliedCoupon) {

                            await recordCouponUsage(
                                tx,
                                {
                                    couponId:
                                        appliedCoupon.id,

                                    userId,

                                    orderId:
                                        order.id,

                                    discountAmount:
                                        discount,
                                }
                            );
                        }


                        /**
                         * =================================================
                         * RETURN COMPLETE ORDER
                         * =================================================
                         */

                        return tx.orders.findUnique({
                            where: {
                                id:
                                    order.id,
                            },

                            include: {
                                order_items:
                                    true,

                                order_address:
                                    true,

                                coupon_usages:
                                    true,
                            },
                        });
                    },

                    {
                        isolationLevel:
                            "Serializable",
                    }
                );


            /**
             * ---------------------------------------------------------
             * Transaction succeeded
             * ---------------------------------------------------------
             */

            break;

        } catch (error) {

            lastError =
                error;


            /**
             * Retry only database serialization/deadlock
             * conflicts.
             */

            if (
                !isTransactionConflict(error) ||
                attempt ===
                    MAX_TRANSACTION_RETRIES
            ) {
                throw error;
            }


            await wait(
                50 * attempt
            );
        }
    }


    /**
     * ---------------------------------------------------------
     * Safety check
     * ---------------------------------------------------------
     */

    if (!result) {
        throw (
            lastError ||
            new AppError(
                "Unable to create order",
                500
            )
        );
    }


    /**
     * =========================================================
     * REMOVE ONLY CHECKED-OUT CART ITEMS
     * =========================================================
     *
     * IMPORTANT:
     *
     * We do NOT do:
     *
     * cart.items = [];
     *
     * because the customer may have modified the cart while
     * checkout was running.
     *
     * Instead, remove only an item whose product, variant AND
     * quantity still match the checkout snapshot.
     *
     * If the customer changed that cart item meanwhile, it is
     * preserved.
     * =========================================================
     */

    const cartPullConditions =
        cart.items.map(
            (item) => ({
                productId:
                    item.productId,

                variantId:
                    normalizeVariantId(
                        item.variantId
                    ),

                quantity:
                    item.quantity,
            })
        );


    if (
        cartPullConditions.length
    ) {

        await Cart.updateOne(
            {
                userId,
            },

            {
                $pull: {
                    items: {
                        $or:
                            cartPullConditions,
                    },
                },
            }
        );
    }


    return result;
};


/**
 * ============================================================
 * CUSTOMER - GET MY ORDERS
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
 * CUSTOMER - GET MY ORDER BY ID
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
 * ADMIN - GET ALL ORDERS
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

                order_items:
                    true,
            },

            orderBy: {
                created_at: "desc",
            },
        });


    return orders;
};


/**
 * ============================================================
 * ADMIN - GET ORDER BY ID
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

                order_items:
                    true,
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
 * ADMIN - UPDATE ORDER STATUS
 * ============================================================
 *
 * confirmed → processing
 *
 * Shipment service:
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
                 * -------------------------------------------------
                 * Lock order row
                 * -------------------------------------------------
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
                 * -------------------------------------------------
                 * Check transition
                 * -------------------------------------------------
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
                 * -------------------------------------------------
                 * Payment safety check
                 * -------------------------------------------------
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
                 * -------------------------------------------------
                 * Update status
                 * -------------------------------------------------
                 */

                const updatedOrder =
                    await tx.orders.update({

                        where: {
                            id:
                                order.id,
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
                                    created_at: true,
                                    updated_at: true,
                                },
                            },

                            order_items:
                                true,
                        },
                    });


                /**
                 * -------------------------------------------------
                 * Status history
                 * -------------------------------------------------
                 */

                await createOrderStatusHistory(
                    tx,
                    order.id,
                    newStatus,
                    userId,
                    `Order moved to ${newStatus}`
                );


                return updatedOrder;
            }
        );


    return result;
};


/**
 * ============================================================
 * CUSTOMER - CANCEL UNPAID ORDER
 * ============================================================
 *
 * Paid orders:
 * payment.service.js
 *
 * Unpaid orders:
 *
 * pending
 *   ↓
 * release reserved inventory
 *   ↓
 * cancelled
 *
 * IMPORTANT:
 *
 * We use updateMany() with reserved_quantity >= quantity
 * so reserved inventory can never become negative.
 * ============================================================
 */

export const cancelOrder = async (
    userId,
    orderId
) => {

    return prisma.$transaction(
        async (tx) => {

            /**
             * -------------------------------------------------
             * 1. Lock order
             * -------------------------------------------------
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
             * -------------------------------------------------
             * 2. Ownership
             * -------------------------------------------------
             */

            if (
                order.user_id !==
                userId
            ) {
                throw new AppError(
                    "Order not found",
                    404
                );
            }


            /**
             * -------------------------------------------------
             * 3. Already cancelled
             * -------------------------------------------------
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
             * -------------------------------------------------
             * 4. Paid orders
             * -------------------------------------------------
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
             * -------------------------------------------------
             * 5. Only pending unpaid orders
             * -------------------------------------------------
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
             * -------------------------------------------------
             * 6. Get order items
             * -------------------------------------------------
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
             * -------------------------------------------------
             * 7. Release reserved inventory
             * -------------------------------------------------
             */

            for (
                const item of orderItems
            ) {

                /**
                 * =============================================
                 * VARIANT INVENTORY
                 * =============================================
                 */

                if (
                    item.variant_id
                ) {

                    const inventoryUpdate =
                        await tx.variant_inventory.updateMany({

                            where: {

                                variant_id:
                                    item.variant_id,

                                reserved_quantity: {
                                    gte:
                                        item.quantity,
                                },
                            },

                            data: {

                                reserved_quantity: {
                                    decrement:
                                        item.quantity,
                                },

                                updated_at:
                                    new Date(),
                            },
                        });


                    if (
                        inventoryUpdate.count !==
                        1
                    ) {
                        throw new AppError(
                            `Unable to release inventory for variant ${item.variant_id}`,
                            409
                        );
                    }

                }


                /**
                 * =============================================
                 * NORMAL PRODUCT INVENTORY
                 * =============================================
                 */

                else {

                    const inventoryUpdate =
                        await tx.inventory.updateMany({

                            where: {

                                product_id:
                                    item.product_id,

                                reserved_quantity: {
                                    gte:
                                        item.quantity,
                                },
                            },

                            data: {

                                reserved_quantity: {
                                    decrement:
                                        item.quantity,
                                },

                                updated_at:
                                    new Date(),
                            },
                        });


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
            }


            /**
             * -------------------------------------------------
             * 8. Cancel order
             * -------------------------------------------------
             */

            const cancelledOrder =
                await tx.orders.update({

                    where: {
                        id:
                            order.id,
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
             * -------------------------------------------------
             * 9. Status history
             * -------------------------------------------------
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