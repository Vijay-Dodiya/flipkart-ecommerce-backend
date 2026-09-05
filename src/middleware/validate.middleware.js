export const validate = (schema) => {
    return (req, res, next) => {
        try {
            req.body = schema.parse(req.body);

            next();

        } catch (error) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: error.issues,
            });
        }
    };
};