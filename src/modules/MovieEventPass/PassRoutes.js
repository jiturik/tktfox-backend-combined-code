import { Router } from "express";

import { checkSessionExist } from "../../middlewares/verifyToken.js";
import {
  addEditPass,
  getPassList,
  addEditPassDiscount,
  getPassDiscountList,
} from "./PassController.js";

const router = Router();

export function PassRoutes() {
  // POST Routes
  router.post("/add-edit-pass", checkSessionExist, addEditPass);
  router.post(
    "/add-edit-pass-discount",
    checkSessionExist,
    addEditPassDiscount
  );

  // GET Routes
  router.get("/getPassList", checkSessionExist, getPassList);
  router.get("/getPassDiscountList", checkSessionExist, getPassDiscountList);

  return router;
}
