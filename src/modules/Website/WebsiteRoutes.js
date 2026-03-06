import { Router } from "express";

import { checkWebsiteSessionExist } from "../../middlewares/verifyToken.js";
import { getCinemaList } from "../Cinema/CinemaController.js";
import {
  getActiveEventList,
  getEventExtraInfoList,
  getEventList,
} from "../Event/EventController.js";
import {
  getBannerList,
  getCountryList,
  getLanguageList,
} from "../Master/MasterController.js";
import { getPassList } from "../MovieEventPass/PassController.js";
import { getTransactionByCode } from "./BookingController.js";

import {
  addWebCustomer,
  getCustomer,
  customerSignIn,
  verifyOTPAndUpdateUser,
} from "../Customer/CustomerController.js";
import { addEditGuest, addSubscriber } from "../Guest/GuestController.js";
import {
  addReservationSeat,
  addReservationSeatsIo,
  addReservationSeatWithoutSeatlayout,
  allReserveSeatBySchedule,
  applyPass,
  applyVoucher,
  getCustomerPassById,
  getCustomerPassHistory,
  getCustomerTicketHistory,
  getReservationSeat,
  getReservePassDetails,
  releaseSeats,
  removePass,
  removeVoucher,
  reservePass,
  resetReserveTime,
  downloadTicket,
} from "./WebsiteController.js";

import { getShopItems, getShopCategory, reserveShopItems, directShop, getdirectShopReservedItems, getShopOrderDetails } from "../Shop/ShopController.js";


const router = Router();

export function WebsiteRoutes() {
  // GET Routes
  router.get("/getCountryList", checkWebsiteSessionExist, getCountryList);
  router.get("/getBannerList", checkWebsiteSessionExist, getBannerList);
  router.get("/getLanguageList", checkWebsiteSessionExist, getLanguageList);
  router.get("/getEventList", checkWebsiteSessionExist, getActiveEventList);
  router.get(
    "/getEventListById/:event_id",
    checkWebsiteSessionExist,
    getEventList
  );
  router.get("/getCustomerDetail", checkWebsiteSessionExist, getCustomer);
  router.get(
    "/getReservationDetails/:reservation_id",
    checkWebsiteSessionExist,
    getReservationSeat
  );
  router.get(
    "/resetReserveTimer/:reservation_id",
    checkWebsiteSessionExist,
    resetReserveTime
  );
  router.get(
    "/seatRelease/:reservation_id",
    checkWebsiteSessionExist,
    releaseSeats
  );
  router.get(
    "/getAllBlockedSeatsBySchedule/:event_sch_id",
    checkWebsiteSessionExist,
    allReserveSeatBySchedule
  );
  router.get(
    "/getTransactionByCode/:booking_code",
    checkWebsiteSessionExist,
    getTransactionByCode
  );
  router.get(
    "/get-event-extraInfoList/:event_id",
    checkWebsiteSessionExist,
    getEventExtraInfoList
  );
  router.get(
    "/getCustomerPassById",
    checkWebsiteSessionExist,
    getCustomerPassById
  );
  router.get(
    "/getCustomerPassHistory/:customer_id",
    checkWebsiteSessionExist,
    getCustomerPassHistory
  );
  router.get(
    "/getCustomerTicketHistory/:customer_id",
    checkWebsiteSessionExist,
    getCustomerTicketHistory
  );
  router.get("/getcinemalist", checkWebsiteSessionExist, getCinemaList);
  router.get("/getPassList", checkWebsiteSessionExist, getPassList);
  router.get("/getPassById/:pass_id", checkWebsiteSessionExist, getPassList);
  router.get("/reservePass/:pass_id", checkWebsiteSessionExist, reservePass);
  router.get(
    "/getPassReservationDetails/:reservation_id",
    checkWebsiteSessionExist,
    getReservePassDetails
  );

  // POST Routes
  router.post("/signup-customer", checkWebsiteSessionExist, addWebCustomer);
  router.post("/verify-otp", checkWebsiteSessionExist, verifyOTPAndUpdateUser);

  router.post("/signIn", checkWebsiteSessionExist, customerSignIn);

  router.post("/reserveSeats", checkWebsiteSessionExist, addReservationSeat);
  router.post(
    "/reserveSeatsIo",
    checkWebsiteSessionExist,
    addReservationSeatsIo
  );
  router.post(
    "/reserveSeats-no-sl",
    checkWebsiteSessionExist,
    addReservationSeatWithoutSeatlayout
  );
  router.post("/guestCheckout", checkWebsiteSessionExist, addEditGuest);
  router.post("/customerSubscribe", checkWebsiteSessionExist, addSubscriber);
  router.post(
    "/applyVoucher/:reservation_id",
    checkWebsiteSessionExist,
    applyVoucher
  );
  router.post(
    "/removeVoucher/:reservation_id",
    checkWebsiteSessionExist,
    removeVoucher
  );
  router.post(
    "/removePass/:reservation_id",
    checkWebsiteSessionExist,
    removePass
  );
  router.post(
    "/applyPass/:reservation_id",
    checkWebsiteSessionExist,
    applyPass
  );

  router.get(
    "/downloadTicket/:booking_code",

    downloadTicket
  );

 //Shop Routes  Routes
 router.get("/get-shopitems", checkWebsiteSessionExist, getShopItems);
 router.get("/get-shopCategory", checkWebsiteSessionExist, getShopCategory);
 router.post("/reserve-shop-items/:reservation_id", checkWebsiteSessionExist, reserveShopItems);
 router.post("/direct-shop", checkWebsiteSessionExist, directShop);
 router.get(
   "/get-shop-reservation/:reservation_id",
   checkWebsiteSessionExist,
   getdirectShopReservedItems
 );
  router.get(
    "/get-shop-order-details",
    checkWebsiteSessionExist,
    getShopOrderDetails
  );


  return router;
}
