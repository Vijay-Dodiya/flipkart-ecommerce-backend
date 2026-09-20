import { asyncHandler } from "../utils/asyncHandler.js";

import {
    addToWishlist,
    getWishlist,
    removeFromWishlist,
} from "../services/wishlist.service.js";

export const addToWishlistController =
    asyncHandler(async (req, res) => {
        const { id: userId } = req.user;
        const { productId } = req.params;

        const item = await addToWishlist(
            userId,
            productId
        );

        res.status(201).json({
            success: true,
            message: "Product added to wishlist successfully",
            data: item,
        });
    });

export const getWishlistController =
    asyncHandler(async (req, res) => {
        const { id: userId } = req.user;

        const wishlist =
            await getWishlist(userId);

        res.status(200).json({
            success: true,
            message: "Wishlist fetched successfully",
            data: wishlist,
        });
    });

export const removeFromWishlistController =
    asyncHandler(async (req, res) => {
        const { id: userId } = req.user;
        const { productId } = req.params;

        const result =
            await removeFromWishlist(
                userId,
                productId
            );

        res.status(200).json({
            success: true,
            message: "Product removed from wishlist successfully",
            data: result,
        });
    });