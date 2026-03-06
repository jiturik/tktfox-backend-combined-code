import { Router } from "express";

import { checkSessionExist } from "../../middlewares/verifyToken.js";
import {
  exportBookingReport,
  exportReservationReport,
  getEventHomeDataById,
  getPassTransactionList,
  getReservationBookingList,
  getTransactionList,
  resendTicketCustomer,
} from "./ReportController.js";
import { getShopOrdersReport } from "../Shop/ShopController.js";

const router = Router();

export function ReportRoutes() {
  // GET Routes
  router.get("/getTransactionList", checkSessionExist, getTransactionList);
  router.get(
    "/getPassTransactionList",
    checkSessionExist,
    getPassTransactionList
  );
  router.get(
    "/getReservationBookingList",
    checkSessionExist,
    getReservationBookingList
  );
  router.get("/getEventHomeDataById", checkSessionExist, getEventHomeDataById);
  router.get("/exportBookingReport", checkSessionExist, exportBookingReport);
  router.get(
    "/exportReservationReport",
    checkSessionExist,
    exportReservationReport
  );
  router.get(
    "/getShopOrdersReport",
    checkSessionExist,
    getShopOrdersReport
  );

  // POST Routes
  router.post(
    "/resend-ticket-customer",
    checkSessionExist,
    resendTicketCustomer
  );

  return router;
}
