import { asyncHandler } from "../utils/asyncHandler.js";

import {
    createProductVariant,
    getProductVariants,
    getProductVariantById,
    updateProductVariant,
    deleteProductVariant,
} from "../services/productVariant.service.js";

export const createProductVariantController =
    asyncHandler(async (req, res) => {
        const variant =
            await createProductVariant(
                req.body
            );

        res.status(201).json({
            success: true,
            message:
                "Product variant created successfully",
            data: variant,
        });
    });

export const getProductVariantsController =
    asyncHandler(async (req, res) => {
        const { productId } = req.params;

        const variants =
            await getProductVariants(
                productId
            );

        res.status(200).json({
            success: true,
            message:
                "Product variants fetched successfully",
            data: variants,
        });
    });

export const getProductVariantByIdController =
    asyncHandler(async (req, res) => {
        const { variantId } = req.params;

        const variant =
            await getProductVariantById(
                variantId
            );

        res.status(200).json({
            success: true,
            message:
                "Product variant fetched successfully",
            data: variant,
        });
    });

export const updateProductVariantController =
    asyncHandler(async (req, res) => {
        const { variantId } = req.params;

        const variant =
            await updateProductVariant(
                variantId,
                req.body
            );

        res.status(200).json({
            success: true,
            message:
                "Product variant updated successfully",
            data: variant,
        });
    });

export const deleteProductVariantController =
    asyncHandler(async (req, res) => {
        const { variantId } = req.params;

        const result =
            await deleteProductVariant(
                variantId
            );

        res.status(200).json({
            success: true,
            message:
                "Product variant deleted successfully",
            data: result,
        });
    });