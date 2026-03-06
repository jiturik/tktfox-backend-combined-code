import axios from "axios";
import { checkValidation } from "../../lib/checkValidation.js";
import {
  currentDateTime,
  PaymentCredentialFunction,
} from "../../lib/helper.js";
import { sendResponse } from "../../lib/responseService.js";
import { winstonLogger } from "../../lib/winstonLogger.js";

import { EVENT_DATA } from "../Event/EventController.js";
import { skipPaymentGateway } from "./BookingHelper.js";

export async function tapPaymentCheckout(req, res) {
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

  try {
    // Validate required fields
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

    // Check if payment has already been initiated for this reservation
    const paymentDetailExists = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Normal" });

    if (paymentDetailExists.length) {
      return sendResponse(res, 400, "Payment Already Initiated");
    }

    // Check reservation status
    const checkReservation = await global
      .knexConnection("ms_reservation")
      .where({ is_reserved: "Y", reservation_id });

    if (checkReservation.length === 0) {
      return sendResponse(res, 400, "Invalid Reservation");
    }

    // Get event data
    const event_data_all = await EVENT_DATA({
      event_id: checkReservation[0].event_id,
      event_sch_id: checkReservation[0].event_sch_id,
    });

    let event_data = event_data_all.Records;

    // Retrieve backend URL for redirection
    const [BACKEND_URL] = await global
      .knexConnection("global_options")
      .where({ go_key: "BASE_URL_BACKEND" });
    const webtoken = req.header("authorization");
    const BASEURL = BACKEND_URL.go_value;
    const redirectUrl = `${BASEURL}/payment/confirmTapPayment?reservation_id=${reservation_id}&event_token=${webtoken}`;

    // Check if organization data exists
    if (!event_data[0].org_id) {
      return sendResponse(res, 400, "Invalid organization");
    }

    // Fetch payment credentials
    const payment_credential = await PaymentCredentialFunction({
      org_id: event_data[0].org_id,
      setting_key: "tap_pay_payment",
    });

    if (payment_credential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }

    const { MERCHANT_ID, SOURCE_ID, URL, PAYTAP_SECRET_KEY } =
      payment_credential.data;

    if (!MERCHANT_ID || !SOURCE_ID || !URL || !PAYTAP_SECRET_KEY) {
      return sendResponse(res, 400, "Missing Payment Data");
    }

    // Get payment currency
    const paymentCurrencyData = await global
      .knexConnection("ms_currencies")
      .select("curr_code")
      .where({ curr_id: event_data[0].pay_currency_id, curr_is_active: "Y" });

    if (!paymentCurrencyData.length) {
      return sendResponse(res, 400, "Add Payment Currency in cinema");
    }

    let paymentCurrency = paymentCurrencyData[0].curr_code;

    // Calculate total amount
    let totalAmount = 0;
    checkReservation.forEach((z) => {
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
      if (z.voucher_applied == "Y") {
        totalAmount -= parseFloat(z.voucher_discount_amount || 0);
      }

      //check for pass discount here
      if (z.pass_applied == "Y") {
        totalAmount -= parseFloat(z.pass_discount_amount || 0);
      }
    });

    // Add reserved shop items amount once per reservation (from reserve_shop_items only)
    const reservedShopItems = await global
      .knexConnection("reserve_shop_items")
      .select("item_quantity", "item_price")
      .where({ reservation_id, is_reserved: "Y" });

    if (reservedShopItems.length > 0) {
      let shopItemsAmount = 0;
      for (let item of reservedShopItems) {
        shopItemsAmount +=
          parseFloat(item.item_price) * parseFloat(item.item_quantity);
      }
      totalAmount += shopItemsAmount;
    }

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

      return sendResponse(
        res,
        200,
        "Success",
        {
          data: skipBookingData.status
            ? skipBookingData.redirectTo
            : failed_frontend_url,
        },
        skipBookingData.status ? true : false,
      );
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

    // Prepare the payment request object
    const tapPaymentObject = {
      amount: totalAmount.toFixed(2),
      currency: paymentCurrency,
      threeDSecure: true,
      save_card: false,
      customer_initiated: true,
      description: "",
      statement_descriptor: "Sample",
      metadata: { udf1: "test 1", udf2: "test 2" },
      reference: {
        transaction: `trx_${reservation_id}`,
        order: reservation_id,
      },
      receipt: { email: true, sms: false },
      customer: {
        first_name: "-",
        last_name: "-",
        email: customer_email,
        phone: { country_code, number: customer_mobile },
      },
      merchant: { id: MERCHANT_ID },
      source: { id: SOURCE_ID },
      redirect: { url: redirectUrl },
    };

    const paymentData = JSON.stringify(tapPaymentObject);
    const config = {
      method: "post",
      url: URL,
      headers: {
        Authorization: `Bearer ${PAYTAP_SECRET_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      data: paymentData,
    };

    // Make the API request to TapPay
    const response = await axios.request(config);

    // Handle customer verification and insert payment details
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
      pm_id: 1,
      payment_request: paymentData,
      booking_type: "Normal",
    };

    await global
      .knexConnection("ms_payment_booking_detail")
      .insert(insertPaymentDetail);
    return sendResponse(res, 200, "Success", {
      payment_mode: "tappay",
      data: response.data.transaction.url,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred during the payment process.",
      error,
    );
  }
}
export async function confirmTapPayment(req, res) {
  const { reservation_id, event_token, tap_id } = req.query;
  let errorFailureUrl = null;

  try {
    // Fetch payment and reservation details
    const [detailPayment] = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Normal" });
    const [reservationDetail] = await global
      .knexConnection("ms_reservation")
      .select("ms_reservation.*", "ms_event.org_id", "ms_event.event_is_active")
      .leftJoin("ms_event", "ms_event.event_id", "ms_reservation.event_id")
      .where({ reservation_id, event_is_active: "Y" });

    if (!detailPayment || !reservationDetail) {
      return sendResponse(res, 400, "Detail Not Found");
    }

    const { success_frontend_url, failed_frontend_url } = detailPayment;
    errorFailureUrl = failed_frontend_url;
    const { org_id } = reservationDetail;

    // Fetch payment credentials
    const paymentCredential = await PaymentCredentialFunction({
      org_id,
      setting_key: "tap_pay_payment",
    });

    if (paymentCredential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }

    const { MERCHANT_ID, SOURCE_ID, URL, PAYTAP_SECRET_KEY } =
      paymentCredential.data;

    if (!MERCHANT_ID || !SOURCE_ID || !URL || !PAYTAP_SECRET_KEY) {
      return sendResponse(res, 400, "Invalid Payment Credentials");
    }

    // Make the API request to TapPay to get payment status
    const paymentStatusResponse = await axios.get(`${URL}/${tap_id}`, {
      headers: {
        Authorization: `Bearer ${PAYTAP_SECRET_KEY}`,
        Accept: "application/json",
      },
    });

    const paymentStatus = paymentStatusResponse.data.status.toUpperCase();

    if (paymentStatus === "CAPTURED") {
      // Payment successful, update payment details
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id, booking_type: "Normal" })
        .update({
          is_paid: "Y",
          payment_capture: JSON.stringify(paymentStatusResponse.data),
        });

      // Prepare the redirect URL for successful payment
      const [BACKEND_URL] = await global
        .knexConnection("global_options")
        .where({ go_key: "BASE_URL_BACKEND" });

      const BASEURL = BACKEND_URL.go_value;
      const transactionResponse = await axios.post(
        `${BASEURL}/payment/createTransation/${reservation_id}`,
        {},
        { headers: { Authorization: event_token } },
      );

      if (transactionResponse?.data?.status) {
        return res.redirect(
          `${success_frontend_url}/${transactionResponse.data.booking_code}`,
        );
      } else {
        console.log("Failed to create transaction");
        return res.redirect(failed_frontend_url);
      }
    } else {
      // Payment failed, update payment capture and redirect to failure URL
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id, booking_type: "Normal" })
        .update({
          payment_capture: JSON.stringify({
            ...paymentStatusResponse.data,
            queryData: req.query,
          }),
        });

      return res.redirect(failed_frontend_url);
    }
  } catch (error) {
    winstonLogger.error("Error in tapPayment.js 2:", error);
    console.error("Error in confirmTapPayment:", error);

    // If an error occurs, update payment capture and redirect to failure URL
    await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Normal" })
      .update({
        payment_capture: JSON.stringify(req.query),
      });

    if (!errorFailureUrl) {
      errorFailureUrl = process.env.FRONTENDURL;
    }

    return res.redirect(errorFailureUrl);
  }
}

export async function tapPaymentCheckoutOnlyShop(req, res) {
  const {
    reservation_id,
    customer_name,
    customer_email,
    customer_mobile,
    country_code,
    is_guest,
    success_frontend_url,
    failed_frontend_url,
  } = req.body;

  let logged_in_customer_id = req["logged_in_customer_id"] || null;
  let org_id = 1;
  let defaultCurrency = "USD";

  try {
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

    const reservedShopItems = await global
      .knexConnection("reserve_shop_items")
      .select("item_quantity", "item_price")
      .where({ reservation_id, is_reserved: "Y" });

    if (!reservedShopItems.length) {
      return sendResponse(res, 400, "No reserved shop items found");
    }

    let totalAmount = 0;
    for (let item of reservedShopItems) {
      totalAmount +=
        parseFloat(item.item_price) * parseFloat(item.item_quantity);
    }

    if (totalAmount <= 0) {
      return sendResponse(res, 400, "Invalid total amount for shop items");
    }

    const [BACKEND_URL] = await global
      .knexConnection("global_options")
      .where({ go_key: "BASE_URL_BACKEND" });

    const webtoken = req.header("authorization");
    const BASEURL = BACKEND_URL.go_value;
    const redirectUrl = `${BASEURL}/payment/confirmTapPaymentOnlyShop?reservation_id=${reservation_id}&event_token=${webtoken}`;

    const defaultCurrency = defaultCurrency;

    const payment_credential = await PaymentCredentialFunction({
      org_id: org_id,
      setting_key: "tap_pay_payment",
    });

    if (payment_credential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }

    const { MERCHANT_ID, SOURCE_ID, URL, PAYTAP_SECRET_KEY } =
      payment_credential.data;

    if (!MERCHANT_ID || !SOURCE_ID || !URL || !PAYTAP_SECRET_KEY) {
      return sendResponse(res, 400, "Missing Payment Data");
    }

    const tapPaymentObject = {
      amount: totalAmount.toFixed(2),
      currency: defaultCurrency,
      threeDSecure: true,
      save_card: false,
      customer_initiated: true,
      description: "",
      statement_descriptor: "Sample",
      metadata: { udf1: "shop_only", udf2: "tappay_only_shop" },
      reference: {
        transaction: `trx_shop_${reservation_id}`,
        order: reservation_id,
      },
      receipt: { email: true, sms: false },
      customer: {
        first_name: "-",
        last_name: "-",
        email: customer_email,
        phone: { country_code, number: customer_mobile },
      },
      merchant: { id: MERCHANT_ID },
      source: { id: SOURCE_ID },
      redirect: { url: redirectUrl },
    };

    const paymentData = JSON.stringify(tapPaymentObject);
    const config = {
      method: "post",
      url: URL,
      headers: {
        Authorization: `Bearer ${PAYTAP_SECRET_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      data: paymentData,
    };

    const response = await axios.request(config);

    let currentDateTimeNew = currentDateTime(null, "YYYY-MM-DD HH:mm:ss", null);
    let checkGuest = is_guest;

    if (!logged_in_customer_id) {
      checkGuest = "Y";
      logged_in_customer_id = 0;
    } else {
      checkGuest = "N";
      logged_in_customer_id = logged_in_customer_id;
    }

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
      pm_id: 1,
      payment_request: paymentData,
      booking_type: "Shop_only",
    };

    await global
      .knexConnection("ms_payment_booking_detail")
      .insert(insertPaymentDetail);
    return sendResponse(res, 200, "Success", {
      payment_mode: "tappay",
      data: response.data.transaction.url,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred during the shop-only payment process.",
      error,
    );
  }
}

export async function confirmTapPaymentOnlyShop(req, res) {
  const { reservation_id, event_token, tap_id } = req.query;
  let errorFailureUrl = null;
  let org_id = 1;

  try {
    const [detailPayment] = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Shop_only" });

    if (!detailPayment) {
      return sendResponse(res, 400, "Detail Not Found");
    }

    const {
      success_frontend_url,
      failed_frontend_url,
      c_name,
      email,
      phone_number,
    } = detailPayment;
    errorFailureUrl = failed_frontend_url;

    const paymentCredential = await PaymentCredentialFunction({
      org_id: org_id,
      setting_key: "tap_pay_payment",
    });

    if (paymentCredential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }

    const { MERCHANT_ID, SOURCE_ID, URL, PAYTAP_SECRET_KEY } =
      paymentCredential.data;

    if (!MERCHANT_ID || !SOURCE_ID || !URL || !PAYTAP_SECRET_KEY) {
      return sendResponse(res, 400, "Invalid Payment Credentials");
    }

    const paymentStatusResponse = await axios.get(`${URL}/${tap_id}`, {
      headers: {
        Authorization: `Bearer ${PAYTAP_SECRET_KEY}`,
        Accept: "application/json",
      },
    });

    const paymentStatus = paymentStatusResponse.data.status.toUpperCase();

    if (paymentStatus === "CAPTURED") {
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id, booking_type: "Shop_only" })
        .update({
          is_paid: "Y",
          payment_capture: JSON.stringify(paymentStatusResponse.data),
        });

      const [BACKEND_URL] = await global
        .knexConnection("global_options")
        .where({ go_key: "BASE_URL_BACKEND" });
      const BASEURL = BACKEND_URL?.go_value;

      const transactionResponse = await axios.post(
        `${BASEURL}/payment/createTransactionShopOnly/${reservation_id}`,
        {},
        { headers: { Authorization: event_token } },
      );

      if (
        transactionResponse?.data?.status &&
        transactionResponse?.data?.booking_code
      ) {
        return res.redirect(
          `${success_frontend_url}/${transactionResponse.data.booking_code}`,
        );
      }
      return res.redirect(success_frontend_url);
    } else {
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id, booking_type: "Shop_only" })
        .update({
          payment_capture: JSON.stringify({
            ...paymentStatusResponse.data,
            queryData: req.query,
          }),
        });

      return res.redirect(failed_frontend_url);
    }
  } catch (error) {
    winstonLogger.error("Error in confirmTapPaymentOnlyShop:", error);

    await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id, booking_type: "Shop_only" })
      .update({
        payment_capture: JSON.stringify(req.query),
      });

    if (!errorFailureUrl) {
      errorFailureUrl = process.env.FRONTENDURL;
    }

    return res.redirect(errorFailureUrl);
  }
}
