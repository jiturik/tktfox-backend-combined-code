import QRCode from "qrcode";
import { winstonLogger } from "./winstonLogger.js";

var opts = {
  errorCorrectionLevel: "H",
  type: "image/jpeg",
  quality: 0.3,
  margin: 1,
  width: "100",
  color: {
    dark: "#000000",
    light: "#FFFFFF",
  },
};

export async function createQRCode(
  qrcode_data,
  returnType = "buffer",
  logo = null
) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!qrcode_data) {
        console.error("QR code data is required.");
        return;
      }

      await QRCode.toDataURL(qrcode_data, opts)
        .then((qrcode) => {
          resolve(qrcode);
        })
        .catch((error) => {
          winstonLogger.error("Error in QrcodeGenerator.js 1:", error);
          console.error("Error creating QR code:", error.message);
          reject(
            new Error(
              "Failed to create QR code. Please check your input and try again."
            )
          );
        });
    } catch (error) {
      winstonLogger.error("Error in QrcodeGenerator.js 2:", error);
      console.error("Error creating QR code:", error.message);
      reject(
        new Error(
          "Failed to create QR code. Please check your input and try again."
        )
      );
    }
  });
}
