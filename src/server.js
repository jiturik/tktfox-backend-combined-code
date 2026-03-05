import http from "http";
import app from "./app.js";
import { KnexConnection } from "../src/knex/knex.js";
import { redisConnection } from "./redis/redis.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { winstonLogger } from "./lib/winstonLogger.js";

const EXPRESS_PORT = process.env.EXPRESS_PORT || 3000;
const httpServer = http.createServer(app);

async function startServer() {
  try {
    // Initialize DB
    const db = await KnexConnection();
    global.knexConnection = db;

    // Initialize Redis
    try {
      const redis = await redisConnection();
      if (redis) {
        global.redisCache = redis;
        console.log("✅ Redis connection established.");
      } else {
        global.redisCache = null;
        console.warn("⚠️ Redis connection failed. Continuing without Redis.");
        winstonLogger.warn(
          "Redis connection returned null, continuing without Redis."
        );
      }
    } catch (redisError) {
      global.redisCache = null;
      console.warn("⚠️ Redis unavailable:", redisError.message);
      winstonLogger.warn(
        "Redis connection failed, continuing execution.",
        redisError
      );
    }

    // Set global base path
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    global.__base = __dirname;

    // Load global options
    const globalOptions = await global.knexConnection("global_options");
    global.globalOptions = Object.fromEntries(
      globalOptions.map((row) => [row.go_key, row.go_value])
    );

    // Import cron jobs
    import("./cron/index.js");

    // Start HTTP server
    httpServer.listen(EXPRESS_PORT, () => {
      console.log(`Server running on port ${EXPRESS_PORT}`);
      winstonLogger.info(`Server started on port ${EXPRESS_PORT}`);
    });
  } catch (error) {
    winstonLogger.error("Failed to start server:", error);
    console.error("Critical error during startup:", error);
    process.exit(1);
  }
}

startServer();
