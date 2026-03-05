import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import helmet from "helmet";
import { RootRouter } from "./router.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(cors());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
app.use(RootRouter());

app.use(
  express.static(__dirname + "/public", {
    maxAge: "7d",
  })
);

export default app;
