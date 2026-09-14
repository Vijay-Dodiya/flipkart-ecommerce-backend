export const errorHandler = (err, req, res, next) => {
    console.error(err);

    // Prisma: Duplicate value
    if (err.code === "P2002") {
        const target = err.meta?.target;

        if (target?.includes("email")) {
            return res.status(409).json({
                success: false,
                message: "Email already exists",
            });
        }

        if (target?.includes("name") || target?.includes("slug")) {
            return res.status(409).json({
                success: false,
                message: "Category name or slug already exists",
            });
        }

        if (target?.includes("sku")) {
            return res.status(409).json({
                success: false,
                message: "Product SKU already exists",
            });
        }

        return res.status(409).json({
            success: false,
            message: "Duplicate value already exists",
        });
    }

    // Prisma: Invalid ID / UUID
    if (err.code === "P2023") {
        return res.status(400).json({
            success: false,
            message: "Invalid ID format",
        });
    }

    // Custom application errors
    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || "Internal Server Error",
    });
};