import redisClient from "../config/redis.js";

export const getCache = async (key) => {
    try {
        return await redisClient.get(key);
    } catch (error) {
        console.error(`Redis GET failed for key "${key}":`, error.message);

        return null;
    }
};

export const setCache = async (key, value, ttl) => {
    try {
        await redisClient.set(key, value, {
            EX: ttl,
        });

        return true;
    } catch (error) {
        console.error(`Redis SET failed for key "${key}":`, error.message);

        return false;
    }
};

export const deleteCache = async (key) => {
    try {
        await redisClient.del(key);

        return true;
    } catch (error) {
        console.error(`Redis DELETE failed for key "${key}":`, error.message);

        return false;
    }
};