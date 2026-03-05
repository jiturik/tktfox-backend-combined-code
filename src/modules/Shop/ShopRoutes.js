import { Router } from "express";

import {
  checkWebsiteSessionExist,
  checkSessionExist,
} from "../../middlewares/verifyToken.js";
import {
  addEdtShopItems,
  getShopItems,
  addEditShopCategory,
  getShopCategory,
  reserveShopItems,
  directShop,
  getdirectShopReservedItems,
} from "./ShopController.js";

const router = Router();

export function ShopRoutes() {
  // POST Routes
  router.post("/add-edit-shopitems", checkSessionExist, addEdtShopItems);
  router.post(
    "/add-edit-shopCategories",
    checkSessionExist,
    addEditShopCategory
  );

  // GET Routes
  router.get("/get-shopitems",checkSessionExist, getShopItems);
  router.get("/get-shopCategory",checkSessionExist, getShopCategory);
  return router;
}
