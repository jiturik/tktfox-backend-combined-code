import path from "path";
import multer from "multer";
import fs from "fs";
import { winstonLogger } from "./winstonLogger.js";
// import AWS from "aws-sdk";
// import s3 from "@auth0/s3";

// Define storage configuration with error handling for directory creation
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.normalize(global.__base + "/public/uploads");
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (error) {
      console.error("Error creating upload directory:", error);
      winstonLogger.error("Error in multerHelper.js 1:", error);
      cb(new Error("Failed to create upload directory"), null);
    }
  },
});

// Utility for file type validation
const validateFileType = (file, allowedExtensions, callback) => {
  try {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext) && !file.mimetype.includes("image")) {
      return callback(
        `Only the following file types are allowed: ${allowedExtensions.join(
          ", "
        )}`
      );
    }
    callback(null, true);
  } catch (error) {
    console.error("Error validating file type:", error);
    winstonLogger.error("Error in multerHelper.js 2:", error);
    callback("Error validating file type");
  }
};

// Single file upload with error handling for XLS/XLSX files
export const uploadSingleFile = multer({
  storage,
  fileFilter: (req, file, callback) => {
    validateFileType(file, [".xls", ".xlsx"], callback);
  },
}).single("file");

// Single image upload with error handling
export const uploadImage = multer({
  storage,
  fileFilter: (req, file, callback) => {
    validateFileType(file, [".png", ".jpg", ".jpeg", ".gif", ".svg"], callback);
  },
}).single("image");

// Upload file to AWS S3 with robust error handling
// export const uploadToS3 = (dirPath, originalFileName, callback) => {
//   try {
//     const folder = path.normalize(`${global.__base}/public${dirPath}`);
//     const sanitizedFileName = originalFileName.replace(/[/\\?%*:|"<>]/g, "-");
//     const finalUploadPath = `S3${dirPath}${sanitizedFileName}`;

//     const params = {
//       localFile: path.join(folder, originalFileName),
//       s3Params: {
//         Bucket: global.config.configuration.awsConfig.bucketName,
//         Key: finalUploadPath,
//       },
//     };

//     const awsS3Client = new AWS.S3(global.config.configuration.awsConfig);
//     const client = s3.createClient({
//       s3Client: awsS3Client,
//       maxAsyncS3: 20,
//       s3RetryCount: 3,
//       s3RetryDelay: 1000,
//       multipartUploadThreshold: 20971520, // 20 MB
//       multipartUploadSize: 15728640, // 15 MB
//     });

//     const uploader = client.uploadFile(params);

//     uploader.on("progress", () => {
//       console.log("Upload in progress...");
//     });

//     uploader.on("error", (error) => {
//       console.error("Error during S3 upload:", error.stack);
//       callback(new Error("Failed to upload file to S3"), null);
//     });

//     uploader.on("end", () => {
//       console.log("File successfully uploaded to S3:", finalUploadPath);
//       callback(null, finalUploadPath);
//     });
//   } catch (error) {
//     console.error("Unexpected error in uploadToS3:", error);
//     callback(new Error("Unexpected error during upload"), null);
//   }
// };
