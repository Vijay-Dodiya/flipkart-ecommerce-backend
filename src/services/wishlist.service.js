import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";

export const addToWishlist = async (
    userId,
    productId
) => {
    const product = await prisma.products.findUnique({
        where: {
            id: productId,
        },
        select: {
            id: true,
        },
    });

    if (!product) {
        throw new AppError(
            "Product not found",
            404
        );
    }

    const existingItem =
        await prisma.wishlist_items.findUnique({
            where: {
                user_id_product_id: {
                    user_id: userId,
                    product_id: productId,
                },
            },
        });

    if (existingItem) {
        throw new AppError(
            "Product is already in your wishlist",
            409
        );
    }

    return prisma.wishlist_items.create({
        data: {
            user_id: userId,
            product_id: productId,
        },
        include: {
            products: true,
        },
    });
};

export const getWishlist = async (userId) => {
    const items =
        await prisma.wishlist_items.findMany({
            where: {
                user_id: userId,
            },
            orderBy: {
                created_at: "desc",
            },
            include: {
                products: {
                    include: {
                        categories: true,
                        inventory: true,
                    },
                },
            },
        });

    return items;
};

export const removeFromWishlist = async (
    userId,
    productId
) => {
    const item =
        await prisma.wishlist_items.findUnique({
            where: {
                user_id_product_id: {
                    user_id: userId,
                    product_id: productId,
                },
            },
        });

    if (!item) {
        throw new AppError(
            "Product is not in your wishlist",
            404
        );
    }

    await prisma.wishlist_items.delete({
        where: {
            user_id_product_id: {
                user_id: userId,
                product_id: productId,
            },
        },
    });

    return {
        productId,
    };
};