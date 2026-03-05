import { Router } from "express";

import { checkSessionExist } from "../../middlewares/verifyToken.js";
import {
  addEditBanner,
  addEditBlockedSeats,
  addEditCities,
  addEditCountries,
  addEditCurrency,
  addEditGenre,
  addEditLanguages,
  addEditOrg,
  addEditOrgWebsite,
  addEditRoles,
  addEditSeatLayout,
  addEditSeatType,
  addEditVouchers,
  getBannerList,
  getCityList,
  getContactUsList,
  getCountryList,
  getCurrencyList,
  getEventBlockedSeats,
  getGenreList,
  getLanguageList,
  getOrgList,
  getRolesList,
  getSeatLayoutList,
  getSeatTypeList,
  getTimeZoneList,
  getVoucherList,
  cancelBooking,
} from "./MasterController.js";

import { uploadImageController } from "./FileUploadController.js";

const router = Router();

export function MasterRoutes() {
  // POST Routes
  router.post("/add-edit-countries", checkSessionExist, addEditCountries);
  router.post("/add-edit-cities", checkSessionExist, addEditCities);
  router.post("/add-edit-languages", checkSessionExist, addEditLanguages);
  router.post("/add-edit-genres", checkSessionExist, addEditGenre);
  router.post("/add-edit-seattype", checkSessionExist, addEditSeatType);
  router.post("/add-edit-currency", checkSessionExist, addEditCurrency);
  router.post("/add-edit-banner", checkSessionExist, addEditBanner);
  router.post("/add-edit-seatlayout", addEditSeatLayout);
  router.post("/add-edit-roles", checkSessionExist, addEditRoles);
  router.post("/add-edit-org", checkSessionExist, addEditOrg);
  router.post("/add-edit-vouchers", checkSessionExist, addEditVouchers);
  router.post("/add-edit-orgwebsite", checkSessionExist, addEditOrgWebsite);
  router.post("/add-edit-blockseats", checkSessionExist, addEditBlockedSeats);
  router.route("/uploadimage").post(uploadImageController);

  // GET Routes
  router.get("/getcountrylist", checkSessionExist, getCountryList);
  router.get("/getcitylist", checkSessionExist, getCityList);
  router.get("/getlanguageslist", checkSessionExist, getLanguageList);
  router.get("/getgenreslist", checkSessionExist, getGenreList);
  router.get("/getseattypelist", getSeatTypeList);
  router.get("/getcurrencylist", checkSessionExist, getCurrencyList);
  router.get("/getbannerlist", checkSessionExist, getBannerList);
  router.get("/getSeatLayoutList", getSeatLayoutList);
  router.get("/gettimezonelist", checkSessionExist, getTimeZoneList);
  router.get("/getroleslist", checkSessionExist, getRolesList);
  router.get("/getOrgList", checkSessionExist, getOrgList);
  router.get("/getVoucherList", checkSessionExist, getVoucherList);
  router.get("/getContactUsList", checkSessionExist, getContactUsList);
  router.post("/cancelBooking", checkSessionExist, cancelBooking);
  router.get(
    "/getEventBlockedSeats/:event_id/:event_sch_id",
    checkSessionExist,
    getEventBlockedSeats
  );

  return router;
}
