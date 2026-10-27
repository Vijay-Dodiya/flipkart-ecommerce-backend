import {
    addToCart,
    getMyCart,
    updateCartItem,
    removeCartItem,
    clearCart,
} from "../services/cart.service.js";


export const addToCartController = async (
    req,
    res,
    next
) => {

    try {

        const {
            productId,
            quantity,
            variantId,
        } = req.body;


        const cart =
            await addToCart(
                req.user.id,
                productId,
                quantity,
                variantId
            );


        res.status(200).json({
            success: true,
            message:
                "Product added to cart successfully",
            cart,
        });

    } catch (error) {
        next(error);
    }
};


export const getMyCartController = async (
    req,
    res,
    next
) => {

    try {

        const cart =
            await getMyCart(
                req.user.id
            );


        res.status(200).json({
            success: true,
            message:
                "Cart fetched successfully",
            cart,
        });

    } catch (error) {
        next(error);
    }
};


export const updateCartItemController = async (
    req,
    res,
    next
) => {

    try {

        const {
            productId,
        } = req.params;

        const {
            quantity,
            variantId,
        } = req.body;


        const cart =
            await updateCartItem(
                req.user.id,
                productId,
                quantity,
                variantId
            );


        res.status(200).json({
            success: true,
            message:
                "Cart item updated successfully",
            cart,
        });

    } catch (error) {
        next(error);
    }
};


export const removeCartItemController = async (
    req,
    res,
    next
) => {

    try {

        const {
            productId,
        } = req.params;

        const {
            variantId,
        } = req.body;


        const cart =
            await removeCartItem(
                req.user.id,
                productId,
                variantId
            );


        res.status(200).json({
            success: true,
            message:
                "Cart item removed successfully",
            cart,
        });

    } catch (error) {
        next(error);
    }
};


export const clearCartController = async (
    req,
    res,
    next
) => {

    try {

        const cart =
            await clearCart(
                req.user.id
            );


        res.status(200).json({
            success: true,
            message:
                "Cart cleared successfully",
            cart,
        });

    } catch (error) {
        next(error);
    }
};