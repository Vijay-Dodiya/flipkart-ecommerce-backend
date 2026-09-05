import {
    createInventory,
    getInventoryByProductId,
    updateInventory,
    deleteInventory,
} from "../services/inventory.service.js";


export const createInventoryController = async (req, res) => {

    const inventory = await createInventory(req.body);

    res.status(201).json({
        success: true,
        message: "Inventory created successfully",
        inventory,
    });
};


export const getInventoryByProductIdController = async (req, res) => {

    const inventory = await getInventoryByProductId(
        req.params.productId
    );

    res.status(200).json({
        success: true,
        inventory,
    });
};


export const updateInventoryController = async (req, res) => {

    const inventory = await updateInventory(
        req.params.productId,
        req.body
    );

    res.status(200).json({
        success: true,
        message: "Inventory updated successfully",
        inventory,
    });
};


export const deleteInventoryController = async (req, res) => {

    await deleteInventory(req.params.productId);

    res.status(200).json({
        success: true,
        message: "Inventory deleted successfully",
    });
};