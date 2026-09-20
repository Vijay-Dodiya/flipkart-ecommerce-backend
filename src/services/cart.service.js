import Cart from "../models/cart.model.js";

import prisma from "../config/prisma.js";

import AppError from "../utils/AppError.js";


/*
|--------------------------------------------------------------------------
| ADD PRODUCT TO CART
|--------------------------------------------------------------------------
*/

export const addToCart = async (
    userId,
    productId,
    quantity
) => {

    // 1. Validate quantity
    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new AppError(
            "Quantity must be at least 1",
            400
        );
    }


    // 2. Find product + inventory
    const product = await prisma.products.findUnique({

        where: {
            id: productId,
        },

        include: {
            inventory: true,
        },

    });


    // 3. Product must exist
    if (!product) {
        throw new AppError(
            "Product not found",
            404
        );
    }


    // 4. Inventory must exist
    if (!product.inventory) {
        throw new AppError(
            "Product inventory not found",
            404
        );
    }


    // 5. Calculate available stock
    const availableStock =
        product.inventory.quantity -
        product.inventory.reserved_quantity;


    // 6. Available stock must be positive
    if (availableStock <= 0) {
        throw new AppError(
            "Product is out of stock",
            400
        );
    }


    // 7. Requested quantity cannot exceed available stock
    if (quantity > availableStock) {
        throw new AppError(
            "Insufficient stock",
            400
        );
    }


    // 8. Find user's cart
    let cart = await Cart.findOne({
        userId,
    });


    // 9. Create cart if it doesn't exist
    if (!cart) {

        cart = await Cart.create({

            userId,

            items: [
                {
                    productId,
                    quantity,
                },
            ],

        });

        return cart;
    }


    // 10. Check whether product already exists
    // inside the cart
    const existingItem = cart.items.find(
        (item) =>
            item.productId === productId
    );


    // 11. Product already exists
    if (existingItem) {

        const newQuantity =
            existingItem.quantity +
            quantity;


        // IMPORTANT:
        // Validate TOTAL cart quantity,
        // not only the newly added quantity.
        if (newQuantity > availableStock) {

            throw new AppError(
                `Insufficient stock. Only ${availableStock} units are available.`,
                400
            );
        }


        existingItem.quantity =
            newQuantity;

    } else {

        // 12. Product does not exist
        // in cart yet
        cart.items.push({

            productId,

            quantity,

        });

    }


    // 13. Save updated cart
    await cart.save();


    return cart;
};



/*
|--------------------------------------------------------------------------
| GET MY CART
|--------------------------------------------------------------------------
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



/*
|--------------------------------------------------------------------------
| UPDATE CART ITEM
|--------------------------------------------------------------------------
*/

export const updateCartItem = async (
    userId,
    productId,
    quantity
) => {

    // 1. Validate quantity
    if (!Number.isInteger(quantity) || quantity < 1) {

        throw new AppError(
            "Quantity must be at least 1",
            400
        );

    }


    // 2. Find product + inventory
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


    if (!product.inventory) {

        throw new AppError(
            "Product inventory not found",
            404
        );

    }


    // 3. Calculate available stock
    const availableStock =
        product.inventory.quantity -
        product.inventory.reserved_quantity;


    // 4. Check stock
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


    // 5. Find user's cart
    const cart = await Cart.findOne({
        userId,
    });


    if (!cart) {

        throw new AppError(
            "Cart not found",
            404
        );

    }


    // 6. Find product in cart
    const existingItem = cart.items.find(
        (item) =>
            item.productId === productId
    );


    if (!existingItem) {

        throw new AppError(
            "Product not found in cart",
            404
        );

    }


    // 7. Update quantity
    existingItem.quantity =
        quantity;


    // 8. Save cart
    await cart.save();


    return cart;
};



/*
|--------------------------------------------------------------------------
| REMOVE CART ITEM
|--------------------------------------------------------------------------
*/

export const removeCartItem = async (
    userId,
    productId
) => {

    // Find user's cart
    const cart = await Cart.findOne({
        userId,
    });


    if (!cart) {

        throw new AppError(
            "Cart not found",
            404
        );

    }


    // Find product inside cart
    const existingItem = cart.items.find(
        (item) =>
            item.productId === productId
    );


    if (!existingItem) {

        throw new AppError(
            "Product not found in cart",
            404
        );

    }


    // Remove item
    cart.items = cart.items.filter(
        (item) =>
            item.productId !== productId
    );


    // Save cart
    await cart.save();


    return cart;
};



/*
|--------------------------------------------------------------------------
| CLEAR CART
|--------------------------------------------------------------------------
*/

export const clearCart = async (
    userId
) => {

    // Find user's cart
    const cart = await Cart.findOne({
        userId,
    });


    if (!cart) {

        throw new AppError(
            "Cart not found",
            404
        );

    }


    // Remove all items
    cart.items = [];


    // Save cart
    await cart.save();


    return cart;
};