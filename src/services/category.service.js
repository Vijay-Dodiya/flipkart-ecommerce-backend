import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";

export const createCategory = async (categoryData) => {
    if (categoryData.parent_id) {
        const parentCategory = await prisma.categories.findUnique({
            where: {
                id: categoryData.parent_id,
            },
        });

        if (!parentCategory) {
            throw new AppError("Parent category not found", 404);
        }
    }

    const category = await prisma.categories.create({
        data: categoryData,
    });

    return category;
};

export const getCategories = async () => {
    const categories = await prisma.categories.findMany({
        orderBy: {
            created_at: "asc",
        },
    });

    const categoryMap = new Map();

    categories.forEach((category) => {
        categoryMap.set(category.id, {
            ...category,
            children: [],
        });
    });

    const rootCategories = [];

    categories.forEach((category) => {
        if (category.parent_id === null) {
            rootCategories.push(categoryMap.get(category.id));
        } else {
            const parent = categoryMap.get(category.parent_id);

            if (parent) {
                parent.children.push(categoryMap.get(category.id));
            }
        }
    });

    return rootCategories;
};

export const getCategoryById = async (id) => {
    const category = await prisma.categories.findUnique({
        where: {
            id: id,
        },
    });

    if (!category) {
        throw new AppError("Category not found", 404);
    }

    return category;
};

export const getCategoryChildren = async (id) => {
    const category = await prisma.categories.findUnique({
        where: {
            id: id,
        },
    });

    if (!category) {
        throw new AppError("Category not found", 404);
    }

    const children = await prisma.categories.findMany({
        where: {
            parent_id: id,
        },
        orderBy: {
            created_at: "asc",
        },
    });

    return children;
};

export const updateCategory = async (id, categoryData) => {
    const category = await prisma.categories.findUnique({
        where: {
            id: id,
        },
    });

    if (!category) {
        throw new AppError("Category not found", 404);
    }

    // Prevent category from becoming its own parent
    if (categoryData.parent_id === id) {
        throw new AppError(
            "A category cannot be its own parent",
            400
        );
    }

    // Prevent circular category hierarchy
    if (categoryData.parent_id) {
        let currentParentId = categoryData.parent_id;

        while (currentParentId) {
            if (currentParentId === id) {
                throw new AppError(
                    "Cannot create circular category hierarchy",
                    400
                );
            }

            const parentCategory = await prisma.categories.findUnique({
                where: {
                    id: currentParentId,
                },
                select: {
                    parent_id: true,
                },
            });

            if (!parentCategory) {
                throw new AppError(
                    "Parent category not found",
                    404
                );
            }

            currentParentId = parentCategory.parent_id;
        }
    }

    const updatedCategory = await prisma.categories.update({
        where: {
            id: id,
        },
        data: categoryData,
    });

    return updatedCategory;
};

export const deleteCategory = async (id) => {
    const category = await prisma.categories.findUnique({
        where: {
            id: id,
        },
    });

    if (!category) {
        throw new AppError("Category not found", 404);
    }

    const children = await prisma.categories.findFirst({
        where: {
            parent_id: id,
        },
    });

    if (children) {
        throw new AppError(
            "Cannot delete category with child categories",
            409
        );
    }

    await prisma.categories.delete({
        where: {
            id: id,
        },
    });

    return category;
};