export const validate = (schema, source = "body") => {
  return (req, res, next) => {
    try {
      const parsedData = schema.parse(req[source]);

      if (source === "query") {
        Object.defineProperty(req, "query", {
          value: parsedData,
          writable: true,
          configurable: true,
        });
      } else {
        req[source] = parsedData;
      }

      next();
    } catch (error) {
      console.log("VALIDATION ERROR:", error);

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.issues || error.message,
      });
    }
  };
};