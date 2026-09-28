import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";

import {
    deleteCache,
    invalidateProductListCache,
} from "../utils/cache.js";

const invalidateProductCaches = async (productId) => {
    await Promise.all([
        deleteCache(`product:${productId}`),
        invalidateProductListCache(),
    ]);
};

const getProductOrThrow = async (productId) => {
    const product = await prisma.products.findUnique({
        where: {
            id: productId,
        },
        select: {
            id: true,
        },
    });

    if (!product) {
        throw new AppError("Product not found", 404);
    }

    return product;
};

export const createProductImage = async (productId, data) => {
    await getProductOrThrow(productId);

    const image = await prisma.$transaction(async (tx) => {
        /*
         * If this image is being marked as primary,
         * remove primary status from all existing images first.
         */
        if (data.isPrimary) {
            await tx.productImage.updateMany({
                where: {
                    productId,
                    isPrimary: true,
                },
                data: {
                    isPrimary: false,
                },
            });
        }

        return tx.productImage.create({
            data: {
                productId,
                imageUrl: data.imageUrl,
                altText: data.altText ?? null,
                isPrimary: data.isPrimary ?? false,
                sortOrder: data.sortOrder ?? 0,
            },
        });
    });

    await invalidateProductCaches(productId);

    return image;
};

export const getProductImages = async (productId) => {
    await getProductOrThrow(productId);

    return prisma.productImage.findMany({
        where: {
            productId,
        },
        orderBy: [
            {
                isPrimary: "desc",
            },
            {
                sortOrder: "asc",
            },
            {
                createdAt: "asc",
            },
        ],
    });
};

export const getProductImageById = async (productId, imageId) => {
    const image = await prisma.productImage.findFirst({
        where: {
            id: imageId,
            productId,
        },
    });

    if (!image) {
        throw new AppError("Product image not found", 404);
    }

    return image;
};

export const updateProductImage = async (
    productId,
    imageId,
    data,
) => {
    await getProductImageById(productId, imageId);

    const image = await prisma.$transaction(async (tx) => {
        if (data.isPrimary === true) {
            await tx.productImage.updateMany({
                where: {
                    productId,
                    isPrimary: true,
                    id: {
                        not: imageId,
                    },
                },
                data: {
                    isPrimary: false,
                },
            });
        }

        return tx.productImage.update({
            where: {
                id: imageId,
            },
            data: {
                ...(data.imageUrl !== undefined && {
                    imageUrl: data.imageUrl,
                }),

                ...(data.altText !== undefined && {
                    altText: data.altText,
                }),

                ...(data.isPrimary !== undefined && {
                    isPrimary: data.isPrimary,
                }),

                ...(data.sortOrder !== undefined && {
                    sortOrder: data.sortOrder,
                }),
            },
        });
    });

    await invalidateProductCaches(productId);

    return image;
};

export const deleteProductImage = async (
    productId,
    imageId,
) => {
    const image = await getProductImageById(
        productId,
        imageId,
    );

    await prisma.productImage.delete({
        where: {
            id: image.id,
        },
    });

    await invalidateProductCaches(productId);

    return {
    message: "Product image deleted successfully",
    };
};

export const setPrimaryProductImage = async (
    productId,
    imageId,
) => {
    await getProductImageById(productId, imageId);

    const image = await prisma.$transaction(async (tx) => {
        await tx.productImage.updateMany({
            where: {
                productId,
                isPrimary: true,
            },
            data: {
                isPrimary: false,
            },
        });

        return tx.productImage.update({
            where: {
                id: imageId,
            },
            data: {
                isPrimary: true,
            },
        });
    });

    await invalidateProductCaches(productId);

    return image;  
};