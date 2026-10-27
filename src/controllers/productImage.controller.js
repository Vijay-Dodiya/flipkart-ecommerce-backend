import {
    createProductImage,
    getProductImages,
    getProductImageById,
    updateProductImage,
    deleteProductImage,
    setPrimaryProductImage,
} from "../services/productImage.service.js";

import {
    createProductImageSchema,
    updateProductImageSchema,
} from "../schemas/productImage.schema.js";

export const createImage = async (req, res, next) => {
    try {
        const { productId } = req.params;

        const validatedData =
            createProductImageSchema.parse(req.body);

        const image = await createProductImage(
            productId,
            validatedData,
        );

        res.status(201).json({
            success: true,
            message: "Product image created successfully",
            data: image,
        });
    } catch (error) {
        next(error);
    }
};

export const getImages = async (req, res, next) => {
    try {
        const { productId } = req.params;

        const images = await getProductImages(productId);

        res.status(200).json({
            success: true,
            data: images,
        });
    } catch (error) {
        next(error);
    }
};

export const getImage = async (req, res, next) => {
    try {
        const { productId, imageId } = req.params;

        const image = await getProductImageById(
            productId,
            imageId,
        );

        res.status(200).json({
            success: true,
            data: image,
        });
    } catch (error) {
        next(error);
    }
};

export const updateImage = async (req, res, next) => {
    try {
        const { productId, imageId } = req.params;

        const validatedData =
            updateProductImageSchema.parse(req.body);

        const image = await updateProductImage(
            productId,
            imageId,
            validatedData,
        );

        res.status(200).json({
            success: true,
            message: "Product image updated successfully",
            data: image,
        });
    } catch (error) {
        next(error);
    }
};

export const deleteImage = async (req, res, next) => {
    try {
        const { productId, imageId } = req.params;

        const result = await deleteProductImage(
            productId,
            imageId,
        );

        res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        next(error);
    }
};

export const setPrimaryImage = async (req, res, next) => {
    try {
        const { productId, imageId } = req.params;

        const image = await setPrimaryProductImage(
            productId,
            imageId,
        );

        res.status(200).json({
            success: true,
            message: "Primary product image updated successfully",
            data: image,
        });
    } catch (error) {
        next(error);
    }
};