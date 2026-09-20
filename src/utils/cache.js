import redisClient from "../config/redis.js";

/*
|--------------------------------------------------------------------------
| Generic Redis Cache Helpers
|--------------------------------------------------------------------------
|
| These functions are reusable throughout the entire application.
|
| getCache()    -> Reads a value from Redis
| setCache()    -> Stores a value in Redis with TTL
| deleteCache() -> Deletes a specific Redis key
|
|--------------------------------------------------------------------------
*/


// ========================================================================
// GET CACHE
// ========================================================================

export const getCache = async (key) => {
    try {
        /*
         * Redis stores values as strings.
         *
         * We are intentionally keeping this helper generic.
         * The caller decides whether the value needs JSON.parse().
         */
        return await redisClient.get(key);

    } catch (error) {

        /*
         * Redis should not bring down our application.
         *
         * If Redis is unavailable, return null so the application
         * can continue by getting fresh data from PostgreSQL.
         */
        console.error(
            `Redis GET failed for key "${key}":`,
            error.message
        );

        return null;
    }
};


// ========================================================================
// SET CACHE
// ========================================================================

export const setCache = async (key, value, ttl) => {
    try {

        /*
         * Store the value in Redis.
         *
         * EX = expiration time in seconds.
         *
         * Example:
         * ttl = 60
         *
         * Redis will automatically remove the key after 60 seconds.
         */
        await redisClient.set(key, value, {
            EX: ttl,
        });

        return true;

    } catch (error) {

        /*
         * If Redis fails, we don't want the API request to fail.
         *
         * PostgreSQL remains our source of truth.
         */
        console.error(
            `Redis SET failed for key "${key}":`,
            error.message
        );

        return false;
    }
};


// ========================================================================
// DELETE CACHE
// ========================================================================

export const deleteCache = async (key) => {
    try {

        /*
         * Delete one specific Redis key.
         */
        await redisClient.del(key);

        return true;

    } catch (error) {

        console.error(
            `Redis DELETE failed for key "${key}":`,
            error.message
        );

        return false;
    }
};


/*
|--------------------------------------------------------------------------
| PRODUCT LIST CACHE VERSIONING
|--------------------------------------------------------------------------
|
| Why do we need this?
|
| Our product list can have thousands of different combinations:
|
| /products?brand=Samsung
| /products?brand=Apple
| /products?category=mobiles-tablets
| /products?minPrice=20000&maxPrice=50000
| /products?page=2&sort=price_asc
|
| Deleting every product-list cache key whenever a product changes
| would become expensive.
|
| Instead, we maintain one VERSION number.
|
| Example:
|
| products:list:version = 1
|
| Product is updated
|        ↓
| products:list:version = 2
|
| Now our application only reads cache keys belonging to version 2.
|
| Old version 1 cache entries become unused automatically.
|
|--------------------------------------------------------------------------
*/


// ========================================================================
// PRODUCT LIST CACHE VERSION KEY
// ========================================================================

const PRODUCT_LIST_VERSION_KEY = "products:list:version";


// ========================================================================
// GET CURRENT PRODUCT LIST CACHE VERSION
// ========================================================================

export const getProductListCacheVersion = async () => {
    try {

        /*
         * Try to get the current version from Redis.
         */
        const version = await redisClient.get(
            PRODUCT_LIST_VERSION_KEY
        );


        /*
         * If the version does not exist yet,
         * initialize it with version 1.
         */
        if (!version) {

            await redisClient.set(
                PRODUCT_LIST_VERSION_KEY,
                "1"
            );

            return 1;
        }


        /*
         * Redis returns strings.
         *
         * Convert the version into a JavaScript number.
         */
        return Number(version);

    } catch (error) {

        /*
         * If Redis is unavailable, return version 1.
         *
         * This allows the application to continue working.
         */
        console.error(
            "Redis GET product list version failed:",
            error.message
        );

        return 1;
    }
};


// ========================================================================
// INVALIDATE PRODUCT LIST CACHE
// ========================================================================

export const invalidateProductListCache = async () => {
    try {

        /*
         * Incrementing the version invalidates all existing
         * product-list cache entries logically.
         *
         * Example:
         *
         * v1 → v2
         * v2 → v3
         * v3 → v4
         */
        await redisClient.incr(
            PRODUCT_LIST_VERSION_KEY
        );

        return true;

    } catch (error) {

        /*
         * Redis failure should not break product creation,
         * update, or deletion.
         */
        console.error(
            "Redis product list cache invalidation failed:",
            error.message
        );

        return false;
    }
};