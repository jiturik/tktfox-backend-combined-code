import axios from "axios";
import moment from "moment";

import { checkValidation } from "../../lib/checkValidation.js";
import {
  currentDateTime,
  PaymentCredentialFunction,
} from "../../lib/helper.js";

import { createHash } from "crypto";
import { winstonLogger } from "../../lib/winstonLogger.js";

import { sendResponse } from "../../lib/responseService.js";

export async function payonePassPaymentCheckout(req, res) {
  try {
    const { user_info } = req;
    const reqbody = req.body;

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

    // Validate required fields
    const requiredFields = [
      "reservation_id",
      "customer_email",
      "customer_mobile",
      "is_guest",
      "success_frontend_url",
      "failed_frontend_url",
    ];

    const validationResult = await checkValidation(requiredFields, reqbody);
    if (!validationResult.status) {
      return sendResponse(res, 400, "Validation Error", validationResult);
    }

    // Check if payment already exists for the reservation
    const paymentDetailC = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Normal" });

    if (paymentDetailC.length) {
      return sendResponse(
        res,
        400,
        "Payment already initiated with this reservation ID.",
      );
    }

    // Check if the reservation is valid and reserved
    const checkReservation = await global
      .knexConnection("ms_pass_reservation")
      .where({ p_is_reserved: "Y", p_reservation_id: reservation_id });

    if (!checkReservation.length) {
      return sendResponse(
        res,
        400,
        "Reservation not found or pass already released.",
      );
    }

    // Get pass details
    const getPassDetail = await global
      .knexConnection("movie_event_pass")
      .select("movie_event_pass.*", "ms_currencies.curr_code")
      .leftJoin(
        "ms_currencies",
        "ms_currencies.curr_id",
        "movie_event_pass.pass_currency_id",
      )
      .where({
        "movie_event_pass.pass_id": checkReservation[0].pass_id,
        "movie_event_pass.pass_is_active": "Y",
      });

    if (!getPassDetail.length || !getPassDetail[0].org_id) {
      return sendResponse(res, 400, "Invalid or inactive pass organization.");
    }

    // Fetch payment credentials for the organization
    const paymentCredential = await PaymentCredentialFunction({
      org_id: getPassDetail[0].org_id,
      setting_key: "payone_payment",
    });

    if (paymentCredential.false) {
      return sendResponse(res, 400, "Invalid payment mode or credentials.");
    }

    const { MERCHANT_ID, URL, SECRET_KEY } = paymentCredential.data;

    if (!MERCHANT_ID || !URL || !SECRET_KEY) {
      return sendResponse(res, 400, "Invalid payment mode or credentials.");
    }

    // Prepare transaction details and hash
    let totalAmount = parseFloat(checkReservation[0].pass_total_price);
    const paymentCurrencyData = await global
      .knexConnection("ms_currencies")
      .select("curr_code", "curr_id", "curr_name", "curr_iso")
      .where({
        curr_id: getPassDetail[0].pass_currency_id,
        curr_is_active: "Y",
      });

    if (!paymentCurrencyData.length) {
      return sendResponse(
        res,
        400,
        "No valid payment currency found for the pass.",
      );
    }

    const paymentCurrencyIso = paymentCurrencyData[0].curr_iso;
    const redirectUrl = `${BASEURL}/payment/confirmPassPayonePayment?reservation_id_token=${reservation_id}///${req.header(
      "authorization",
    )}`;

    let PaymentObject = {
      Amount: totalAmount * 1000, // Convert to smallest currency unit (e.g., cents)
      Channel: 0,
      CurrencyISOCode: parseInt(paymentCurrencyIso),
      MerchantID: MERCHANT_ID,
      MessageID: 1,
      ResponseBackURL: redirectUrl,
      TransactionID: `PASS${Math.floor(Math.random() * 90000) + 10000}`,
    };

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
    PaymentObject.hashCode = hashCode;

    // Create the HTML form for redirection
    const formBody = `
        <form id="nonseamless" method="post" action="${URL}" name="redirectForm">
          <input name="Amount" type="hidden" value="${PaymentObject.Amount}"/>
          <input name="Channel" type="hidden" value="${PaymentObject.Channel}"/>
          <input name="CurrencyISOCode" type="hidden" value="${PaymentObject.CurrencyISOCode}"/>
          <input name="MerchantID" type="hidden" value="${PaymentObject.MerchantID}"/>
          <input name="MessageID" type="hidden" value="${PaymentObject.MessageID}"/>
          <input name="ResponseBackURL" type="hidden" value="${PaymentObject.ResponseBackURL}"/>
          <input name="TransactionID" type="hidden" value="${PaymentObject.TransactionID}"/>
          <input name="SecureHash" type="hidden" value="${hashCode}"/>
        </form>
      `;

    // Handle guest/customer check
    let checkGuest = is_guest;
    let logged_in_customer_id = req["logged_in_customer_id"] || null;

    if (!logged_in_customer_id) {
      checkGuest = "Y";
      logged_in_customer_id = 0;
    } else {
      checkGuest = "N";
      logged_in_customer_id = logged_in_customer_id;
    }

    // Check if the customer has already bought the pass
    if (logged_in_customer_id && logged_in_customer_id > 0) {
      const existingPass = await global
        .knexConnection("pass_booking")
        .select("pass_booking.pass_id")
        .where({ customer_id: logged_in_customer_id, is_active: "Y" });

      if (existingPass.length) {
        return sendResponse(res, 400, "Pass already bought for this customer.");
      }
    }

    // Insert payment details into the database
    const currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      "Pacific/Yap",
    );
    const insertPaymentDetail = {
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
      .insert(insertPaymentDetail);
    return sendResponse(res, 200, "Success", {
      payment_mode: "payone",
      data: formBody,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An unexpected error occurred in payone payment checkout.",
      error,
    );
  }
}

export async function confirmPassPayonePayment(req, res) {
  const { reservation_id_token } = req.query;

  if (!reservation_id_token) {
    return sendResponse(res, 400, "Missing reservation_id_token in query.");
  }

  const [reservation_id, event_token] = reservation_id_token.split("///");

  if (!reservation_id || !event_token) {
    return sendResponse(res, 400, "Invalid reservation_id_token format.");
  }

  const body = req.body;

  // Fetch payment details from the database
  let detailPayment = await global
    .knexConnection("ms_payment_booking_detail")
    .where({ reservation_id, booking_type: "Normal" })
    .first(); // Using `.first()` to directly get the single record

  if (!detailPayment) {
    return sendResponse(
      res,
      400,
      "Payment details not found for this reservation.",
    );
  }

  const {
    success_frontend_url,
    failed_frontend_url,
    payment_request,
    payment_transaction_id,
  } = detailPayment;

  const success_redirect_url = success_frontend_url;
  const failed_redirect_url = failed_frontend_url;

  let requestedPayload = JSON.parse(payment_request); // Safely parse payment request

  const requestHash = requestedPayload.hashCode;
  const requestPaymentAmt = parseFloat(requestedPayload.Amount) / 1000 + " JOD";
  const transaction_date_frontend = moment().format("DD/MM/YYYY, h:mm:ss");
  const getPaymentStatusCode = body["Response.StatusCode"];
  const getGatewayStatusDescription = body["Response.GatewayStatusDescription"];
  const responseHash = body["Response.SecureHash"];
  const paymentMessage = body["Response.StatusDescription"];

  try {
    // Check for successful payment
    if (
      (getGatewayStatusDescription === "APPROVED" ||
        getGatewayStatusDescription === "approved") &&
      getPaymentStatusCode === "00000"
    ) {
      // Update payment status to "paid"
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
        console.error("BASE_URL_BACKEND not found.");
        return sendResponse(res, 400, "Backend URL not configured.");
      }

      const BASEURL = BACKEND_URL.go_value;

      const config = {
        method: "post",
        url: `${BASEURL}/payment/createPassTransation/${reservation_id}`,
        headers: {
          Authorization: event_token,
        },
      };

      let transactionResponse;
      try {
        transactionResponse = await axios(config);
      } catch (axiosError) {
        return sendResponse(
          res,
          500,
          "Error during transaction API call.",
          axiosError,
        );
      }

      if (
        transactionResponse &&
        transactionResponse.data &&
        transactionResponse.data.status
      ) {
        return res.redirect(
          `${failed_redirect_url}?message=${paymentMessage}&amount=${requestPaymentAmt}&transaction_id=${payment_transaction_id}&date=${transaction_date_frontend}`,
        );
      } else {
        console.error("Transaction failed:", transactionResponse);
        return res.redirect(
          `${failed_redirect_url}?message=Transaction Failed&amount=${requestPaymentAmt}&transaction_id=${payment_transaction_id}&date=${transaction_date_frontend}`,
        );
      }
    } else {
      // Handle failed payment case
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
    winstonLogger.error("Error in payonePassPayment.js 5:", error);
    console.error("Error during payment confirmation:", error);
    await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Normal" })
      .update({
        payment_capture: JSON.stringify(req.query),
      });

    return res.redirect(
      `${failed_redirect_url}?message=${paymentMessage}&amount=${requestPaymentAmt}&transaction_id=${payment_transaction_id}&date=${transaction_date_frontend}`,
    );
  }
}

export async function createPassTransation(req, res) {
  try {
    let reqbody = { ...req.body, ...req.params };
    const { user_info } = req;
    const isWebsiteUser = req["is_website_user"] || false;
    const { reservation_id } = reqbody;

    // Validate the reservation_id
    let checkFields = ["reservation_id"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    let getReservationDetail = await global
      .knexConnection("ms_pass_reservation")
      .where({
        p_reservation_id: reservation_id,
        p_is_reserved: "Y",
      });

    if (!getReservationDetail.length) {
      return sendResponse(res, 400, "Reservation not found or already booked.");
    }

    let getPaymentDetail = [];
    let qrUrl = "";

    // Check for website user payment details
    if (isWebsiteUser) {
      getPaymentDetail = await global
        .knexConnection("ms_payment_booking_detail")
        .select(
          "c_name",
          "email",
          "phone_number",
          "country_code",
          "is_booked",
          "is_guest",
          "customer_id",
          "payment_mode_name",
          "success_frontend_url",
          "failed_frontend_url",
          "payment_transaction_id",
        )
        .leftJoin(
          "ms_payment_mode",
          "ms_payment_mode.pm_id",
          "ms_payment_booking_detail.pm_id",
        )
        .where({
          reservation_id,
          is_paid: "Y",
          booking_type: "Normal",
        });

      if (!getPaymentDetail.length) {
        return sendResponse(
          res,
          400,
          "Payment not completed from the website.",
        );
      }
    }

    let currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      "Asia/Bahrain",
    );

    let getPassDetail;

    getPassDetail = await global
      .knexConnection("movie_event_pass")
      .select("movie_event_pass.*", "ms_currencies.curr_code")
      .leftJoin(
        "ms_currencies",
        "ms_currencies.curr_id",
        "movie_event_pass.pass_currency_id",
      )
      .where({
        "movie_event_pass.pass_id": getReservationDetail[0].pass_id,
        "movie_event_pass.pass_is_active": "Y",
      });

    let event_data = getPassDetail[0];
    qrUrl = getPaymentDetail[0].success_frontend_url;

    let insertObj = {
      pass_id: getReservationDetail[0].pass_id,
      pass_name: event_data.pass_name,
      pass_price: parseFloat(getReservationDetail[0].pass_price),
      pass_tax_percent: parseFloat(getReservationDetail[0].pass_tax_percent),
      pass_tax_value: parseFloat(getReservationDetail[0].pass_tax_value),
      pass_total_price: parseFloat(getReservationDetail[0].pass_total_price),
      pass_discount_percent: parseFloat(event_data.pass_discount_value),
      pass_valid_days: parseFloat(event_data.pass_valid_days),
      c_email:
        getPaymentDetail[0] && getPaymentDetail[0].email
          ? getPaymentDetail[0].email
          : null,
      c_name:
        getPaymentDetail[0] && getPaymentDetail[0].c_name
          ? getPaymentDetail[0].c_name
          : null,
      c_country_code:
        getPaymentDetail[0] && getPaymentDetail[0].country_code
          ? getPaymentDetail[0].country_code
          : null,
      is_guest:
        getPaymentDetail[0] && getPaymentDetail[0].is_guest
          ? getPaymentDetail[0].is_guest
          : null,
      customer_id:
        getPaymentDetail[0] && getPaymentDetail[0].customer_id
          ? getPaymentDetail[0].customer_id
          : 0,
      c_phone_number:
        getPaymentDetail[0] && getPaymentDetail[0].phone_number
          ? getPaymentDetail[0].phone_number
          : null,
      currency: event_data.curr_code || null,
      payment_mode_id:
        getPaymentDetail[0] && getPaymentDetail[0].pm_id
          ? getPaymentDetail[0].pm_id
          : null,
      payment_mode:
        getPaymentDetail[0] && getPaymentDetail[0].payment_mode_name
          ? getPaymentDetail[0].payment_mode_name
          : null,
      booking_type_name: isWebsiteUser ? "Website" : "Box Office",
      booking_date_time: currentDateTimeNew,
      reservation_id,
      payment_transaction_id: getPaymentDetail[0].payment_transaction_id,
    };

    // Check if the booking already exists

    let checkExistingBooking = await global
      .knexConnection("pass_booking")
      .where({
        reservation_id,
      });

    if (checkExistingBooking.length) {
      return sendResponse(
        res,
        400,
        "Transaction already initiated for this reservation.",
      );
    }

    let insertBookingId = await global
      .knexConnection("pass_booking")
      .insert(insertObj);

    let booking_code = "PASS";
    let prefix_array = ["00000", "0000", "000", "00", "0"];
    let string_length = String(insertBookingId[0]).length - 1;
    let booking_number_new = prefix_array[string_length]
      ? `${prefix_array[string_length]}${insertBookingId[0]}`
      : insertBookingId[0];
    booking_code += booking_number_new;

    await global
      .knexConnection("ms_pass_reservation")
      .where({ p_reservation_id: reservation_id })
      .update({
        p_is_booked: "Y",
      });

    await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Normal" })
      .update({
        is_booked: "Y",
      });
    return sendResponse(res, 200, "Transaction created successfully.", {
      booking_code: booking_code,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "Error updating reservation and payment status.",
      error,
    );
  }
}
