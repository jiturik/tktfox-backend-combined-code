import Redis from "ioredis";
import { winstonLogger } from "../lib/winstonLogger.js";

export const redisConnection = () => {
  return new Promise((resolve, reject) => {
    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy: (times) => Math.min(times * 50, 2000), // Retry connection on failure
      });

      redis.on("connect", () => {
        console.log("Redis connection established.");
        resolve(redis);
      });

      redis.on("error", (error) => {
        winstonLogger.error("Error in redis.js 1:", error);
        console.error("Redis connection error:", error);
        resolve(null);
      });
    } catch (error) {
      winstonLogger.error("Error in redis.js 2:", error);
      console.error("Error initializing Redis connection:", error);
      resolve(null);
    }
  });
};
