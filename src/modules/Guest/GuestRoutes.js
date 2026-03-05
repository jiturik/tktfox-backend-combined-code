import { Router } from "express";

import { checkSessionExist } from "../../middlewares/verifyToken.js";
import { addEditGuest, getGuestList } from "./GuestController.js";

const router = Router();

export function GuestRoutes() {
  // POST Routes
  router.post("/add-edit-guest", checkSessionExist, addEditGuest);

  // GET Routes
  router.get("/getGuestList", checkSessionExist, getGuestList);

  return router;
}
