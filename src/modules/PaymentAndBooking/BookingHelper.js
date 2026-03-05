import { Region, SeatsioClient } from "seatsio";
import { checkValidation } from "../../lib/checkValidation.js";
import {
  currentDateTime,
  SeatsIoCredentialFunction,
} from "../../lib/helper.js";
import axios from "axios";
import { EVENT_DATA } from "../Event/EventController.js";

import { sendResponse } from "../../lib/responseService.js";

export async function createTransation(req, res) {
  let reqbody = { ...req.body, ...req.params };
  const { user_info } = req;
  const isWebsiteUser = req["is_website_user"] || false;
  const { reservation_id } = reqbody;
  let checkFields = ["reservation_id"];

  // Validate incoming data
  let result = await checkValidation(checkFields, reqbody);
  if (!result.status) {
    return sendResponse(res, 400, "Validation Error", result);
  }

  try {
    // Fetch reservation details
    let getReservationDetail = await global
      .knexConnection("ms_reservation")
      .where({ reservation_id, is_reserved: "Y" });

    if (!getReservationDetail.length) {
      throw new Error("Reservation not found or seat is released/booked");
    }

    let getPaymentDetail = [];
    let qrUrl = "";

    // If the user is from the website, get payment details
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
          "payment_transaction_id"
        )
        .leftJoin(
          "ms_payment_mode",
          "ms_payment_mode.pm_id",
          "ms_payment_booking_detail.pm_id"
        )
        .where({ reservation_id, is_paid: "Y" });

      if (!getPaymentDetail.length) {
        return sendResponse(res, 400, "Payment Not Done from Website");
      }
    }

    let currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      getReservationDetail[0].timezone_name
    );

    let event_data_all = await EVENT_DATA({
      event_id: getReservationDetail[0].event_id,
      event_sch_id: getReservationDetail[0].event_sch_id,
    });

    let event_data = event_data_all.Records[0];
    qrUrl = getPaymentDetail[0].success_frontend_url;
    let insertObj = {
      event_id: getReservationDetail[0].event_id,
      schedule_id: getReservationDetail[0].event_sch_id,
      c_email: getPaymentDetail[0]?.email || null,
      c_name: getPaymentDetail[0]?.c_name || null,
      c_country_code: getPaymentDetail[0]?.country_code || null,
      is_guest: getPaymentDetail[0]?.is_guest || null,
      customer_id: getPaymentDetail[0]?.customer_id || 0,
      c_phone_number: getPaymentDetail[0]?.phone_number || null,
      event_name: event_data.event_name,
      cinema_name: event_data.cinema_name,
      cinema_email: event_data.cinema_email || null,
      city_name: event_data.city_name || null,
      country: event_data.country_name || null,
      timezone: event_data.tz_name || null,
      currency: event_data.curr_code || null,
      payment_mode_id: getPaymentDetail[0]?.pm_id || null,
      payment_mode: getPaymentDetail[0]?.payment_mode_name || null,
      booking_type_name: isWebsiteUser ? "Website" : "Box Office",
      event_date: event_data.event_sch_array
        ? event_data.event_sch_array[0].sch_date
        : null,
      event_time: event_data.event_sch_array
        ? event_data.event_sch_array[0].sch_time
        : null,
      booking_date_time: currentDateTimeNew,
      created_by: (user_info && user_info.user_id) || null,
      total_seats: 0,
      seats_scanned: 0,
      seats_tobe_scanned: 0,
      reservation_id,
      payment_transaction_id: getPaymentDetail[0].payment_transaction_id,
      exchange_rate: event_data.exchange_rate || 1,
      pay_currency_id: event_data.pay_currency_id || null,
    };

    let checkExistingBooking = await global.knexConnection("ms_booking").where({
      reservation_id,
    });

    if (checkExistingBooking && checkExistingBooking.length) {
      return sendResponse(res, 400, "Transaction already initiated");
    }

    // Handle seat booking for event seating type "seats_io"
    if (event_data.event_seating_type === "seats_io") {
      let bookSeatsArray = [];
      getReservationDetail.forEach((z) => {
        if (z.row_name && z.row_name === "GA-") {
          bookSeatsArray.push({
            objectId: z.seat_type,
            quantity: parseInt(z.column_name),
          });
        } else {
          bookSeatsArray.push(
            z.seat_type + "-" + z.row_name + "-" + z.column_name
          );
        }
      });

      const seatsio_credential = await SeatsIoCredentialFunction({
        org_id: event_data.org_id,
        setting_key: "seats_io",
      });

      if (seatsio_credential.false) {
        return sendResponse(res, 400, "Seats.io Credential not found");
      }

      const { SEATSIO_SECRET_WORKSPACE_KEY } = seatsio_credential.data;

      let client = new SeatsioClient(Region.EU(), SEATSIO_SECRET_WORKSPACE_KEY);

      try {
        const bookResponse = await client.events.book(
          getReservationDetail[0].seatsio_eventkey,
          bookSeatsArray,
          getReservationDetail[0].seatsio_holdtoken
        );

        for (const key in bookResponse.objects) {
          if (bookResponse.objects.hasOwnProperty(key)) {
            const value = bookResponse.objects[key];
            if (
              value.status.toLowerCase() !== "booked" &&
              value.objectType !== "generalAdmission"
            ) {
              return sendResponse(res, 400, "Issue in Seats.io Booking");
            }
          }
        }
      } catch (error) {
        return sendResponse(res, 500, "Issue in Seats.io Booking", error);
      }
    }

    // Insert booking record into the database
    let insertBookingId = await global
      .knexConnection("ms_booking")
      .insert(insertObj);

    let transaction_array = [];
    let seatNames = [];
    let totalSeats = 0;
    let totalAmount = 0;
    let totalBeforeDiscount = 0;
    let voucher_code = "";
    let discountValue = 0;
    let discountPercent = "";

    getReservationDetail.forEach((z) => {
      if (event_data.event_seating_type === "N") {
        seatNames.push(z.seat_type + "-" + z.no_of_seats);
        totalAmount +=
          parseFloat(z.seat_price) *
          (z.no_of_seats ? parseFloat(z.no_of_seats) : 1);
        totalSeats += parseInt(z.no_of_seats);
      } else {
        seatNames.push(z.seat_type + "-" + z.seat_name);
        totalAmount += parseFloat(z.seat_price);
      }

      totalAmount *= event_data.exchange_rate
        ? parseFloat(event_data.exchange_rate)
        : 1;

      totalBeforeDiscount = totalAmount;

      //check for voucher discount here
      if (z.voucher_applied == "Y") {
        totalAmount -= parseFloat(z.voucher_discount_amount || 0);
        discountValue += parseFloat(z.voucher_discount_amount || 0);
        discountPercent = z.voucher_discount_percent;
        voucher_code = z.voucher_code;
      }

      //check for pass discount here
      if (z.pass_applied == "Y") {
        totalAmount -= parseFloat(z.pass_discount_amount || 0);
        discountValue += parseFloat(z.pass_discount_amount || 0);
        discountPercent = z.pass_discount_percent;
        voucher_code = z.pass_code;
      }

      let obj = {
        booking_id: insertBookingId[0],
        seat_name: z.seat_name,
        seat_type: z.seat_type,
        seat_group_id: z.seat_group_id,
        seat_price: z.seat_price,
        no_of_seats: z.no_of_seats,
      };
      transaction_array.push({ ...obj });
    });

    // Add reserved shop items amount once per reservation
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

    if (event_data.event_booking_fees && event_data.event_booking_fees > 0) {
      let booking_fee_value =
        (parseFloat(event_data.event_booking_fees) / 100) * totalAmount;
      totalAmount = totalAmount + booking_fee_value;
    }

    if (event_data.event_seating_type === "N") {
      console.log(totalSeats, "totalSeats");
    } else {
      totalSeats = seatNames.length;
    }

    await global
      .knexConnection("ms_booking_transaction")
      .insert(transaction_array);

    let booking_code = event_data.event_prefix_code
      ? event_data.event_prefix_code
      : "TKT";
    let prefix_array = ["00000", "0000", "000", "00", "0"];
    let string_length = String(insertBookingId[0]).length - 1;
    let booking_number_new = prefix_array[string_length]
      ? `${prefix_array[string_length]}${insertBookingId[0]}`
      : insertBookingId[0];
    booking_code += booking_number_new;

    // Update relevant tables after booking
    await global
      .knexConnection("ms_reservation")
      .where({ reservation_id })
      .update({ is_booked: "Y" });

    await global
      .knexConnection("reserve_shop_items")
      .where({ reservation_id })
      .update({ is_booked: "Y" });

    await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id })
      .update({ is_booked: "Y" });

    await global
      .knexConnection("ms_booking")
      .where({ booking_id: insertBookingId[0] })
      .update({
        booking_code,
        total_seats: totalSeats,
        seats_tobe_scanned: totalSeats,
        seat_names: seatNames.join(", "),
        total_price: totalAmount.toFixed(3),
        voucher_code: voucher_code,
        discount_percent: discountPercent,
        discount_value: discountValue,
        total_before_discount: totalBeforeDiscount,
      });

    return sendResponse(res, 200, "Transaction created successfully", {
      booking_code: booking_code,
    });
  } catch (error) {
    return sendResponse(res, 500, "Transaction creation failed", error);
  }
}

//Skip Payment Gateway when payment amount is 0

export const skipPaymentGateway = async (reqbody) => {
  let {
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
  } = reqbody;

  // Validation for required fields
  if (
    !reservation_id ||
    !event_data ||
    !success_frontend_url ||
    !failed_frontend_url
  ) {
    return { status: false, message: "Missing required fields." };
  }

  const currentDateTimeNew = currentDateTime(
    null,
    "YYYY-MM-DD HH:mm:ss",
    event_data[0].tz_name
  );

  // Check if the customer exists in the database
  let checkGuest = is_guest;

  try {
    if (!logged_in_customer_id) {
      checkGuest = "Y";
      logged_in_customer_id = 0;
    } else {
      checkGuest = "N";
      logged_in_customer_id = logged_in_customer_id;
    }

    // Insert payment details into the database
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
      is_booked: "Y",
      is_paid: "Y",
    };

    await global
      .knexConnection("ms_payment_booking_detail")
      .insert(insertPaymentDetail);

    // Get the base URL for the backend
    const [BACKEND_URL] = await global.knexConnection("global_options").where({
      go_key: "BASE_URL_BACKEND",
    });
    const BASEURL = BACKEND_URL ? BACKEND_URL.go_value : "";

    if (!BASEURL) {
      return { status: false, message: "Backend URL not found." };
    }

    // Make the request to the transaction API
    const config = {
      method: "post",
      url: `${BASEURL}/payment/createTransation/${reservation_id}`,
      headers: {
        Authorization: webtoken,
      },
    };

    const transactionResponse = await axios(config);

    // Handle the transaction response and determine the redirect URL
    let redirectToUrl = failed_frontend_url; // Default to failed URL
    if (
      transactionResponse?.data?.status &&
      transactionResponse.data.booking_code
    ) {
      redirectToUrl = `${success_frontend_url}/${transactionResponse.data.booking_code}`;
    } else {
      console.log("Transaction failed:", transactionResponse?.data);
    }

    return {
      message: "Payment skipped successfully",
      status: true,
      redirectTo: redirectToUrl,
    };
  } catch (error) {
    console.log(error, "error in skipping payment");
    return {
      status: false,
      message: "Something went wrong in skipping payment.",
    };
  }
};
