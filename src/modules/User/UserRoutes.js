import { Router } from "express";

import { checkSessionExist } from "../../middlewares/verifyToken.js";
import { addEdtUser, getUserList } from "./UserController.js";

const router = Router();

export function UserRoutes() {
  // POST Routes
  router.post("/add-edit-users", checkSessionExist, addEdtUser);

  // GET Routes
  router.get("/getuserlist", checkSessionExist, getUserList);

  return router;
}
