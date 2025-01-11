import path from "path";
import fs from "fs";

// uploadSingleFile
var { uploadSingleFile, uploadImage, uploadToS3 } = import(
  "./MulterHelper-YYVnDSxB.js"
);

async function uploadFile(req, res) {
  try {
    const imageBaseURL = `http://localhost:5000`;

    // Upload file
    uploadSingleFile(req, res, (uploadFileError) => {
      if (uploadFileError) {
        return res.status(400).json({
          status: false,
          message: "Error uploading file",
          error: uploadFileError,
        });
      }

      let SetPath = "";
      if (req.body.filePath === "Bin Numbers File") {
        SetPath = "/binnumber/"; // For Add & Edit Bin Numbers
      }

      // Sanitize file name
      const a = req.file.originalname;
      const fileExtension = a.split(/[. ]+/).pop();
      const withoutExtensionName = a.split(".").slice(0, -1).join(".");
      const sanitizedFileName =
        withoutExtensionName
          .toLowerCase()
          .split(" ")
          .join("_")
          .replace(/[^a-z0-9_]/gi, "") + `.${fileExtension}`;

      req.file.originalname = sanitizedFileName;

      const existingFile = `${global.__base}/public/uploads/${req.file.filename}`;
      const targetDirectory = `${global.__base}/public${SetPath}`;

      // Ensure target folder exists
      if (!fs.existsSync(targetDirectory)) {
        fs.mkdirSync(targetDirectory, { recursive: true });
      }

      const newFileName = `${Date.now()}-${sanitizedFileName}`;
      const storInto = `${SetPath}${newFileName}`;

      // Rename the file and move it
      fs.rename(existingFile, `${global.__base}/public${storInto}`, (error) => {
        if (error) {
          return res.status(500).json({
            status: false,
            message: "File renaming and uploading failed",
            error,
          });
        }

        // If S3 upload is enabled, upload to S3
        if (false);
        else {
          return res.status(200).json({
            status: true,
            message: "File uploaded successfully to server",
            imageBaseURL,
            path: storInto,
          });
        }
      });
    });
  } catch (error) {
    console.error("Error during file upload:", error);
    return res.status(500).json({
      status: false,
      message: "Unexpected error occurred during file upload",
      error,
    });
  }
}

async function uploadImageController(req, res) {
  try {
    const { BASE_URL_BACKEND, S3_UPLOAD } = global.globalOptions;
    const imageBaseURL = BASE_URL_BACKEND;
    let SetPath = "/uploads/";

    // Handle image upload
    uploadImage(req, res, (uploadImageError) => {
      if (uploadImageError) {
        return res.status(400).json({
          status: false,
          message: uploadImageError,
        });
      }

      if (!req.file || !req.file.originalname) {
        return res.status(400).json({
          status: false,
          message: "Please select a file",
        });
      }

      // Sanitize image file name
      const a = req.file.originalname;
      const imageExtension = a.split(/[. ]+/).pop();
      const withoutExtensionName = a.split(".").slice(0, -1).join(".");
      const sanitizedFileName =
        withoutExtensionName
          .toLowerCase()
          .split(" ")
          .join("_")
          .replace(/[^a-z0-9_]/gi, "") + `.${imageExtension}`;

      req.file.originalname = sanitizedFileName;

      const targetDirectory = path.normalize(
        `${global.__base}/public${SetPath}`
      );

      // Ensure target folder exists
      if (!fs.existsSync(targetDirectory)) {
        fs.mkdirSync(targetDirectory, { recursive: true });
      }

      const existingFile = `${global.__base}/public/uploads/${req.file.filename}`;
      const newFileName = `${Date.now()}-${sanitizedFileName}`;
      const storInto = `${SetPath}${newFileName}`;

      // Rename the file and move it
      fs.rename(
        existingFile,
        path.normalize(`${global.__base}/public${storInto}`),
        (error) => {
          if (error) {
            return res.status(500).json({
              status: false,
              message: "Image uploading failed",
              error,
            });
          }

          // If S3 upload is enabled, upload to S3
          if (S3_UPLOAD === "Y") {
            uploadToS3(SetPath, newFileName, (s3error, result) => {
              if (s3error) {
                return res.status(500).json({
                  status: false,
                  message: "Error uploading image to S3",
                  error: s3error,
                });
              }

              // Clean up local file after successful upload to S3
              fs.unlink(`${global.__base}/public${storInto}`, (unlinkError) => {
                if (unlinkError) {
                  console.error(
                    "Error deleting local file after S3 upload",
                    unlinkError
                  );
                }
              });

              return res.status(200).json({
                status: true,
                message: "Image uploaded successfully to S3",
                path: result,
              });
            });
          } else {
            return res.status(200).json({
              status: true,
              message: "Image uploaded successfully to server",
              imageBaseURL,
              path: storInto,
              fullpath: imageBaseURL + storInto,
            });
          }
        }
      );
    });
  } catch (error) {
    console.error("Error during image upload:", error);
    return res.status(500).json({
      status: false,
      message: "Unexpected error occurred during image upload",
      error,
    });
  }
}

export { uploadFile, uploadImageController };
