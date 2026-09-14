import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger.js";
import pool from "./config/database.js";
import connectMongoDB from "./config/mongodb.js";

import userRoutes from "./routes/user.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import productRoutes from "./routes/product.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";
import paymentRoutes from "./routes/payment.routes.js";

import { errorHandler } from "./middleware/error.middleware.js";
import webhookRoutes from "./routes/webhook.routes.js";

import redisClient from "./config/redis.js";

dotenv.config();

const app = express();

app.use(helmet());

// --------------------------------------------------
// WEBHOOK ROUTES
// Must come before express.json()
// --------------------------------------------------

app.use("/api/webhooks", webhookRoutes);

app.use(express.json());

app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
);

// --------------------------------------------------
// MEMORY RATE LIMITER
// --------------------------------------------------

const createMemoryRateLimiter = () => {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,

        standardHeaders: "draft-8",
        legacyHeaders: false,

        message: {
            success: false,
            message: "Too many requests, please try again later.",
        },
    });
};

// --------------------------------------------------
// REDIS RATE LIMITER
// --------------------------------------------------

const createRedisRateLimiter = () => {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,

        standardHeaders: "draft-8",
        legacyHeaders: false,

        passOnStoreError: true,

        store: new RedisStore({
            sendCommand: (...args) =>
                redisClient.sendCommand(args),

            prefix: "ratelimit:",
        }),

        message: {
            success: false,
            message: "Too many requests, please try again later.",
        },
    });
};

// --------------------------------------------------
// RATE LIMITER STATE
// --------------------------------------------------

let apiLimiter = createMemoryRateLimiter();

let redisRateLimiterCreated = false;

// --------------------------------------------------
// SWITCH TO REDIS RATE LIMITER
// --------------------------------------------------

const switchToRedisRateLimiter = () => {

    if (!redisClient.isReady) {
        return;
    }

    if (redisRateLimiterCreated) {
        return;
    }

    try {

        apiLimiter = createRedisRateLimiter();

        redisRateLimiterCreated = true;

        console.log(
            "Redis is ready. Switched to Redis-backed rate limiter."
        );

    } catch (error) {

        console.error(
            "Failed to create Redis rate limiter:",
            error.message
        );

    }
};

// --------------------------------------------------
// REDIS READY EVENT
// --------------------------------------------------

redisClient.on("ready", () => {

    console.log(
        "Redis ready event received."
    );

    switchToRedisRateLimiter();
});

// --------------------------------------------------
// API RATE LIMITER
// --------------------------------------------------

app.use("/api", (req, res, next) => {

    return apiLimiter(req, res, next);

});

// --------------------------------------------------
// ROUTES
// --------------------------------------------------

app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);

// --------------------------------------------------
// ROOT ROUTE
// --------------------------------------------------

app.get("/", (req, res) => {

    res.json({
        success: true,
        message: "Flipkart E-Commerce Backend is running!"
    });

});

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use(errorHandler);

// --------------------------------------------------
// SERVER
// --------------------------------------------------

const PORT = process.env.PORT || 5000;

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

const startServer = async () => {

    try {

        // ------------------------------------------
        // MongoDB
        // ------------------------------------------

        await connectMongoDB();

        // ------------------------------------------
        // Redis
        // ------------------------------------------

        try {

            if (!redisClient.isOpen) {

                const redisConnectionAttempt =
                    redisClient.connect();

                await Promise.race([

                    redisConnectionAttempt,

                    new Promise((_, reject) => {

                        setTimeout(() => {

                            reject(
                                new Error(
                                    "Redis connection timeout"
                                )
                            );

                        }, 3000);

                    }),

                ]);

            }

        } catch (error) {

            console.error(
                "Redis unavailable at startup. Using memory rate limiter."
            );

            console.error(
                error.message
            );

        }

        // ------------------------------------------
        // Check Redis after connection attempt
        // ------------------------------------------

        if (redisClient.isReady) {

            switchToRedisRateLimiter();

        } else {

            console.log(
                "Using memory rate limiter until Redis becomes available."
            );

        }

        // ------------------------------------------
        // Start HTTP server
        // ------------------------------------------

        app.listen(PORT, () => {

            console.log(
                `Server running on port ${PORT}`
            );

        });

    } catch (error) {

        console.error(
            "Failed to start server:",
            error
        );

        process.exit(1);

    }

};

startServer();
