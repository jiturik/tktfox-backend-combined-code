import { Router } from "express";

import { checkSessionExist } from "../../middlewares/verifyToken.js";
import {
  addEditEvent,
  addEditEventExtra,
  getEventExtraInfoList,
  getEventList,
} from "./EventController.js";

const router = Router();

export function EventRoutes() {
  // POST Routes
  router.post("/add-edit-event", checkSessionExist, addEditEvent);
  router.post("/add-edit-eventExtra", checkSessionExist, addEditEventExtra);

  // GET Routes
  router.get("/getEventList", checkSessionExist, getEventList);
  router.get(
    "/get-event-extraInfoList",
    checkSessionExist,
    getEventExtraInfoList
  );

  return router;
}
