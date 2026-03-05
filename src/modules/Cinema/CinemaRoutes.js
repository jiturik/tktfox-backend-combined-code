import { Router } from "express";

import { checkSessionExist } from "../../middlewares/verifyToken.js";
import { addEditCinema, getCinemaList } from "./CinemaController.js";

const router = Router();

export function CinemaRoutes() {
  // POST Routes
  router.post("/add-edit-cinema", checkSessionExist, addEditCinema);

  // GET Routes
  router.get("/getcinemalist", checkSessionExist, getCinemaList);

  return router;
}
