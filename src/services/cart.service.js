import Cart from "../models/cart.model.js";

import prisma from "../config/prisma.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * ADD PRODUCT / VARIANT TO CART
 * ============================================================
 *
 * Product-only:
 * productId + quantity
 *
 * Variant:
 * productId + variantId + quantity
 * ============================================================
 */
export const addToCart = async (
    userId,
    productId,
    quantity,
    variantId = null
) => {
    // ---------------------------------------------------------
    // 1. Validate quantity
    // ---------------------------------------------------------
    if (
        !Number.isInteger(quantity) ||
        quantity < 1
    ) {
        throw new AppError(
            "Quantity must be at least 1",
            400
        );
    }

    // ---------------------------------------------------------
    // 2. Find product
    // ---------------------------------------------------------
    const product =
        await prisma.products.findUnique({
            where: {
                id: productId,
            },
            include: {
                inventory: true,
            },
        });

    if (!product) {
        throw new AppError(
            "Product not found",
            404
        );
    }

    let availableStock;

    // ---------------------------------------------------------
    // 3. Variant flow
    // ---------------------------------------------------------
    if (variantId) {
        const variant =
            await prisma.product_variants.findUnique(
                {
                    where: {
                        id: variantId,
                    },
                    include: {
                        variant_inventory: true,
                    },
                }
            );

        if (!variant) {
            throw new AppError(
                "Product variant not found",
                404
            );
        }

        // Variant must belong to this product
        if (
            variant.product_id !==
            productId
        ) {
            throw new AppError(
                "Product variant does not belong to this product",
                400
            );
        }

        // Variant must be active
        if (!variant.is_active) {
            throw new AppError(
                "Product variant is not available",
                400
            );
        }

        if (!variant.variant_inventory) {
            throw new AppError(
                "Variant inventory not found",
                404
            );
        }

        availableStock =
            Number(
                variant.variant_inventory
                    .quantity
            ) -
            Number(
                variant.variant_inventory
                    .reserved_quantity
            );
    }

    // ---------------------------------------------------------
    // 4. Normal product flow
    // ---------------------------------------------------------
    else {
        if (!product.inventory) {
            throw new AppError(
                "Product inventory not found",
                404
            );
        }

        availableStock =
            Number(
                product.inventory.quantity
            ) -
            Number(
                product.inventory
                    .reserved_quantity
            );
    }

    // ---------------------------------------------------------
    // 5. Stock validation
    // ---------------------------------------------------------
    if (availableStock <= 0) {
        throw new AppError(
            "Product is out of stock",
            400
        );
    }

    if (quantity > availableStock) {
        throw new AppError(
            `Insufficient stock. Only ${availableStock} units are available.`,
            400
        );
    }

    // ---------------------------------------------------------
    // 6. Find user's cart
    // ---------------------------------------------------------
    let cart = await Cart.findOne({
        userId,
    });

    // ---------------------------------------------------------
    // 7. Create cart
    // ---------------------------------------------------------
    if (!cart) {
        cart = await Cart.create({
            userId,
            items: [
                {
                    productId,
                    variantId,
                    quantity,
                },
            ],
        });

        return cart;
    }

    // ---------------------------------------------------------
    // 8. Find same product + same variant
    //
    // Product-only:
    // productId + null
    //
    // Variant:
    // productId + variantId
    // ---------------------------------------------------------
    const existingItem =
        cart.items.find(
            (item) =>
                item.productId ===
                    productId &&
                (item.variantId ?? null) ===
                    (variantId ?? null)
        );

    // ---------------------------------------------------------
    // 9. Existing cart item
    // ---------------------------------------------------------
    if (existingItem) {
        const newQuantity =
            existingItem.quantity +
            quantity;

        if (
            newQuantity >
            availableStock
        ) {
            throw new AppError(
                `Insufficient stock. Only ${availableStock} units are available.`,
                400
            );
        }

        existingItem.quantity =
            newQuantity;
    }

    // ---------------------------------------------------------
    // 10. New cart item
    // ---------------------------------------------------------
    else {
        cart.items.push({
            productId,
            variantId,
            quantity,
        });
    }

    // ---------------------------------------------------------
    // 11. Save cart
    // ---------------------------------------------------------
    await cart.save();

    return cart;
};

/**
 * ============================================================
 * GET MY CART
 * ============================================================
 */
export const getMyCart = async (
    userId
) => {
    const cart = await Cart.findOne({
        userId,
    });

    if (!cart) {
        throw new AppError(
            "Cart not found",
            404
        );
    }

    return cart;
};

/**
 * ============================================================
 * UPDATE CART ITEM
 * ============================================================
 */
export const updateCartItem = async (
    userId,
    productId,
    quantity,
    variantId = null
) => {
    // ---------------------------------------------------------
    // 1. Validate quantity
    // ---------------------------------------------------------
    if (
        !Number.isInteger(quantity) ||
        quantity < 1
    ) {
        throw new AppError(
            "Quantity must be at least 1",
            400
        );
    }

    // ---------------------------------------------------------
    // 2. Find product
    // ---------------------------------------------------------
    const product =
        await prisma.products.findUnique({
            where: {
                id: productId,
            },
            include: {
                inventory: true,
            },
        });

    if (!product) {
        throw new AppError(
            "Product not found",
            404
        );
    }

    let availableStock;

    // ---------------------------------------------------------
    // 3. Variant inventory
    // ---------------------------------------------------------
    if (variantId) {
        const variant =
            await prisma.product_variants.findUnique(
                {
                    where: {
                        id: variantId,
                    },
                    include: {
                        variant_inventory: true,
                    },
                }
            );

        if (!variant) {
            throw new AppError(
                "Product variant not found",
                404
            );
        }

        if (
            variant.product_id !==
            productId
        ) {
            throw new AppError(
                "Product variant does not belong to this product",
                400
            );
        }

        if (!variant.is_active) {
            throw new AppError(
                "Product variant is not available",
                400
            );
        }

        if (!variant.variant_inventory) {
            throw new AppError(
                "Variant inventory not found",
                404
            );
        }

        availableStock =
            Number(
                variant.variant_inventory
                    .quantity
            ) -
            Number(
                variant.variant_inventory
                    .reserved_quantity
            );
    }

    // ---------------------------------------------------------
    // 4. Normal product inventory
    // ---------------------------------------------------------
    else {
        if (!product.inventory) {
            throw new AppError(
                "Product inventory not found",
                404
            );
        }

        availableStock =
            Number(
                product.inventory.quantity
            ) -
            Number(
                product.inventory
                    .reserved_quantity
            );
    }

    // ---------------------------------------------------------
    // 5. Stock validation
    // ---------------------------------------------------------
    if (availableStock <= 0) {
        throw new AppError(
            "Product is out of stock",
            400
        );
    }

    if (quantity > availableStock) {
        throw new AppError(
            `Insufficient stock. Only ${availableStock} units are available.`,
            400
        );
    }

    // ---------------------------------------------------------
    // 6. Find cart
    // ---------------------------------------------------------
    const cart = await Cart.findOne({
        userId,
    });

    if (!cart) {
        throw new AppError(
            "Cart not found",
            404
        );
    }

    // ---------------------------------------------------------
    // 7. Find exact product + variant
    // ---------------------------------------------------------
    const existingItem =
        cart.items.find(
            (item) =>
                item.productId ===
                    productId &&
                (item.variantId ?? null) ===
                    (variantId ?? null)
        );

    if (!existingItem) {
        throw new AppError(
            "Product variant not found in cart",
            404
        );
    }

    // ---------------------------------------------------------
    // 8. Update quantity
    // ---------------------------------------------------------
    existingItem.quantity =
        quantity;

    await cart.save();

    return cart;
};

/**
 * ============================================================
 * REMOVE CART ITEM
 * ============================================================
 */
export const removeCartItem = async (
    userId,
    productId,
    variantId = null
) => {
    const cart = await Cart.findOne({
        userId,
    });

    if (!cart) {
        throw new AppError(
            "Cart not found",
            404
        );
    }

    const existingItem =
        cart.items.find(
            (item) =>
                item.productId ===
                    productId &&
                (item.variantId ?? null) ===
                    (variantId ?? null)
        );

    if (!existingItem) {
        throw new AppError(
            "Product variant not found in cart",
            404
        );
    }

    cart.items =
        cart.items.filter(
            (item) =>
                !(
                    item.productId ===
                        productId &&
                    (item.variantId ??
                        null) ===
                        (variantId ??
                            null)
                )
        );

    await cart.save();

    return cart;
};

/**
 * ============================================================
 * CLEAR CART
 * ============================================================
 */
export const clearCart = async (
    userId
) => {
    const cart = await Cart.findOne({
        userId,
    });

    if (!cart) {
        throw new AppError(
            "Cart not found",
            404
        );
    }

    cart.items = [];

    await cart.save();

    return cart;
};