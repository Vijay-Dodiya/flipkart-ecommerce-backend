import {
    addToCart,
    getMyCart,
    updateCartItem,
    removeCartItem,
    clearCart,
} from "../services/cart.service.js";


export const addToCartController = async (req, res) => {

    const { productId, quantity, variantId, } = req.body;

    const cart = await addToCart(
        req.user.id,
        productId,
        quantity,
        variantId,
    );

    res.status(200).json({
        success: true,
        message: "Product added to cart successfully",
        cart,
    });
};


export const getMyCartController = async (req, res) => {

    const cart = await getMyCart(
        req.user.id
    );

    res.status(200).json({
        success: true,
        message: "Cart fetched successfully",
        cart,
    });
};


export const updateCartItemController = async (req, res) => {

    const { productId } = req.params;
    const { quantity,variantId } = req.body;

    const cart = await updateCartItem(
        req.user.id,
        productId,
        quantity,
        variantId
    );

    res.status(200).json({
        success: true,
        message: "Cart item updated successfully",
        cart,
    });
};


export const removeCartItemController = async (req, res) => {

    const { productId } = req.params;
    const { variantId } = req.body;

    const cart = await removeCartItem(
        req.user.id,
        productId,
        variantId
    );


    res.status(200).json({
        success: true,
        message: "Cart item removed successfully",
        cart,
    });
};

export const clearCartController = async (req, res) => {

    const cart = await clearCart(
        req.user.id
    );

    res.status(200).json({
        success: true,
        message: "Cart cleared successfully",
        cart,
    });
};