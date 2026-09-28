import Cart from "../models/cart.model.js";
import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import { createOrderStatusHistory } from "./orderStatusHistory.service.js";
import { validateCoupon, recordCouponUsage } from "./coupon.service.js";

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
export const createOrder = async (userId, addressId, couponCode = null) => {
  const cart = await Cart.findOne({
    userId,
  });

  if (!cart || !cart.items?.length) {
    throw new AppError("Cart is empty", 400);
  }

  const selectedAddress = await prisma.addresses.findFirst({
    where: {
      id: addressId,
      user_id: userId,
    },
  });

  if (!selectedAddress) {
    throw new AppError("Address not found or does not belong to the user", 404);
  }

  const result = await prisma.$transaction(async (tx) => {
    let subtotal = 0;
    let discount = 0;

    const shippingFee = 0;
    const taxAmount = 0;

    const orderItemsData = [];

    /**
     * ------------------------------------------------
     * 1. Validate products/variants
     *    and reserve inventory
     * ------------------------------------------------
     */
    for (const cartItem of cart.items) {
      const product = await tx.products.findUnique({
        where: {
          id: cartItem.productId,
        },
      });

      if (!product) {
        throw new AppError(`Product ${cartItem.productId} not found`, 404);
      }

      let unitPrice;
      let sku;
      let variantName = null;
      let inventoryId;
      let inventoryQuantity;
      let inventoryReserved;

      /**
       * ============================================
       * VARIANT PRODUCT
       * ============================================
       */
      if (cartItem.variantId) {
        const variant = await tx.product_variants.findUnique({
          where: {
            id: cartItem.variantId,
          },
          include: {
            variant_inventory: true,
          },
        });

        if (!variant) {
          throw new AppError(
            `Product variant ${cartItem.variantId} not found`,
            404,
          );
        }

        /**
         * Make sure variant belongs
         * to cart item's product.
         */
        if (variant.product_id !== product.id) {
          throw new AppError(
            `Variant ${variant.id} does not belong to product ${product.name}`,
            400,
          );
        }

        if (!variant.is_active) {
          throw new AppError(
            `Product variant ${variant.name} is not available`,
            400,
          );
        }

        if (!variant.variant_inventory) {
          throw new AppError(
            `Inventory not found for variant ${variant.name}`,
            400,
          );
        }

        /**
         * Lock variant inventory row.
         */
        const inventoryRows = await tx.$queryRaw`
                                SELECT
                                    id,
                                    variant_id,
                                    quantity,
                                    reserved_quantity
                                FROM variant_inventory
                                WHERE variant_id = ${cartItem.variantId}::uuid
                                FOR UPDATE
                            `;

        if (!inventoryRows.length) {
          throw new AppError(
            `Inventory not found for variant ${variant.name}`,
            400,
          );
        }

        const inventory = inventoryRows[0];

        inventoryId = inventory.id;

        inventoryQuantity = Number(inventory.quantity);

        inventoryReserved = Number(inventory.reserved_quantity);

        const availableStock = inventoryQuantity - inventoryReserved;

        if (availableStock < cartItem.quantity) {
          throw new AppError(
            `Insufficient stock for variant ${variant.name}`,
            400,
          );
        }

        /**
         * Reserve variant inventory.
         */
        await tx.variant_inventory.update({
          where: {
            variant_id: cartItem.variantId,
          },
          data: {
            reserved_quantity: {
              increment: cartItem.quantity,
            },
            updated_at: new Date(),
          },
        });

        /**
         * Variant price overrides
         * product price.
         */
        unitPrice =
          variant.price !== null
            ? Number(variant.price)
            : Number(product.price);

        sku = variant.sku;

        variantName = variant.name;
      } else {

      /**
       * ============================================
       * NORMAL PRODUCT
       * ============================================
       */
        const productWithInventory = await tx.products.findUnique({
          where: {
            id: product.id,
          },
          include: {
            inventory: true,
          },
        });

        if (!productWithInventory.inventory) {
          throw new AppError(
            `Inventory not found for product ${product.name}`,
            400,
          );
        }

        /**
         * Lock product inventory row.
         */
        const inventoryRows = await tx.$queryRaw`
                                SELECT
                                    id,
                                    product_id,
                                    quantity,
                                    reserved_quantity
                                FROM inventory
                                WHERE product_id = ${cartItem.productId}::uuid
                                FOR UPDATE
                            `;

        if (!inventoryRows.length) {
          throw new AppError(
            `Inventory not found for product ${product.name}`,
            400,
          );
        }

        const inventory = inventoryRows[0];

        inventoryId = inventory.id;

        inventoryQuantity = Number(inventory.quantity);

        inventoryReserved = Number(inventory.reserved_quantity);

        const availableStock = inventoryQuantity - inventoryReserved;

        if (availableStock < cartItem.quantity) {
          throw new AppError(
            `Insufficient stock for product ${product.name}`,
            400,
          );
        }

        /**
         * Reserve normal product
         * inventory.
         */
        await tx.inventory.update({
          where: {
            product_id: cartItem.productId,
          },
          data: {
            reserved_quantity: {
              increment: cartItem.quantity,
            },
            updated_at: new Date(),
          },
        });

        unitPrice = Number(product.price);

        sku = product.sku;
      }

      /**
       * Calculate item subtotal.
       */
      const itemSubtotal = Number((unitPrice * cartItem.quantity).toFixed(2));

      subtotal += itemSubtotal;

      /**
       * Prepare order item.
       */
      orderItemsData.push({
        product_id: product.id,

        variant_id: cartItem.variantId ?? null,

        product_name: product.name,

        variant_name: variantName,

        sku,

        quantity: cartItem.quantity,

        unit_price: unitPrice,

        subtotal: itemSubtotal,
      });
    }

    /**
     * ------------------------------------------------
     * 2. Calculate coupon discount
     * ------------------------------------------------
     */
    let appliedCoupon = null;

    if (couponCode) {
      const couponResult = await validateCoupon(
        userId,
        couponCode,
        subtotal,
        tx,
      );

      appliedCoupon = couponResult.coupon;

      discount = couponResult.discountAmount;
    }

    /**
     * ------------------------------------------------
     * 3. Calculate final order amount
     * ------------------------------------------------
     */
    const totalAmount = Number(
      (subtotal - discount + shippingFee + taxAmount).toFixed(2),
    );

    /**
     * ------------------------------------------------
     * 4. Create order
     * ------------------------------------------------
     */
    const order = await tx.orders.create({
      data: {
        user_id: userId,

        status: "pending",

        payment_status: "pending",

        subtotal,

        discount,

        shipping_fee: shippingFee,

        tax_amount: taxAmount,

        total_amount: totalAmount,
      },
    });

    /**
     * ------------------------------------------------
     * 5. Create initial order status
     * ------------------------------------------------
     */
    await createOrderStatusHistory(
      tx,
      order.id,
      "pending",
      userId,
      "Order created",
    );

    /**
     * ------------------------------------------------
     * 6. Create order items
     * ------------------------------------------------
     */
    await tx.order_items.createMany({
      data: orderItemsData.map((item) => ({
        order_id: order.id,

        product_id: item.product_id,

        variant_id: item.variant_id,

        product_name: item.product_name,

        variant_name: item.variant_name,

        sku: item.sku,

        quantity: item.quantity,

        unit_price: item.unit_price,

        subtotal: item.subtotal,
      })),
    });

    /**
     * ------------------------------------------------
     * 7. Create order address snapshot
     * ------------------------------------------------
     */
    await tx.order_addresses.create({
      data: {
        order_id: order.id,

        full_name: selectedAddress.full_name,

        phone: selectedAddress.phone,

        address_line1: selectedAddress.address_line1,

        address_line2: selectedAddress.address_line2,

        city: selectedAddress.city,

        state: selectedAddress.state,

        postal_code: selectedAddress.postal_code,

        country: selectedAddress.country,
      },
    });

    /**
     * ------------------------------------------------
     * 8. Record coupon usage
     * ------------------------------------------------
     */
    if (appliedCoupon) {
      await recordCouponUsage(tx, {
        couponId: appliedCoupon.id,

        userId,

        orderId: order.id,

        discountAmount: discount,
      });
    }

    /**
     * ------------------------------------------------
     * 9. Return complete order
     * ------------------------------------------------
     */
    return tx.orders.findUnique({
      where: {
        id: order.id,
      },

      include: {
        order_items: true,

        order_address: true,

        coupon_usages: true,
      },
    });
  });

  /**
   * ------------------------------------------------
   * 10. Clear cart ONLY after transaction succeeds
   * ------------------------------------------------
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

/**
 * ============================================================
 * Customer - Get My Order By ID
 * ============================================================
 */
export const getOrderById = async (userId, orderId) => {
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
    throw new AppError("Order not found", 404);
  }

  return order;
};

/**
 * ============================================================
 * Admin - Get All Orders
 * ============================================================
 */
export const getAllOrders = async () => {
  const orders = await prisma.orders.findMany({
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
export const getAdminOrderById = async (orderId) => {
  const order = await prisma.orders.findUnique({
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
    throw new AppError("Order not found", 404);
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
export const updateOrderStatus = async (userId, orderId, newStatus) => {
  const result = await prisma.$transaction(async (tx) => {
    /**
     * Lock order row
     */
    const orderRows = await tx.$queryRaw`
                        SELECT
                            id,
                            user_id,
                            status,
                            payment_status
                        FROM orders
                        WHERE id = ${orderId}::uuid
                        FOR UPDATE
                    `;

    const order = orderRows[0];

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    /**
     * Check allowed transition
     */
    const possibleStatuses = allowedTransitions[order.status] || [];

    if (!possibleStatuses.includes(newStatus)) {
      throw new AppError(
        `Cannot change order status from ${order.status} to ${newStatus}`,
        400,
      );
    }

    /**
     * Payment safety check
     */
    if (
      newStatus === "processing" ||
      newStatus === "shipped" ||
      newStatus === "delivered"
    ) {
      if (order.payment_status !== "paid") {
        throw new AppError("Cannot move an unpaid order into fulfillment", 400);
      }
    }

    /**
     * Update order status
     */
    const updatedOrder = await tx.orders.update({
      where: {
        id: order.id,
      },
      data: {
        status: newStatus,
        updated_at: new Date(),
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

    /**
     * Create status history
     */
    await createOrderStatusHistory(
      tx,
      order.id,
      newStatus,
      userId,
      "Order moved to processing",
    );

    return updatedOrder;
  });

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
export const cancelOrder = async (userId, orderId) => {
  return prisma.$transaction(async (tx) => {
    /**
     * 1. Lock order
     */
    const orderRows = await tx.$queryRaw`
                    SELECT
                        id,
                        user_id,
                        status,
                        payment_status
                    FROM orders
                    WHERE id = ${orderId}::uuid
                    FOR UPDATE
                `;

    const order = orderRows[0];

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    /**
     * 2. Ownership
     */
    if (order.user_id !== userId) {
      throw new AppError("Order not found", 404);
    }

    /**
     * 3. Already cancelled
     */
    if (order.status === "cancelled") {
      throw new AppError("Order is already cancelled", 400);
    }

    /**
     * 4. Paid orders use refund flow
     */
    if (order.payment_status === "paid") {
      throw new AppError("Paid orders require the refund flow", 400);
    }

    /**
     * 5. Only pending unpaid orders
     * can be cancelled.
     *
     * Failed payment orders are also still
     * pending from an order-lifecycle perspective,
     * so they can be cancelled.
     */
    if (order.status !== "pending") {
      throw new AppError("Only pending unpaid orders can be cancelled", 400);
    }

    /**
     * 6. Get order items
     */
    const orderItems = await tx.order_items.findMany({
      where: {
        order_id: order.id,
      },
    });

    if (!orderItems.length) {
      throw new AppError("Order has no items", 400);
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
    /**
     * ------------------------------------------------
     * 7. Release reserved inventory
     * ------------------------------------------------
     *
     * Variant order item:
     *     variant_inventory
     *
     * Normal product:
     *     inventory
     */
    for (const item of orderItems) {
      /**
       * ============================================
       * VARIANT INVENTORY
       * ============================================
       */
      if (item.variant_id) {
        const inventoryUpdate = await tx.variant_inventory.updateMany({
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

        if (inventoryUpdate.count !== 1) {
          throw new AppError(
            `Unable to release inventory for variant ${item.variant_id}`,
            409,
          );
        }
      } else {

      /**
       * ============================================
       * NORMAL PRODUCT INVENTORY
       * ============================================
       */
        const inventoryUpdate = await tx.inventory.updateMany({
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

        if (inventoryUpdate.count !== 1) {
          throw new AppError(
            `Unable to release inventory for product ${item.product_id}`,
            409,
          );
        }
      }
    }
    /**
     * 8. Cancel order
     */
    const cancelledOrder = await tx.orders.update({
      where: {
        id: order.id,
      },
      data: {
        status: "cancelled",
        cancelled_at: new Date(),
        updated_at: new Date(),
      },
      include: {
        order_items: true,
        order_address: true,
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
      "Customer cancelled the unpaid order",
    );

    return cancelledOrder;
  });
};
