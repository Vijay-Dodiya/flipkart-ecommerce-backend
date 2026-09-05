export const errorHandler = (err, req, res, next) => {
    console.error(err);

    if (err.code === "P2002") {
        if (err.meta?.modelName === "categories") {
            return res.status(409).json({
                success: false,
                message: "Category name or slug already exists",
            });
        }

        return res.status(409).json({
            success: false,
            message: "Email already exists",
        });
    }

    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || "Internal Server Error",
    });
};