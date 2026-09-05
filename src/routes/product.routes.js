import express from "express";

import {
    createProductController,
    getAllProductsController,
    getProductByIdController,
    updateProductController,
    deleteProductController,
} from "../controllers/product.controller.js";

import { updateProductSchema } from "../schemas/update-product.schema.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

import { productSchema } from "../schemas/product.schema.js";

const router = express.Router();

router.post(
    "/",
    authenticate,
    authorize("admin"),
    validate(productSchema),
    createProductController
);

router.get(
    "/",
    getAllProductsController
);

router.get(
    "/:id",
    getProductByIdController
);

router.put(
    "/:id",
    authenticate,
    authorize("admin"),
    validate(updateProductSchema),
    updateProductController
);

router.delete(
    "/:id",
    authenticate,
    authorize("admin"),
    deleteProductController
);

export default router;