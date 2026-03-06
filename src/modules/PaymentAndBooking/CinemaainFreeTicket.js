import { checkValidation } from "../../lib/checkValidation.js";

import { EVENT_DATA } from "../Event/EventController.js";
import { skipPaymentGateway } from "./BookingHelper.js";
import { winstonLogger } from "../../lib/winstonLogger.js";
import { sendResponse } from "../../lib/responseService.js";

export async function cinemaainFreePaymentCheckout(req, res) {
  try {
    let BASEURL = ``;
    // @ts-ignore
    let reqbody = req.body;
    const { user_info } = req;
    let logged_in_customer_id = req["logged_in_customer_id"] || null;
    const {
      reservation_id,
      customer_name,
      customer_id,
      customer_email,
      customer_mobile,
      country_code,
      is_guest,
      success_frontend_url,
      failed_frontend_url,
    } = reqbody;
    let checkFields = [
      "reservation_id",
      "customer_email",
      "customer_mobile",
      "is_guest",
      "success_frontend_url",
      "failed_frontend_url",
    ];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    const paymentDetailC = await global
      .knexConnection("ms_payment_booking_detail")
      .where({
        reservation_id,
        booking_type: "Normal",
      });

    if (paymentDetailC.length) {
      return sendResponse(
        res,
        400,
        "Payment Already Initiated with reservation id",
      );
    }

    const checkReservation = await global
      .knexConnection("ms_reservation")
      .where({
        is_reserved: "Y",
        reservation_id,
      });

    if (checkReservation.length == 0) {
      return sendResponse(res, 400, "Seat Already Reserved or Booked");
    }

    const event_data_all = await EVENT_DATA({
      event_id: checkReservation[0].event_id,
      event_sch_id: checkReservation[0].event_sch_id,
    });

    let event_data = event_data_all.Records;

    const [BACKEND_URL] = await global.knexConnection("global_options").where({
      go_key: "BASE_URL_BACKEND",
    });
    let webtoken = req.header("authorization");

    BASEURL = BACKEND_URL.go_value;
    const redirectUrl = "";
    //const redirectUrl = `${BASEURL}/payment/confirmMpgsPayment?reservation_id=${reservation_id}&event_token=${webtoken}`;

    // @ts-ignore
    if (!event_data[0].org_id) {
      return sendResponse(res, 400, "Invalid Organization");
    }

    let paymentCurrency =
      event_data && event_data[0] ? event_data[0].curr_code : "";
    const getPaymentCurrencyData = await global
      .knexConnection("ms_currencies")
      .select("curr_code", "curr_id", "curr_name")
      .where({ curr_id: event_data[0].pay_currency_id, curr_is_active: "Y" });

    if (!getPaymentCurrencyData.length) {
      return sendResponse(res, 400, "Add Payment Currency in cinema");
    }

    paymentCurrency = getPaymentCurrencyData[0].curr_code;

    let totalAmount = 0;
    checkReservation.map((z) => {
      if (event_data[0].event_seating_type == "N") {
        totalAmount +=
          parseFloat(z.seat_price) *
          (z.no_of_seats ? parseFloat(z.no_of_seats) : 1);
      } else {
        totalAmount += parseFloat(z.seat_price);
      }
      totalAmount =
        totalAmount *
        (event_data[0].exchange_rate
          ? parseFloat(event_data[0].exchange_rate)
          : 1);

      //check for voucher discount here
      if (z.voucher_applied == "Y") {
        totalAmount -= parseFloat(z.voucher_discount_amount || 0);
      }

      //check for pass discount here
      if (z.pass_applied == "Y") {
        totalAmount -= parseFloat(z.pass_discount_amount || 0);
      }
    });

    if (totalAmount <= 0) {
      const skipBookingData = await skipPaymentGateway({
        reservation_id,
        event_data,
        is_guest,
        logged_in_customer_id,
        success_frontend_url,
        failed_frontend_url,
        customer_name,
        customer_email,
        customer_mobile,
        country_code,
        webtoken,
      });

      if (skipBookingData.status) {
        return sendResponse(res, 200, "Success", {
          data: `${skipBookingData.redirectTo}`,
        });
      } else {
        return sendResponse(res, 200, "Failed", {
          data: `${failed_frontend_url}`,
        });
      }
    } else {
      return sendResponse(
        res,
        400,
        "Cinema only supports free tickets .Please contact support team!",
      );
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "Error in cinemaainfreeticketcheckout",
      error,
    );
  }
}
