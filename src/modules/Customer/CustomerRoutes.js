import { Router } from "express";

import { checkSessionExist } from "../../middlewares/verifyToken.js";
import { addWebCustomer, getCustomer } from "./CustomerController.js";

const router = Router();

export function CustomerRoutes() {
  // POST Routes
  router.post("/add-edit-customer", checkSessionExist, addWebCustomer);

  // GET Routes
  router.get("/getcustomerlist", checkSessionExist, getCustomer);

  return router;
}
