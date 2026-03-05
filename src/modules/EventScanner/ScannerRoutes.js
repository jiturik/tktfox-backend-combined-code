import { Router } from "express";

import { checkSessionExist } from "../../middlewares/verifyToken.js";
import {
  addEditScanTicket,
  getScannedTicketById,
  getScannedTicketList,
  getTransactionByCodeScanner,
} from "./ScannerController.js";

const router = Router();

export function ScannerRoutes() {
  // GET Routes
  router.get(
    "/getTransactionByCode/:booking_code",
    checkSessionExist,
    getTransactionByCodeScanner
  );
  router.get(
    "/getScannedTicketById/:booking_id",
    checkSessionExist,
    getScannedTicketById
  );
  router.get("/getScannedTicketList", checkSessionExist, getScannedTicketList);

  // POST Routes
  router.post(
    "/add-edit-scanTicket/:booking_id",
    checkSessionExist,
    addEditScanTicket
  );

  return router;
}
