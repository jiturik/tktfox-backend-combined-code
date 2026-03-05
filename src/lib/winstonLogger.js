import winston from "winston";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Fix __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the logs directory exists
const logsDir = path.resolve(__dirname, "winston-logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Function to get the log file name for the current month
const getLogFileName = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `logs-${year}-${month}.log`;
};

// Safe stringify function to handle circular references
const safeStringify = (obj) => {
  const seen = new WeakSet();
  try {
    return JSON.stringify(obj, function (key, value) {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    });
  } catch {
    return String(obj);
  }
};

// Create and configure the logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(
      (info) =>
        `${info.timestamp} [${info.level.toUpperCase()}]: ${safeStringify(
          info.message
        )}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logsDir, getLogFileName()),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 12,
    }),
  ],
});

// Utility function to stringify both message and error
const formatLog = (message, error) => safeStringify({ message, error });

// Exported logger utility
export const winstonLogger = {
  info: (message) => logger.info(safeStringify(message)),
  warn: (message) => logger.warn(safeStringify(message)),
  debug: (message) => logger.debug(safeStringify(message)),
  error: (message, error) => logger.error(formatLog(message, error)),
};
