export const checkValidation = (validateArray, reqObj) => {
  return new Promise((resolve, reject) => {
    try {
      for (const key of validateArray) {
        // Check if key exists in the object
        if (!reqObj.hasOwnProperty(key)) {
          return reject({
            status: false,
            message: `${key} key does not exist`,
          });
        }

        const value = reqObj[key];

        // Skip validation for boolean or number 0
        if (
          typeof value === "boolean" ||
          (typeof value === "number" && value === 0)
        ) {
          continue;
        }

        // Check for invalid or empty values
        if (
          value === "" ||
          value === null ||
          value === undefined ||
          value === "undefined" ||
          value === "null"
        ) {
          return reject({
            status: false,
            message: `${key} cannot be empty, undefined, or null`,
          });
        }
      }

      // If all validations pass
      resolve({ status: true, message: "Validation successful" });
    } catch (error) {
      // Handle unexpected errors
      console.error("Error during validation:", error);

      reject({
        status: false,
        message: "An unexpected error occurred during validation",
      });
    }
  });
};
