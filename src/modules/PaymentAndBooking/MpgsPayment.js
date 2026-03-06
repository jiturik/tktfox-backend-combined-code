import axios from "axios";

import { checkValidation } from "../../lib/checkValidation.js";
import {
  currentDateTime,
  PaymentCredentialFunction,
} from "../../lib/helper.js";

import { EVENT_DATA } from "../Event/EventController.js";
import { skipPaymentGateway } from "./BookingHelper.js";
import { winstonLogger } from "../../lib/winstonLogger.js";
import { sendResponse } from "../../lib/responseService.js";

export async function mpgsPaymentCheckout(req, res) {
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
    const redirectUrl = `${BASEURL}/payment/confirmMpgsPayment?reservation_id=${reservation_id}&event_token=${webtoken}`;

    // @ts-ignore
    if (!event_data[0].org_id) {
      return sendResponse(res, 400, "Invalid Organization");
    }

    const payment_credential = await PaymentCredentialFunction({
      org_id: event_data[0].org_id,
      setting_key: "mpgs_network_payment",
    });

    if (payment_credential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }

    const { MERCHANT_ID, URL, API_USER_NAME, API_PASSWORD } =
      payment_credential.data;

    if (!MERCHANT_ID || !URL || !API_USER_NAME || !API_PASSWORD) {
      return sendResponse(res, 400, "Missing Payment Data");
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
    }

    if (
      event_data[0].event_booking_fees &&
      event_data[0].event_booking_fees > 0 &&
      totalAmount > 0
    ) {
      let booking_fee_value =
        (parseFloat(event_data[0].event_booking_fees) / 100) * totalAmount;
      totalAmount = totalAmount + booking_fee_value;
    }

    let mpgsObj = {
      apiOperation: "INITIATE_CHECKOUT",
      interaction: {
        operation: "PURCHASE",
        merchant: {
          name: API_USER_NAME, // Add the merchant user name here
        },
        returnUrl: redirectUrl,
        cancelUrl: failed_frontend_url,
        timeoutUrl: failed_frontend_url, // Return after timeout
      },
      order: {
        currency: paymentCurrency,
        amount: totalAmount.toFixed(2),
        id: reservation_id,
        reference: "REF-" + reservation_id,
        description: "Ticket",
      },
    };

    const auth = Buffer.from(`${API_USER_NAME}:${API_PASSWORD}`).toString(
      "base64",
    );

    try {
      const response = await axios.post(URL, mpgsObj, {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      });

      if (
        response &&
        response.data &&
        response.data.result &&
        response.data.result.toLowerCase() == "success"
      ) {
        const sessionId = response.data.session.id;
        mpgsObj["sessionResponse"] = response.data;
        if (sessionId) {
          let currentDateTimeNew = currentDateTime(
            null,
            "YYYY-MM-DD HH:mm:ss",
            event_data[0].tz_name,
          );

          let checkGuest = is_guest;

          if (!logged_in_customer_id) {
            checkGuest = "Y";
            logged_in_customer_id = 0;
          } else {
            checkGuest = "N";
            logged_in_customer_id = logged_in_customer_id;
          }

          let insertPaymentDetail = {
            reservation_id,
            success_frontend_url,
            failed_frontend_url,
            c_name: customer_name,
            email: customer_email,
            phone_number: customer_mobile,
            country_code: country_code,
            is_guest: checkGuest,
            customer_id: logged_in_customer_id,
            created_at: currentDateTimeNew,
            pm_id: 1,
            payment_request: JSON.stringify(mpgsObj),
            booking_type: "Normal",
          };

          await global
            .knexConnection("ms_payment_booking_detail")
            .insert(insertPaymentDetail);
          return sendResponse(res, 200, "MPGS Session created", {
            payment_mode: "mpgs",
            data: sessionId,
          });
        } else {
          return sendResponse(res, 400, "MPGS Session not created");
        }
      } else {
        return sendResponse(res, 400, "MPGS Session not created");
      }
    } catch (error) {
      return sendResponse(res, 400, "MPGS Session not created", error);
    }
  } catch (error) {
    return sendResponse(res, 400, "Error in mpgsPayment.js", error);
  }
}

export async function confirmMpgsPayment(req, res) {
  try {
    const { reservation_id, event_token, resultIndicator } = req.query;

    const detailPayment = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Normal" });
    const reservation_detail = await global
      .knexConnection("ms_reservation")
      .select("ms_reservation.*", "ms_event.org_id", "ms_event.event_is_active")
      .leftJoin("ms_event", "ms_event.event_id", "ms_reservation.event_id")
      .where({ reservation_id, event_is_active: "Y" });

    if (!detailPayment.length && !reservation_detail.length) {
      return sendResponse(res, 400, "Detail Not Found");
    }

    const { success_frontend_url, failed_frontend_url } = detailPayment[0];
    const success_redirect_url = success_frontend_url;
    const failed_redirect_url = failed_frontend_url;

    // @ts-ignore

    const payment_credential = await PaymentCredentialFunction({
      org_id: reservation_detail[0].org_id,
      setting_key: "mpgs_network_payment",
    });

    if (payment_credential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }
    let getSuccessIndicator = JSON.parse(detailPayment[0].payment_request);
    const successIndicator =
      getSuccessIndicator.sessionResponse.successIndicator;

    if (
      successIndicator &&
      resultIndicator &&
      successIndicator == resultIndicator
    ) {
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id, booking_type: "Normal" })
        .update({
          is_paid: "Y",
          payment_capture: JSON.stringify(req.query),
        });

      let BASEURL = ``;
      const [BACKEND_URL] = await global
        .knexConnection("global_options")
        .where({
          go_key: "BASE_URL_BACKEND",
        });

      BASEURL = BACKEND_URL.go_value;

      const config = {
        method: "post",
        url: `${BASEURL}/payment/createTransation/${reservation_id}`,
        headers: {
          Authorization: event_token,
        },
      };
      const transactionResponse = await axios(config);

      if (
        transactionResponse &&
        transactionResponse.data &&
        transactionResponse.data.status
      ) {
        return res.redirect(
          `${success_redirect_url}/${transactionResponse.data.booking_code}`,
        );
      } else {
        return res.redirect(`${failed_redirect_url}`);
      }
    } else {
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id, booking_type: "Normal" })
        .update({
          payment_capture: JSON.stringify({
            queryData: req.query,
          }),
        });
      return res.redirect(`${failed_redirect_url}`);
    }
  } catch (error) {
    winstonLogger.error("Error in mpgsPayment.js 2:", error);
    console.log("error in confirmMpgsPayment=>", error);
  }
}
