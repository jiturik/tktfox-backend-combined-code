import { winstonLogger } from "./winstonLogger.js";

export const sendResponse = (
  res,
  statusCode = 200,
  message,
  data = null,
  status = true,
  apiVersion = process.env.API_VERSION || "v1"
) => {
  // Set status false for error codes
  if ([400, 401, 403, 404, 500].includes(statusCode)) {
    status = false;
  }

  // Handle server errors (500)
  if (statusCode === 500) {
    let errorInfo = {};

    if (data instanceof Error) {
      errorInfo = {
        message: data.message,
        stack: data.stack,
        ...(data.response?.data || {}),
      };
    } else if (typeof data === "object") {
      errorInfo = { ...data };
    } else {
      errorInfo = { error: data };
    }

    // Log error safely
    winstonLogger.error(`${message} =>`, errorInfo);

    // Send modified error response
    if (!res.headersSent) {
      return res.status(statusCode).send({
        message,
        status,
        apiVersion,
        ...errorInfo,
      });
    } else {
      winstonLogger.warn(
        `Attempted to send error response after headers already sent: ${winstonLogger.info(
          errorInfo
        )}`
      );
      return;
    }
  }

  // For normal responses, keep structure same and spread data
  if (!res.headersSent) {
    return res.status(statusCode).send({
      message,
      status,
      ...data,
      apiVersion,
    });
  } else {
    winstonLogger.warn(
      `Attempted to send response after headers already sent: ${winstonLogger.info(
        data
      )}`
    );
  }
};
