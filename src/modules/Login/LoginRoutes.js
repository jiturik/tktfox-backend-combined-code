import { Router } from "express";

import { checkSessionExist } from "../../middlewares/verifyToken.js";
import { checkLogin, login } from "./LoginController.js";

const router = Router();

export function LoginRoutes() {
  // POST Routes
  router.post("/login", login);

  // GET Routes
  router.get("/check-login-access", checkSessionExist, checkLogin);

  return router;
}
