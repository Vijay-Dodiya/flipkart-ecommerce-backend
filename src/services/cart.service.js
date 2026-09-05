import Cart from "../models/cart.model.js";
import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";

export const addToCart = async (userId, productId, quantity) => {

    const product = await prisma.products.findUnique({
        where: {
            id: productId,
        },
        include: {
            inventory: true,
        },
    });

    if (!product) {
        throw new AppError("Product not found", 404);
    }

    if (!product.inventory) {
        throw new AppError("Product inventory not found", 404);
    }

    const availableStock =
        product.inventory.quantity -
        product.inventory.reserved_quantity;

    if (quantity > availableStock) {
        throw new AppError("Insufficient stock", 400);
    }

    let cart = await Cart.findOne({ userId });

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

    const existingItem = cart.items.find(
        (item) => item.productId === productId
    );

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.items.push({
            productId,
            quantity,
        });
    }

    await cart.save();

    return cart;
};


export const getMyCart = async (userId) => {

    const cart = await Cart.findOne({
        userId,
    });

    if (!cart) {
        throw new AppError("Cart not found", 404);
    }

    return cart;
};


export const updateCartItem = async (
    userId,
    productId,
    quantity
) => {

    const product = await prisma.products.findUnique({
        where: {
            id: productId,
        },
        include: {
            inventory: true,
        },
    });

    if (!product) {
        throw new AppError("Product not found", 404);
    }

    if (!product.inventory) {
        throw new AppError("Product inventory not found", 404);
    }

    const availableStock =
        product.inventory.quantity -
        product.inventory.reserved_quantity;

    if (quantity > availableStock) {
        throw new AppError("Insufficient stock", 400);
    }

    const cart = await Cart.findOne({
        userId,
    });

    if (!cart) {
        throw new AppError("Cart not found", 404);
    }

    const existingItem = cart.items.find(
        (item) => item.productId === productId
    );

    if (!existingItem) {
        throw new AppError("Product not found in cart", 404);
    }

    existingItem.quantity = quantity;

    await cart.save();

    return cart;
};


export const removeCartItem = async (
    userId,
    productId
) => {

    // Find user's cart
    const cart = await Cart.findOne({
        userId,
    });

    if (!cart) {
        throw new AppError("Cart not found", 404);
    }

    // Find product inside cart
    const existingItem = cart.items.find(
        (item) => item.productId === productId
    );

    if (!existingItem) {
        throw new AppError(
            "Product not found in cart",
            404
        );
    }

    // Remove item from cart
    cart.items = cart.items.filter(
        (item) => item.productId !== productId
    );

    await cart.save();

    return cart;
};

export const clearCart = async (userId) => {

    // Find the user's cart
    const cart = await Cart.findOne({
        userId,
    });

    if (!cart) {
        throw new AppError("Cart not found", 404);
    }

    // Remove all items from the cart
    cart.items = [];

    await cart.save();

    return cart;
};