import { createClient } from "redis";
import "dotenv/config";

const redisClient = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",

    socket: {
        // Don't wait too long when trying to connect
        connectTimeout: 5000,

        // Controlled reconnect strategy
        reconnectionStrategy: (retries, cause) => {
            // Maximum delay: 3 seconds
            const delay = Math.min(
                1000 * Math.pow(2, retries),
                3000
            );

            console.log(
                `Redis reconnect attempt ${retries + 1} in ${delay}ms`
            );

            return delay;
        },
    },

    // Don't queue commands while Redis is offline.
    // cache.js handles Redis failures.
    disableOfflineQueue: true,
});

// =====================================================
// REDIS ERROR
// =====================================================

redisClient.on("error", (error) => {
    console.error("Redis Client Error:", error);
});

// =====================================================
// REDIS CONNECTING
// =====================================================

redisClient.on("connect", () => {
    console.log("Redis connecting...");
});

// =====================================================
// REDIS READY
// =====================================================

redisClient.on("ready", () => {
    console.log("Redis connected and ready");
});

// =====================================================
// REDIS RECONNECTING
// =====================================================

redisClient.on("reconnecting", () => {
    console.log("Redis reconnecting...");
});

export default redisClient;