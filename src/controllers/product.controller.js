import {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
} from "../services/product.service.js";

export const createProductController = async (req, res) => {

    const { product, inventory } = await createProduct(req.body);

    res.status(201).json({
        success: true,
        message: "Product and inventory created successfully",
        product,
        inventory,
    });
};

export const getAllProductsController = async (req, res) => {

    const products = await getAllProducts();

    res.status(200).json({
        success: true,
        products,
    });
};


export const getProductByIdController = async (req, res) => {

    const product = await getProductById(
        req.params.id
    );

    res.status(200).json({
        success: true,
        product,
    });
};

export const updateProductController = async (req, res) => {

    const { product, inventory } = await updateProduct(
        req.params.id,
        req.body
    );

    res.status(200).json({
        success: true,
        message: "Product updated successfully",
        product,
        inventory,
    });
};

export const deleteProductController = async (req, res) => {

    await deleteProduct(req.params.id);

    res.status(200).json({
        success: true,
        message: "Product and inventory deleted successfully",
    });
};