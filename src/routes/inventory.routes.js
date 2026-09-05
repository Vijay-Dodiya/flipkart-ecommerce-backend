import express from "express";

import {
    createInventoryController,
    getInventoryByProductIdController,
    updateInventoryController,
    deleteInventoryController,
} from "../controllers/inventory.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

import { inventorySchema } from "../schemas/inventory.schema.js";

const router = express.Router();


// Create Inventory
router.post(
    "/",
    authenticate,
    authorize("admin"),
    validate(inventorySchema),
    createInventoryController
);


// Get Inventory
router.get(
    "/:productId",
    authenticate,
    authorize("admin"),
    getInventoryByProductIdController
);


// Update Inventory
router.put(
    "/:productId",
    authenticate,
    authorize("admin"),
    updateInventoryController
);


// Delete Inventory
router.delete(
    "/:productId",
    authenticate,
    authorize("admin"),
    deleteInventoryController
);


export default router;