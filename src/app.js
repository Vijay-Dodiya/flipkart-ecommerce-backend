import dotenv from "dotenv";
import express from "express";
import connectMongoDB from "./config/mongodb.js";
import pool from "./config/database.js";
import userRoutes from "./routes/user.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";
import categoryRoutes from "./routes/category.routes.js";
import productRoutes from "./routes/product.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";

dotenv.config();

const app = express();

app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Flipkart E-Commerce Backend is running!"
    });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectMongoDB();

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});