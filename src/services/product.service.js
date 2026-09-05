import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import slugify from "../utils/slugify.js";

export const createProduct = async (productData) => {

    // Separate quantity because it belongs to inventory,
    // not the products table
    const { quantity, ...productFields } = productData;

    // Everything below happens inside one transaction
    const result = await prisma.$transaction(async (tx) => {

        // 1. Check if category exists
        const category = await tx.categories.findUnique({
            where: {
                id: productFields.category_id,
            },
        });

        if (!category) {
            throw new AppError("Category not found", 404);
        }

        // 2. Generate base slug
        const baseSlug = slugify(productFields.name);

        // 3. Start with base slug
        let slug = baseSlug;
        let counter = 2;

        // 4. Make sure slug is unique
        while (
            await tx.products.findUnique({
                where: {
                    slug: slug,
                },
            })
        ) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        // 5. Create product
        const product = await tx.products.create({
            data: {
                ...productFields,
                slug: slug,
            },
        });

        // 6. Create inventory automatically
        const inventory = await tx.inventory.create({
            data: {
                product_id: product.id,
                quantity: quantity,
                reserved_quantity: 0,
                low_stock_threshold: 10,
            },
        });

        // 7. Return both
        return {
            product,
            inventory,
        };
    });

    return result;
};

export const getAllProducts = async () => {

    const products = await prisma.products.findMany({
        include: {
            categories: true,
            inventory: true,
        },
        orderBy: {
            created_at: "desc",
        },
    });

    return products;
};


export const getProductById = async (productId) => {

    const product = await prisma.products.findUnique({
        where: {
            id: productId,
        },
        include: {
            categories: true,
            inventory: true,
        },
    });

    if (!product) {
        throw new AppError("Product not found", 404);
    }

    return product;
};

export const updateProduct = async (productId, productData) => {

    // Separate quantity because it belongs to inventory
    const { quantity, ...productFields } = productData;

    const result = await prisma.$transaction(async (tx) => {

        // 1. Check if product exists
        const existingProduct = await tx.products.findUnique({
            where: {
                id: productId,
            },
        });

        if (!existingProduct) {
            throw new AppError("Product not found", 404);
        }

        // 2. If category is being changed, check that it exists
        if (productFields.category_id) {

            const category = await tx.categories.findUnique({
                where: {
                    id: productFields.category_id,
                },
            });

            if (!category) {
                throw new AppError("Category not found", 404);
            }
        }

        // 3. If SKU is being changed, check if it is already used
        if (productFields.sku) {

            const existingSku = await tx.products.findFirst({
                where: {
                    sku: productFields.sku,
                    NOT: {
                        id: productId,
                    },
                },
            });

            if (existingSku) {
                throw new AppError("SKU already exists", 409);
            }
        }

        // 4. If name is being changed, generate a new slug
        let slug;

        if (productFields.name) {

            const baseSlug = slugify(productFields.name);

            slug = baseSlug;
            let counter = 2;

            while (
                await tx.products.findFirst({
                    where: {
                        slug: slug,
                        NOT: {
                            id: productId,
                        },
                    },
                })
            ) {
                slug = `${baseSlug}-${counter}`;
                counter++;
            }
        }

        // 5. Update product
        const product = await tx.products.update({
            where: {
                id: productId,
            },
            data: {
                ...productFields,
                ...(slug && { slug }),
            },
        });

        // 6. Update inventory if quantity was provided
        let inventory = await tx.inventory.findUnique({
            where: {
                product_id: productId,
            },
        });

        if (!inventory) {
            throw new AppError("Inventory not found", 404);
        }

        if (quantity !== undefined) {

            inventory = await tx.inventory.update({
                where: {
                    product_id: productId,
                },
                data: {
                    quantity: quantity,
                },
            });
        }

        // 7. Return both
        return {
            product,
            inventory,
        };
    });

    return result;
};

export const deleteProduct = async (productId) => {

    const result = await prisma.$transaction(async (tx) => {

        // 1. Check if product exists
        const product = await tx.products.findUnique({
            where: {
                id: productId,
            },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        // 2. Check if inventory exists
        const inventory = await tx.inventory.findUnique({
            where: {
                product_id: productId,
            },
        });

        // 3. Delete inventory first
        if (inventory) {
            await tx.inventory.delete({
                where: {
                    product_id: productId,
                },
            });
        }

        // 4. Delete product
        await tx.products.delete({
            where: {
                id: productId,
            },
        });

        return true;
    });

    return result;
};