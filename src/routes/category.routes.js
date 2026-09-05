import express from "express";
import {
    createCategoryController,
    getCategoriesController,
    getCategoryByIdController,
    getCategoryChildrenController,
    updateCategoryController,
    deleteCategoryController
} from "../controllers/category.controller.js";

import { validate } from "../middleware/validate.middleware.js";
import { categorySchema,
    updateCategorySchema } from "../schemas/category.schema.js";

const router = express.Router();

router.get("/", getCategoriesController);

router.get("/:id", getCategoryByIdController);

router.get("/:id/children", getCategoryChildrenController);

router.post(
    "/",
    validate(categorySchema),
    createCategoryController
);

router.put(
    "/:id",
    validate(updateCategorySchema),
    updateCategoryController
);

router.delete("/:id", deleteCategoryController);

export default router;