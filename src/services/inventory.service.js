import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";

export const createInventory = async (inventoryData) => {

    // 1. Check if product exists
    const product = await prisma.products.findUnique({
        where: {
            id: inventoryData.product_id,
        },
    });

    if (!product) {
        throw new AppError("Product not found", 404);
    }

    // 2. Check if inventory already exists
    const existingInventory = await prisma.inventory.findUnique({
        where: {
            product_id: inventoryData.product_id,
        },
    });

    if (existingInventory) {
        throw new AppError(
            "Inventory already exists for this product",
            409
        );
    }

    // 3. Create inventory
    const inventory = await prisma.inventory.create({
        data: inventoryData,
    });

    return inventory;
};


export const getInventoryByProductId = async (productId) => {

    const inventory = await prisma.inventory.findUnique({
        where: {
            product_id: productId,
        },
    });

    if (!inventory) {
        throw new AppError("Inventory not found", 404);
    }

    return inventory;
};


export const updateInventory = async (productId, inventoryData) => {

    // 1. Check if inventory exists
    const existingInventory = await prisma.inventory.findUnique({
        where: {
            product_id: productId,
        },
    });

    if (!existingInventory) {
        throw new AppError("Inventory not found", 404);
    }

    // 2. Get final values
    const quantity =
        inventoryData.quantity ?? existingInventory.quantity;

    const reservedQuantity =
        inventoryData.reserved_quantity ??
        existingInventory.reserved_quantity;

    // 3. Validate reserved quantity
    if (reservedQuantity > quantity) {
        throw new AppError(
            "Reserved quantity cannot be greater than quantity",
            400
        );
    }

    // 4. Update inventory
    const inventory = await prisma.inventory.update({
        where: {
            product_id: productId,
        },
        data: inventoryData,
    });

    return inventory;
};


export const deleteInventory = async (productId) => {

    // 1. Check if inventory exists
    const existingInventory = await prisma.inventory.findUnique({
        where: {
            product_id: productId,
        },
    });

    if (!existingInventory) {
        throw new AppError("Inventory not found", 404);
    }

    // 2. Delete inventory
    await prisma.inventory.delete({
        where: {
            product_id: productId,
        },
    });

    return true;
};