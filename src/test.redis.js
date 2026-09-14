import redisClient from "./config/redis.js";

const testRedis = async () => {
    try {
        const key = "test:key";

        await redisClient.set(key, "Hello Redis!");

        const value = await redisClient.get(key);

        console.log("Redis value:", value);

        await redisClient.del(key);
    } catch (error) {
        console.error("Redis test failed:", error);
    }
};

testRedis();