import Cart from "../models/cart.model.js";

import prisma from "../config/prisma.js";

import AppError from "../utils/AppError.js";


/**
 * Normalize variant ID.
 *
 * undefined and null both represent
 * a product without a variant.
 */
const normalizeVariantId = (variantId) => {
    return variantId ?? null;
};


/**
 * ============================================================
 * GET PURCHASE TARGET
 * ============================================================
 *
 * Determines whether the cart item should use:
 *
 * Product inventory
 * OR
 * Variant inventory
 *
 * Rules:
 *
 * 1. Product must exist.
 * 2. If product has variants, variantId is required.
 * 3. Variant must belong to the product.
 * 4. Variant must be active.
 * 5. Variant inventory must exist.
 * 6. Product without variants must have normal inventory.
 */
const getPurchaseTarget = async (
    productId,
    variantId = null
) => {
    const normalizedVariantId =
        normalizeVariantId(variantId);


    // ---------------------------------------------------------
    // Find product
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


    // ---------------------------------------------------------
    // Find whether this product has variants
    // ---------------------------------------------------------

    const variantCount =
        await prisma.product_variants.count({
            where: {
                product_id: productId,
            },
        });


    const productHasVariants =
        variantCount > 0;


    // ---------------------------------------------------------
    // Product has variants
    // ---------------------------------------------------------

    if (productHasVariants) {

        if (!normalizedVariantId) {
            throw new AppError(
                "Variant selection is required for this product",
                400
            );
        }


        const variant =
            await prisma.product_variants.findUnique({
                where: {
                    id: normalizedVariantId,
                },
                include: {
                    variant_inventory: true,
                },
            });


        if (!variant) {
            throw new AppError(
                "Product variant not found",
                404
            );
        }


        // -----------------------------------------------------
        // Make sure variant belongs to product
        // -----------------------------------------------------

        if (
            variant.product_id !==
            productId
        ) {
            throw new AppError(
                "Product variant does not belong to this product",
                400
            );
        }


        // -----------------------------------------------------
        // Variant must be active
        // -----------------------------------------------------

        if (!variant.is_active) {
            throw new AppError(
                "Product variant is not available",
                400
            );
        }


        // -----------------------------------------------------
        // Variant inventory must exist
        // -----------------------------------------------------

        if (!variant.variant_inventory) {
            throw new AppError(
                "Variant inventory not found",
                404
            );
        }


        const availableStock =
            Number(
                variant.variant_inventory.quantity
            ) -
            Number(
                variant.variant_inventory.reserved_quantity
            );


        return {
            type: "variant",
            product,
            variant,
            inventory:
                variant.variant_inventory,
            availableStock,
        };
    }


    // ---------------------------------------------------------
    // Product does NOT have variants
    // ---------------------------------------------------------

    if (normalizedVariantId) {
        throw new AppError(
            "This product does not have variants",
            400
        );
    }


    // ---------------------------------------------------------
    // Normal product inventory
    // ---------------------------------------------------------

    if (!product.inventory) {
        throw new AppError(
            "Product inventory not found",
            404
        );
    }


    const availableStock =
        Number(
            product.inventory.quantity
        ) -
        Number(
            product.inventory.reserved_quantity
        );


    return {
        type: "product",
        product,
        variant: null,
        inventory: product.inventory,
        availableStock,
    };
};


/**
 * ============================================================
 * VALIDATE STOCK
 * ============================================================
 */
const validateStock = (
    availableStock,
    quantity
) => {

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
};


/**
 * ============================================================
 * FIND CART ITEM
 * ============================================================
 */
const findCartItem = (
    cart,
    productId,
    variantId = null
) => {

    const normalizedVariantId =
        normalizeVariantId(variantId);


    return cart.items.find(
        (item) =>
            item.productId === productId &&
            (item.variantId ?? null) ===
                normalizedVariantId
    );
};


/**
 * ============================================================
 * ADD PRODUCT / VARIANT TO CART
 * ============================================================
 *
 * Product without variants:
 *
 * productId + quantity
 *
 * Product with variants:
 *
 * productId + variantId + quantity
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
    // 2. Determine product/variant inventory
    // ---------------------------------------------------------

    const purchaseTarget =
        await getPurchaseTarget(
            productId,
            variantId
        );


    // ---------------------------------------------------------
    // 3. Validate stock
    // ---------------------------------------------------------

    validateStock(
        purchaseTarget.availableStock,
        quantity
    );


    // ---------------------------------------------------------
    // 4. Normalize variant
    // ---------------------------------------------------------

    const normalizedVariantId =
        normalizeVariantId(variantId);


    // ---------------------------------------------------------
    // 5. Find user's cart
    // ---------------------------------------------------------

    let cart = await Cart.findOne({
        userId,
    });


    // ---------------------------------------------------------
    // 6. Create cart
    // ---------------------------------------------------------

    if (!cart) {

        cart = await Cart.create({
            userId,

            items: [
                {
                    productId,
                    variantId:
                        normalizedVariantId,
                    quantity,
                },
            ],
        });


        return cart;
    }


    // ---------------------------------------------------------
    // 7. Find exact product + variant
    // ---------------------------------------------------------

    const existingItem =
        findCartItem(
            cart,
            productId,
            normalizedVariantId
        );


    // ---------------------------------------------------------
    // 8. Existing cart item
    // ---------------------------------------------------------

    if (existingItem) {

        const newQuantity =
            existingItem.quantity +
            quantity;


        validateStock(
            purchaseTarget.availableStock,
            newQuantity
        );


        existingItem.quantity =
            newQuantity;
    }


    // ---------------------------------------------------------
    // 9. New cart item
    // ---------------------------------------------------------

    else {

        cart.items.push({
            productId,
            variantId:
                normalizedVariantId,
            quantity,
        });
    }


    // ---------------------------------------------------------
    // 10. Save cart
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

    const cart =
        await Cart.findOne({
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
    // 2. Normalize variant
    // ---------------------------------------------------------

    const normalizedVariantId =
        normalizeVariantId(variantId);


    // ---------------------------------------------------------
    // 3. Find cart
    // ---------------------------------------------------------

    const cart =
        await Cart.findOne({
            userId,
        });


    if (!cart) {
        throw new AppError(
            "Cart not found",
            404
        );
    }


    // ---------------------------------------------------------
    // 4. Find exact cart item
    // ---------------------------------------------------------

    const existingItem =
        findCartItem(
            cart,
            productId,
            normalizedVariantId
        );


    if (!existingItem) {
        throw new AppError(
            "Cart item not found",
            404
        );
    }


    // ---------------------------------------------------------
    // 5. Validate product / variant
    // ---------------------------------------------------------

    const purchaseTarget =
        await getPurchaseTarget(
            productId,
            normalizedVariantId
        );


    // ---------------------------------------------------------
    // 6. Validate stock
    // ---------------------------------------------------------

    validateStock(
        purchaseTarget.availableStock,
        quantity
    );


    // ---------------------------------------------------------
    // 7. Update quantity
    // ---------------------------------------------------------

    existingItem.quantity =
        quantity;


    // ---------------------------------------------------------
    // 8. Save
    // ---------------------------------------------------------

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

    const normalizedVariantId =
        normalizeVariantId(variantId);


    // ---------------------------------------------------------
    // 1. Find cart
    // ---------------------------------------------------------

    const cart =
        await Cart.findOne({
            userId,
        });


    if (!cart) {
        throw new AppError(
            "Cart not found",
            404
        );
    }


    // ---------------------------------------------------------
    // 2. Find exact item
    // ---------------------------------------------------------

    const existingItem =
        findCartItem(
            cart,
            productId,
            normalizedVariantId
        );


    if (!existingItem) {
        throw new AppError(
            "Cart item not found",
            404
        );
    }


    // ---------------------------------------------------------
    // 3. Remove exact product + variant
    // ---------------------------------------------------------

    cart.items =
        cart.items.filter(
            (item) =>
                !(
                    item.productId ===
                        productId &&
                    (item.variantId ?? null) ===
                        normalizedVariantId
                )
        );


    // ---------------------------------------------------------
    // 4. Save
    // ---------------------------------------------------------

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

    const cart =
        await Cart.findOne({
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