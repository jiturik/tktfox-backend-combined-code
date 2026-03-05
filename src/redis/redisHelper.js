import { winstonLogger } from "../lib/winstonLogger.js";

// Fetch data from Redis
export const getFromRedis = async (cacheKey) => {
  try {
    const redisOrgKey = process.env.REDIS_CLIENT_NAME;
    if (!redisOrgKey) {
      console.log("Redis client name is not set.");
      return null;
    }

    if (!global.redisCache) {
      console.warn("Redis client is not initialized.");
      return null;
    }

    const cacheKeyNew = `${redisOrgKey}:${cacheKey}`;
    const cachedData = await global.redisCache.get(cacheKeyNew);

    if (cachedData) {
      try {
        return JSON.parse(cachedData);
      } catch (parseErr) {
        winstonLogger.error(
          `Error parsing cached data for key: ${cacheKeyNew}`,
          parseErr
        );
        return null;
      }
    }

    return null;
  } catch (error) {
    winstonLogger.error("Error in redisHelper.js (getFromRedis):", error);
    console.error("Error fetching data from Redis:", error);
    return null;
  }
};

// Store data in Redis
export const storeInRedis = async (key, value, expiration) => {
  try {
    const redisOrgKey = process.env.REDIS_CLIENT_NAME;
    if (!redisOrgKey || !global.redisCache) return;

    const cacheKeyNew = `${redisOrgKey}:${key}`;
    const stringValue = JSON.stringify(value);

    if (expiration) {
      await global.redisCache.set(cacheKeyNew, stringValue, "EX", expiration);
    } else {
      await global.redisCache.set(cacheKeyNew, stringValue);
    }

    console.log(`Data stored in Redis: ${cacheKeyNew}`);
  } catch (err) {
    winstonLogger.error("Error in redisHelper.js (storeInRedis):", err);
    console.error("Error storing data in Redis:", err);
  }
};

// Remove key from Redis
export const removeFromRedis = async (key) => {
  try {
    const redisOrgKey = process.env.REDIS_CLIENT_NAME;
    if (!redisOrgKey || !global.redisCache) return;

    const cacheKeyNew = `${redisOrgKey}:${key}`;
    const result = await global.redisCache.del(cacheKeyNew);

    if (result === 1) {
      console.log(`Data removed from Redis: ${cacheKeyNew}`);
    } else {
      console.log(`Key not found in Redis: ${cacheKeyNew}`);
    }
  } catch (err) {
    winstonLogger.error("Error in redisHelper.js (removeFromRedis):", err);
    console.error("Error removing data from Redis:", err);
  }
};

// Close Redis connection
export const closeRedisConnection = async () => {
  try {
    if (!global.redisCache) return;
    await global.redisCache.quit();
    console.log("Redis connection closed");
  } catch (err) {
    winstonLogger.error("Error in redisHelper.js (closeRedisConnection):", err);
    console.error("Error closing Redis connection:", err);
  }
};
