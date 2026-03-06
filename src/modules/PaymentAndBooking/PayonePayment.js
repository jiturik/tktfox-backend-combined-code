import { checkValidation } from "../../lib/checkValidation.js";
import {
  currentDateTime,
  PaymentCredentialFunction,
  SeatsIoCredentialFunction,
} from "../../lib/helper.js";
import { pagination } from "../../lib/pagination.js";
import { skipPaymentGateway } from "./BookingHelper.js";

import { EVENT_DATA } from "../Event/EventController.js";
import { createHash } from "crypto";
import { winstonLogger } from "../../lib/winstonLogger.js";
import { sendResponse } from "../../lib/responseService.js";

export async function payonePaymentCheckout(req, res) {
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
  } = req.body;
  const { user_info } = req;
  let logged_in_customer_id = req["logged_in_customer_id"] || null;
  const webtoken = req.header("authorization");

  // Check for required fields
  const requiredFields = [
    "reservation_id",
    "customer_email",
    "customer_mobile",
    "is_guest",
    "success_frontend_url",
    "failed_frontend_url",
  ];
  const validationResult = await checkValidation(requiredFields, req.body);

  if (!validationResult.status) {
    return sendResponse(res, 400, "Validation Error", validationResult);
  }

  try {
    // Check if payment has already been initiated
    const paymentDetail = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Normal" });
    if (paymentDetail.length) {
      return sendResponse(
        res,
        400,
        "Payment Already Initiated with reservation id",
      );
    }

    // Validate reservation
    const reservation = await global
      .knexConnection("ms_reservation")
      .where({ is_reserved: "Y", reservation_id });
    if (reservation.length === 0) {
      return sendResponse(res, 400, "Invalid reservation id");
    }

    // Fetch event data
    const event_data_all = await EVENT_DATA({
      event_id: reservation[0].event_id,
      event_sch_id: reservation[0].event_sch_id,
    });
    const event_data = event_data_all.Records;
    if (!event_data[0].org_id) {
      return sendResponse(res, 400, "Invalid organization");
    }

    // Get payment credentials
    const paymentCredential = await PaymentCredentialFunction({
      org_id: event_data[0].org_id,
      setting_key: "payone_payment",
    });
    if (paymentCredential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }

    const { MERCHANT_ID, URL, SECRET_KEY } = paymentCredential.data;
    if (!MERCHANT_ID || !URL || !SECRET_KEY) {
      return sendResponse(res, 400, "Missing Payment Data");
    }

    // Calculate total amount
    let totalAmount = 0;
    reservation.forEach((z) => {
      if (event_data[0].event_seating_type === "N") {
        totalAmount +=
          parseFloat(z.seat_price) *
          (z.no_of_seats ? parseFloat(z.no_of_seats) : 1);
      } else {
        totalAmount += parseFloat(z.seat_price);
      }
      totalAmount *= event_data[0].exchange_rate
        ? parseFloat(event_data[0].exchange_rate)
        : 1;

      //check for voucher discount here
      if (z?.voucher_applied == "Y") {
        totalAmount -= parseFloat(z.voucher_discount_amount || 0);
      }

      //check for pass discount here
      if (z?.pass_applied == "Y") {
        totalAmount -= parseFloat(z.pass_discount_amount || 0);
      }
    });

    // Skip payment if total amount is zero
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

      return sendResponse(res, 200, "Success", {
        data: skipBookingData.status
          ? skipBookingData.redirectTo
          : failed_frontend_url,
      });
    }

    // Fetch payment currency data
    const paymentCurrencyData = await global
      .knexConnection("ms_currencies")
      .select("curr_code", "curr_id", "curr_name", "curr_iso")
      .where({ curr_id: event_data[0].pay_currency_id, curr_is_active: "Y" });
    if (!paymentCurrencyData.length) {
      return sendResponse(res, 400, "Add Payment Currency");
    }

    const paymentCurrencyIso = paymentCurrencyData[0].curr_iso;
    const [BACKEND_URL] = await global
      .knexConnection("global_options")
      .where({ go_key: "BASE_URL_BACKEND" });

    if (!BACKEND_URL) {
      throw new Error("Backend URL not found");
    }

    const BASEURL = BACKEND_URL.go_value;
    // Create payment object
    const redirectUrl = `${BASEURL}/payment/confirmPayonePayment?reservation_id_token=${reservation_id}///${webtoken}`;
    const PaymentObject = {
      Amount: totalAmount * 1000,
      Channel: 0,
      CurrencyISOCode: parseInt(paymentCurrencyIso),
      MerchantID: MERCHANT_ID,
      MessageID: 1,
      ResponseBackURL: redirectUrl,
      TransactionID:
        "RESERVEID" +
        reservation[0].r_id +
        Math.floor(Math.random() * 900) +
        100,
    };

    // Generate hash code for security
    const hashCodeString =
      SECRET_KEY +
      PaymentObject.Amount +
      PaymentObject.Channel +
      PaymentObject.CurrencyISOCode +
      PaymentObject.MerchantID +
      PaymentObject.MessageID +
      PaymentObject.ResponseBackURL +
      PaymentObject.TransactionID;
    const hashCode = createHash("sha256").update(hashCodeString).digest("hex");
    PaymentObject["hashCode"] = hashCode;

    // Build the payment form
    const formbody = `<form id="nonseamless" method="post" action="${URL}" name="redirectForm">
      <input name="Amount" type="hidden" value="${PaymentObject.Amount}"/>
      <input name="Channel" type="hidden" value="${PaymentObject.Channel}"/>
      <input name="CurrencyISOCode" type="hidden" value="${PaymentObject.CurrencyISOCode}"/>
      <input name="MerchantID" type="hidden" value="${PaymentObject.MerchantID}"/>
      <input name="MessageID" type="hidden" value="${PaymentObject.MessageID}"/>
      <input name="ResponseBackURL" type="hidden" value="${PaymentObject.ResponseBackURL}"/>
      <input name="TransactionID" type="hidden" value="${PaymentObject.TransactionID}"/>
      <input name="SecureHash" type="hidden" value="${hashCode}"/>
    </form>`;

    // Insert payment details into DB
    const currentDateTimeNew = currentDateTime(
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

    const paymentDetails = {
      reservation_id,
      success_frontend_url,
      failed_frontend_url,
      c_name: customer_name,
      email: customer_email,
      phone_number: customer_mobile,
      country_code,
      is_guest: checkGuest,
      customer_id: logged_in_customer_id,
      created_at: currentDateTimeNew,
      pm_id: 2,
      payment_request: JSON.stringify(PaymentObject),
      payment_transaction_id: PaymentObject.TransactionID,
      booking_type: "Normal",
    };

    await global
      .knexConnection("ms_payment_booking_detail")
      .insert(paymentDetails);
    return sendResponse(res, 200, "Success", {
      payment_mode: "payone",
      data: formbody,
    });
  } catch (error) {
    return sendResponse(
      res,
      400,
      "An error occurred in payonePayment.js",
      error,
    );
  }
}

export async function confirmPayonePayment(req, res) {
  const { reservation_id_token } = req.query;
  const reservation_id = reservation_id_token.split("///")[0];
  const event_token = reservation_id_token.split("///")[1];

  const body = req.body;

  try {
    // Get payment booking detail and reservation details
    const detailPayment = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Normal" });

    if (!detailPayment.length) {
      throw new Error("Payment detail not found");
    }

    const reservation_detail = await global
      .knexConnection("ms_reservation")
      .select("ms_reservation.*", "ms_event.org_id", "ms_event.event_is_active")
      .leftJoin("ms_event", "ms_event.event_id", "ms_reservation.event_id")
      .where({ reservation_id, event_is_active: "Y" });

    if (!reservation_detail.length) {
      throw new Error("Reservation detail not found or event is inactive");
    }

    // Extract necessary fields from payment detail
    const {
      success_frontend_url,
      failed_frontend_url,
      payment_request,
      payment_transaction_id,
    } = detailPayment[0];
    const success_redirect_url = success_frontend_url;
    const failed_redirect_url = failed_frontend_url;

    // Parse payment request and calculate values
    const requestedPayload = JSON.parse(payment_request);
    const requestHash = requestedPayload.hashCode;
    const requestPaymentAmt =
      parseFloat(requestedPayload.Amount) / 1000 + " JOD";
    const transaction_date_frontend = moment().format("DD/MM/YYYY, h:mm:ss");

    const getPaymentStatusCode = body["Response.StatusCode"];
    const getGatewayStatusDescription =
      body["Response.GatewayStatusDescription"];
    const responseHash = body["Response.SecureHash"];
    const paymentMessage = body["Response.StatusDescription"];

    // Check if payment is approved
    if (
      (getGatewayStatusDescription === "APPROVED" ||
        getGatewayStatusDescription === "approved") &&
      getPaymentStatusCode === "00000"
    ) {
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id, booking_type: "Normal" })
        .update({
          is_paid: "Y",
          recheck_payment: "N",
          payment_capture: JSON.stringify(body),
        });

      const [BACKEND_URL] = await global
        .knexConnection("global_options")
        .where({ go_key: "BASE_URL_BACKEND" });

      if (!BACKEND_URL) {
        throw new Error("Backend URL not found");
      }

      const BASEURL = BACKEND_URL.go_value;

      // Make the transaction request
      const config = {
        method: "post",
        url: `${BASEURL}/payment/createTransation/${reservation_id}`,
        headers: {
          Authorization: event_token,
        },
      };

      const transactionResponse = await axios(config);

      if (transactionResponse.data && transactionResponse.data.status) {
        return res.redirect(
          `${success_redirect_url}/${transactionResponse.data.booking_code}?message=${paymentMessage}`,
        );
      } else {
        throw new Error("Transaction creation failed");
      }
    } else {
      // If payment is not approved
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id, booking_type: "Normal" })
        .update({
          recheck_payment: "N",
          payment_capture: JSON.stringify({
            ...body,
            queryData: req.query,
          }),
        });

      return res.redirect(
        `${failed_redirect_url}?message=${paymentMessage}&amount=${requestPaymentAmt}&transaction_id=${payment_transaction_id}&date=${transaction_date_frontend}`,
      );
    }
  } catch (error) {
    winstonLogger.error("Error in payonePayment.js 2:", error);
    console.error("Error during Payone payment confirmation:", error.message);
    await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Normal" })
      .update({
        payment_capture: JSON.stringify(req.query),
      });

    return res.redirect(
      `${failed_redirect_url}?message=${error.message}&amount=${
        body["Response.Amount"]
      }&transaction_id=${body["Response.TransactionID"]}&date=${moment().format(
        "DD/MM/YYYY, h:mm:ss",
      )}`,
    );
  }
}
