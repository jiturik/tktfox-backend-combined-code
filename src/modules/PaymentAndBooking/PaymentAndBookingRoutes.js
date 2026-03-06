import { Router } from "express";

import { checkWebsiteSessionExist } from "../../middlewares/verifyToken.js";

import { confirmTapPayment, tapPaymentCheckout } from "./TapPayment.js";
import {
  confirmTapPaymentOnlyShop,
  tapPaymentCheckoutOnlyShop,
} from "./TapPayment.js";
import {
  confirmPayonePayment,
  payonePaymentCheckout,
} from "./PayonePayment.js";
import {
  confirmPassPayonePayment,
  createPassTransation,
  payonePassPaymentCheckout,
} from "./PayonePassPayment.js";

import { mpgsPaymentCheckout, confirmMpgsPayment } from "./MpgsPayment.js";

import { cinemaainFreePaymentCheckout } from "./CinemaainFreeTicket.js";

import { createTransation, createTransactionShopOnly } from "./BookingHelper.js";

const router = Router();

export function PaymentAndBookingRoutes() {
  // TapPay Routes
  router.post(
    "/tapPaymentCheckout",
    checkWebsiteSessionExist,
    tapPaymentCheckout
  );
  router.get("/confirmTapPayment", confirmTapPayment);

  router.post(
    "/tapPaymentCheckoutOnlyShop",
    checkWebsiteSessionExist,
    tapPaymentCheckoutOnlyShop
  );
  router.get("/confirmTapPaymentOnlyShop", confirmTapPaymentOnlyShop);

  // Payone Routes
  router.post(
    "/payonePaymentCheckout",
    checkWebsiteSessionExist,
    payonePaymentCheckout
  );
  router.post("/confirmPayonePayment", confirmPayonePayment);
  router.post(
    "/payonePassPaymentCheckout",
    checkWebsiteSessionExist,
    payonePassPaymentCheckout
  );
  router.post("/confirmPassPayonePayment", confirmPassPayonePayment);

  //MPgs or network payment

  router.post(
    "/mpgsPaymentCheckout",
    checkWebsiteSessionExist,
    mpgsPaymentCheckout
  );

  router.post(
    "/cinemaainFreePaymentCheckout",
    checkWebsiteSessionExist,
    cinemaainFreePaymentCheckout
  );

  router.get("/confirmMpgsPayment", confirmMpgsPayment);

  // Other Payment Linked Routes
  router.post(
    "/createTransation/:reservation_id",
    checkWebsiteSessionExist,
    createTransation
  );
  router.post(
    "/createTransactionShopOnly/:reservation_id",
    checkWebsiteSessionExist,
    createTransactionShopOnly
  );
  router.post(
    "/createPassTransation/:reservation_id",
    checkWebsiteSessionExist,
    createPassTransation
  );

  return router;
}
