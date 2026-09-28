import prisma from "../config/prisma.js";
import AppError  from "../utils/AppError.js";

export const createProductVariant = async (data) => {
    const {
        productId,
        name,
        sku,
        price,
        attributes,
        quantity = 0,
        lowStockThreshold = 5,
        isActive = true,
    } = data;

    const product = await prisma.products.findUnique({
        where: {
            id: productId,
        },
    });

    if (!product) {
        throw new AppError(
            "Product not found",
            404
        );
    }

    const existingSku =
        await prisma.product_variants.findUnique({
            where: {
                sku,
            },
        });

    if (existingSku) {
        throw new AppError(
            "Variant SKU already exists",
            409
        );
    }

    const variant =
        await prisma.$transaction(async (tx) => {
            const createdVariant =
                await tx.product_variants.create({
                    data: {
                        product_id: productId,
                        name,
                        sku,
                        price: price ?? null,
                        attributes,
                        is_active: isActive,
                    },
                });

            await tx.variant_inventory.create({
                data: {
                    variant_id:
                        createdVariant.id,
                    quantity,
                    reserved_quantity: 0,
                    low_stock_threshold:
                        lowStockThreshold,
                },
            });

            return createdVariant;
        });

    return prisma.product_variants.findUnique({
        where: {
            id: variant.id,
        },
        include: {
            variant_inventory: true,
            products: {
                select: {
                    id: true,
                    name: true,
                    price: true,
                },
            },
        },
    });
};

export const getProductVariants = async (
    productId
) => {
    const product =
        await prisma.products.findUnique({
            where: {
                id: productId,
            },
        });

    if (!product) {
        throw new AppError(
            "Product not found",
            404
        );
    }

    return prisma.product_variants.findMany({
        where: {
            product_id: productId,
        },
        include: {
            variant_inventory: true,
        },
        orderBy: {
            created_at: "desc",
        },
    });
};

export const getProductVariantById = async (
    variantId
) => {
    const variant =
        await prisma.product_variants.findUnique({
            where: {
                id: variantId,
            },
            include: {
                variant_inventory: true,
                products: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                    },
                },
            },
        });

    if (!variant) {
        throw new AppError(
            "Product variant not found",
            404
        );
    }

    return variant;
};

export const updateProductVariant = async (
    variantId,
    data
) => {
    const existing =
        await prisma.product_variants.findUnique({
            where: {
                id: variantId,
            },
        });

    if (!existing) {
        throw new AppError(
            "Product variant not found",
            404
        );
    }

    if (data.sku) {
        const duplicate =
            await prisma.product_variants.findFirst({
                where: {
                    sku: data.sku,
                    id: {
                        not: variantId,
                    },
                },
            });

        if (duplicate) {
            throw new AppError(
                "Variant SKU already exists",
                409
            );
        }
    }

    const {
        name,
        sku,
        price,
        attributes,
        quantity,
        lowStockThreshold,
        isActive,
    } = data;

    await prisma.$transaction(async (tx) => {
        await tx.product_variants.update({
            where: {
                id: variantId,
            },
            data: {
                ...(name !== undefined && {
                    name,
                }),

                ...(sku !== undefined && {
                    sku,
                }),

                ...(price !== undefined && {
                    price,
                }),

                ...(attributes !== undefined && {
                    attributes,
                }),

                ...(isActive !== undefined && {
                    is_active: isActive,
                }),
            },
        });

        if (
            quantity !== undefined ||
            lowStockThreshold !== undefined
        ) {
            await tx.variant_inventory.update({
                where: {
                    variant_id: variantId,
                },
                data: {
                    ...(quantity !== undefined && {
                        quantity,
                    }),

                    ...(lowStockThreshold !== undefined && {
                        low_stock_threshold:
                            lowStockThreshold,
                    }),
                },
            });
        }
    });

    return getProductVariantById(
        variantId
    );
};

export const deleteProductVariant = async (
    variantId
) => {
    const variant =
        await prisma.product_variants.findUnique({
            where: {
                id: variantId,
            },
        });

    if (!variant) {
        throw new AppError(
            "Product variant not found",
            404
        );
    }

    const orderItemCount =
        await prisma.order_items.count({
            where: {
                variant_id: variantId,
            },
        });

    if (orderItemCount > 0) {
        throw new AppError(
            "Variant cannot be deleted because it has already been used in an order",
            400
        );
    }

    await prisma.product_variants.delete({
        where: {
            id: variantId,
        },
    });

    return {
        id: variantId,
    };
};