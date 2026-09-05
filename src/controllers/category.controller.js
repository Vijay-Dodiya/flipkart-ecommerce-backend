import {
    createCategory,
    getCategories,
    getCategoryById,
    getCategoryChildren,
    updateCategory,
    deleteCategory
} from "../services/category.service.js";

export const createCategoryController = async (req, res) => {
    const category = await createCategory(req.body);

    res.status(201).json({
        success: true,
        message: "Category created successfully",
        category,
    });
};

export const getCategoriesController = async (req, res) => {
    const categories = await getCategories();

    res.status(200).json({
        success: true,
        message: "Categories fetched successfully",
        categories,
    });
};

export const getCategoryByIdController = async (req, res) => {
    const category = await getCategoryById(req.params.id);

    res.status(200).json({
        success: true,
        message: "Category fetched successfully",
        category,
    });
};

export const getCategoryChildrenController = async (req, res) => {
    const children = await getCategoryChildren(req.params.id);

    res.status(200).json({
        success: true,
        message: "Category children fetched successfully",
        categories: children,
    });
};

export const updateCategoryController = async (req, res) => {
    const category = await updateCategory(
        req.params.id,
        req.body
    );

    res.status(200).json({
        success: true,
        message: "Category updated successfully",
        category,
    });
};

export const deleteCategoryController = async (req, res) => {
    const category = await deleteCategory(req.params.id);

    res.status(200).json({
        success: true,
        message: "Category deleted successfully",
        category,
    });
};