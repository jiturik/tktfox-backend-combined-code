import moment from "moment";
import { Region, SeatsioClient } from "seatsio";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import archiver from "archiver";

const readdir = promisify(fs.readdir);
const access = promisify(fs.access);

import { checkValidation } from "../../lib/checkValidation.js";
import {
  currentDateTime,
  SeatsIoCredentialFunction,
} from "../../lib/helper.js";
import { EVENT_DATA } from "../Event/EventController.js";
import { v4 as uuidv4 } from "uuid";

import { sendResponse } from "../../lib/responseService.js";

const checkPriceData = (seatLayoutData, price_array) => {
  let price_data = {
    status: true,
    records: [],
  };

  try {
    // Create a Set for fast lookup of prices
    const priceLookup = new Map();
    price_array.forEach((priceData) => {
      const key = `${priceData.groupId}-${priceData.price}`;
      priceLookup.set(key, priceData);
    });

    // Iterate over seatLayoutData and check prices
    seatLayoutData.forEach((seatData) => {
      const key = `${seatData.seatGroupId}-${seatData.seatPrice}`;

      if (!priceLookup.has(key)) {
        price_data.records.push(seatData);
        price_data.status = false; // Update status once a mismatch is found
      }
    });
  } catch (error) {
    price_data.status = false;
    price_data.records = [];
    return sendResponse(res, 500, "Error in checkPriceData function", error);
  }

  return price_data;
};

const checkSeatsAvailableWithoutSL = async ({
  event_sch_id,
  seatLayoutData,
}) => {
  let seatCheck = {
    status: true,
    records: [],
  };

  try {
    // Fetch booked seat details grouped by seat_type_id
    const checkBookedSeats = await global
      .knexConnection("ms_reservation")
      .select(
        global.knexConnection.raw(
          "seat_type_id, sum(no_of_seats) as total_seats"
        )
      )
      .where({ event_sch_id, is_reserved: "Y" })
      .groupBy("seat_type_id");

    // Fetch seat type data for the event schedule
    const seatTypeData = await global
      .knexConnection("event_sch_seat_type")
      .select("available_seats", "sct_id")
      .where({ event_sch_id });

    // Fetch max capacity for the event schedule
    const event_data_sch = await global
      .knexConnection("event_schedule")
      .select("sch_max_capacity")
      .where({ event_sch_id });

    // Early return if necessary data is missing
    if (
      !checkBookedSeats.length ||
      !seatTypeData.length ||
      !event_data_sch.length
    ) {
      return seatCheck;
    }

    // Calculate total booked seats
    let totalBookedSeats = checkBookedSeats.reduce(
      (n, { total_seats }) => n + parseInt(total_seats),
      0
    );
    let totalScheduleMaxSeats = parseInt(
      event_data_sch[0].sch_max_capacity || 0
    );

    // Create a map of seat_type_id to available seats, considering booked seats
    let seatAvailabilityMap = new Map();
    seatTypeData.forEach(({ available_seats, sct_id }) => {
      let bookedSeats = 0;
      let bookedData = checkBookedSeats.find(
        ({ seat_type_id }) => seat_type_id === sct_id
      );
      if (bookedData) {
        bookedSeats = parseInt(bookedData.total_seats);
      }
      seatAvailabilityMap.set(sct_id, parseInt(available_seats) - bookedSeats);
    });

    // Check seat availability for the layout data
    seatLayoutData.forEach((seat) => {
      if (seatCheck.status) {
        const totalSeatsInLayout = parseInt(seat.noOfSeats);
        const updatedBookedSeats = totalBookedSeats + totalSeatsInLayout;

        // Check if booking exceeds max capacity
        if (updatedBookedSeats > totalScheduleMaxSeats) {
          seatCheck.status = false;
          seatCheck.records.push(seat);
        }

        // Check if the seat type has enough available seats
        const availableSeats = seatAvailabilityMap.get(seat.sct_id);
        if (
          availableSeats === undefined ||
          totalSeatsInLayout > availableSeats
        ) {
          seatCheck.status = false;
          seatCheck.records.push(seat);
        }

        totalBookedSeats = updatedBookedSeats;
      }
    });
  } catch (error) {
    seatCheck.status = false;
    seatCheck.records = [];
    return sendResponse(
      res,
      500,
      "Error in checkSeatsAvailableWithoutSL function",
      error
    );
  }

  return seatCheck;
};

const checkPriceDataWithoutSL = (seatLayoutData, price_array) => {
  let price_data = {
    status: true,
    records: [],
  };

  try {
    // Create a Map of price data for fast lookup
    const priceMap = new Map();
    price_array.forEach((priceData) => {
      const key = `${priceData.sct_id}-${priceData.price_per_seat}`;
      priceMap.set(key, priceData);
    });

    // Iterate over seatLayoutData
    seatLayoutData.forEach((seatData) => {
      const key = `${seatData.sct_id}-${seatData.price_per_seat}`;

      // Check if the price data for this seat exists in the price map
      if (!priceMap.has(key) && price_data.status) {
        price_data.records.push(seatData);
        price_data.status = false; // No need to keep checking after the first mismatch
      }
    });
  } catch (error) {
    price_data.status = false;
    price_data.records = [];
    return sendResponse(
      res,
      500,
      "Error in checkPriceDataWithoutSL function",
      error
    );
  }

  return price_data;
};

export const addReservationSeat = async (req, res) => {
  let reqbody = req.body;
  const { user_info } = req;
  const { event_sch_id, event_id, selectedSeatsArray } = reqbody;

  try {
    // Validate required fields
    const checkFields = ["event_sch_id", "event_id", "selectedSeatsArray"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Event Schedule, Event or Seats not found");
    }

    // Validate seats in parallel
    const seatValidationPromises = selectedSeatsArray.map(async (seatsObj) => {
      const checkFieldsAr = [
        "seatGroupId",
        "seatPrice",
        "seatType",
        "seatRowName",
        "seatColName",
      ];
      let result2 = await checkValidation(checkFieldsAr, seatsObj);
      if (!result2.status) {
        throw new Error(
          `Seat validation failed for ${seatsObj.seatRowName}${seatsObj.seatColName}`
        );
      }

      // Check if the seat is already reserved
      const checkAlready = await global.knexConnection("ms_reservation").where({
        is_reserved: "Y",
        seat_name: `${seatsObj.seatRowName}${seatsObj.seatColName}`,
        seat_group_id: seatsObj.seatGroupId,
        event_sch_id,
      });

      if (checkAlready.length) {
        throw new Error(
          `Seat ${seatsObj.seatRowName}${seatsObj.seatColName} already reserved.`
        );
      }

      return {
        seat_group_id: seatsObj.seatGroupId,
        seat_type: seatsObj.seatType,
        seat_name: `${seatsObj.seatRowName}${seatsObj.seatColName}`,
        row_name: seatsObj.seatRowName,
        column_name: seatsObj.seatColName,
        seat_price: seatsObj.seatPrice,
      };
    });

    // Wait for all seat validations to complete

    let arrayData;
    try {
      arrayData = await Promise.all(seatValidationPromises);
    } catch (error) {
      return sendResponse(res, 400, "Error in adding reservation seat", error);
    }
    // let arrayData = await Promise.all(seatValidationPromises).catch((error) => {
    //   return sendResponse(res, 400, "Error in adding reservation seat");
    // });

    // Generate unique reservation ID
    let reservation_id = uuidv4();

    // Fetch event data and schedule validation
    let event_data_all = await EVENT_DATA({ event_id });
    let event_data = event_data_all.Records;
    if (!event_data.length) {
      return sendResponse(res, 400, "Event Doesn't Exist");
    }

    let event_data_sch = await global
      .knexConnection("event_schedule")
      .where({ event_sch_id });

    if (!event_data_sch.length) {
      return sendResponse(res, 400, "Event Schedule Doesn't Exist");
    }

    // Fetch seat layout data and validate price
    let seatLayoutData = await global
      .knexConnection("ms_seat_layout")
      .select("price_data")
      .where({ sl_id: event_data[0].sl_id });

    if (!seatLayoutData.length) {
      return sendResponse(res, 400, "Seat Layout Doesn't Exist");
    }

    let priceArray = seatLayoutData[0].price_data
      ? JSON.parse(seatLayoutData[0].price_data)
      : [];
    let checkPrice = checkPriceData(arrayData, priceArray || []);

    if (!checkPrice.status) {
      return sendResponse(res, 400, "Price not matched");
    }

    // Get current time for reservation creation
    let currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      event_data[0].tz_name
    );

    // Prepare data for insertion
    const insertData = arrayData.map((z) => ({
      ...z,
      reservation_id,
      event_sch_id,
      event_id,
      is_seat_layout_exist: event_data[0].event_seating_type,
      created_at: currentDateTimeNew,
      timezone_name: event_data[0].tz_name,
      created_by: user_info ? user_info.user_id : null,
      seat_release_time: event_data[0].cinema_seat_release_time || 15,
    }));

    // Use transaction for safer insertion
    await global.knexConnection.transaction(async (trx) => {
      await trx("ms_reservation").insert(insertData);
    });

    // Respond with success and the reservation ID
    return sendResponse(res, 200, "Reservation seat added successfully", {
      reservation_id: reservation_id,
    });
  } catch (error) {
    return sendResponse(res, 500, "Error in adding reservation seat", error);
  }
};

export const addReservationSeatWithoutSeatlayout = async (req, res) => {
  let reqbody = req.body;
  const { user_info } = req;
  const { event_sch_id, event_id, selectedSeatsArray } = reqbody;

  try {
    // Validate required fields
    const checkFields = ["event_sch_id", "event_id", "selectedSeatsArray"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    // Validate each seat in parallel
    const seatValidationPromises = selectedSeatsArray.map(async (seatsObj) => {
      const checkFieldsAr = [
        "sct_id",
        "price_per_seat",
        "seat_class_name",
        "noOfSeats",
      ];
      let result2 = await checkValidation(checkFieldsAr, seatsObj);
      if (!result2.status) {
        throw new Error(`Seat validation failed for ${seatsObj.sct_id}`);
      }

      return {
        seat_type_id: seatsObj.sct_id,
        seat_type: seatsObj.seat_class_name,
        no_of_seats: seatsObj.noOfSeats,
        seat_price: seatsObj.price_per_seat,
      };
    });

    // Wait for all seat validations to complete

    let arrayData;
    try {
      arrayData = await Promise.all(seatValidationPromises);
    } catch (error) {
      console.error("Seat validation error:", error);
      return sendResponse(res, 400, "Error in adding reservation seat", error);
    }

    if (!Array.isArray(arrayData) || !arrayData.length) {
      return sendResponse(res, 400, "Invalid or empty seat data.");
    }
    // let arrayData = await Promise.all(seatValidationPromises).catch((error) => {
    //   return sendResponse(res, 400, "Error in adding reservation seat");
    // });

    // Check seat availability
    let checkSeatExist = await checkSeatsAvailableWithoutSL({
      event_sch_id,
      seatLayoutData: selectedSeatsArray,
    });

    if (!checkSeatExist.status) {
      return sendResponse(res, 400, "Seat Already Booked or Reserved");
    }

    // Generate unique reservation ID
    let reservation_id = uuidv4();

    // Get event data for validation
    let event_data_all = await EVENT_DATA({ event_id });
    let event_data = event_data_all.Records;
    if (!event_data.length) {
      return sendResponse(res, 400, "Event Doesn't Exist");
    }

    // Check if the event schedule exists
    let event_data_sch = await global
      .knexConnection("event_schedule")
      .where({ event_sch_id });

    if (!event_data_sch.length) {
      return sendResponse(res, 400, "Schedule Doesn't Exist");
    }

    // Fetch seat price data for price validation
    let priceArray = await global
      .knexConnection("event_sch_seat_type")
      .select("sct_id", "price_per_seat")
      .where({ event_sch_id });

    if (!priceArray.length) {
      return sendResponse(res, 400, "Seat Layout Doesn't Exist");
    }

    // Validate price data
    let checkPrice = checkPriceDataWithoutSL(
      selectedSeatsArray,
      priceArray || []
    );
    if (!checkPrice.status) {
      return sendResponse(res, 400, "Price Unmatched");
    }

    // Get current time for reservation creation
    let currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      event_data[0].tz_name
    );

    // Prepare common data for insertion
    const duplicateData = {
      reservation_id,
      event_sch_id,
      event_id,
      is_seat_layout_exist: event_data[0].event_seating_type,
      created_at: currentDateTimeNew,
      timezone_name: event_data[0].tz_name,
      created_by: user_info ? user_info.user_id : null,
      seat_release_time: event_data[0].cinema_seat_release_time || 15,
    };

    // Prepare data for bulk insertion
    let insertData = arrayData.map((z) => ({
      ...z,
      ...duplicateData,
    }));

    if (!insertData || !insertData.length) {
      return sendResponse(res, 400, "No reservation data to insert.");
    }

    // Use transaction to ensure consistency
    await global.knexConnection.transaction(async (trx) => {
      await trx("ms_reservation").insert(insertData);
    });

    // Respond with the reservation ID
    return sendResponse(res, 200, "Reservation Added Successfully", {
      reservation_id: reservation_id,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while adding reservation seat.",
      error
    );
  }
};

export const getReservationSeat = async (req, res) => {
  let reqbody = { ...req.body, ...req.params };
  const { reservation_id } = reqbody;
  const Booking_time = 10; // Default booking time in minutes

  try {
    // Validate reservation_id
    const checkFields = ["reservation_id"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    // Get reservation details
    let getReservationDetail = await global
      .knexConnection("ms_reservation")
      .where({ reservation_id, is_reserved: "Y" });

    if (!getReservationDetail.length) {
      return sendResponse(
        res,
        400,
        "Reservation not found or seat is released"
      );
    }

    // Get current date/time
    let currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      getReservationDetail[0].timezone_name
    );

    let obj = {
      seat_name: [],
      totalprice: 0,
      minutes: 0,
      seconds: 0,
      reserved_time: "",
      release_time: "",
      discountValue: 0,
      voucher_code: "",
      discountPercent: "",
      priceBeforeDiscount: 0,
      backend_api_route: null,
      currentDateTime: currentDateTimeNew,
      pass_applied: false,
      booking_fee_value: 0,
      actualAmount: 0,
      booking_fee_percent: "",
    };

    // Fetch event data
    const event_data = await EVENT_DATA({
      event_id: getReservationDetail[0].event_id,
      event_sch_id: getReservationDetail[0].event_sch_id,
    });

    //fetch cinema payment gateway
    const cinemaPaymentGateway = await global
      .knexConnection("organization_setting")
      .where({ org_id: event_data.Records[0].org_id })
      .where((builder) =>
        builder
          .where({ setting_key: "tap_pay_payment" })
          .orWhere({ setting_key: "payone_payment" })
          .orWhere({ setting_key: "mpgs_network_payment" })
      );

    // Process reservation details
    getReservationDetail.forEach((z) => {
      obj.seat_name.push(z.seat_name);
      const seatPrice = parseFloat(z.seat_price);
      const noOfSeats = parseFloat(z.no_of_seats) || 1;
      obj.priceBeforeDiscount += parseFloat(seatPrice) * noOfSeats;

      obj.totalprice += parseFloat(seatPrice) * noOfSeats;
      obj.reserved_time = moment(z.created_at).format("YYYY-MM-DD HH:mm:ss");
      obj.release_time = moment(z.created_at)
        .add(z.seat_release_time || Booking_time, "minutes")
        .format("YYYY-MM-DD HH:mm:ss");

      //check for voucher discount here
      if (z.voucher_applied == "Y") {
        obj.totalprice -= parseFloat(z.voucher_discount_amount || 0);
        obj.discountValue += parseFloat(z.voucher_discount_amount);
      }

      //check for pass discount here

      if (z.pass_applied == "Y") {
        obj.totalprice -= parseFloat(z.pass_discount_amount || 0);
        obj.pass_applied = true;
        obj.discountPercent = `${z.pass_discount_percent}%`;
        obj.discountValue = parseFloat(z.pass_discount_amount);
      }
    });

    // Calculate time difference for reservation release
    obj.seconds =
      moment(obj.release_time).diff(moment(obj.currentDateTime), "seconds") %
      60;
    obj.minutes =
      moment(obj.release_time).diff(moment(obj.currentDateTime), "minutes") %
      60;

    // add voucher discount details in response if available
    if (getReservationDetail[0].voucher_applied == "Y") {
      obj.voucher_code = getReservationDetail[0].voucher_code;
      obj.discountPercent = `${getReservationDetail[0].voucher_discount_percent}%`;
      // obj.discountValue = parseFloat(
      //   getReservationDetail[0].voucher_discount_amount
      // );
    }

    if (
      event_data.Records[0].event_booking_fees &&
      event_data.Records[0].event_booking_fees > 0 &&
      obj.totalprice > 0
    ) {
      obj.booking_fee_percent = event_data.Records[0].event_booking_fees + "%";
      obj.booking_fee_value =
        (parseFloat(event_data.Records[0].event_booking_fees) / 100) *
        obj.totalprice;
      obj.actualAmount = obj.totalprice;
      obj.totalprice = obj.totalprice + obj.booking_fee_value;
    }

    // Get cinema payment gateway information
    if (cinemaPaymentGateway.length) {
      const apiRoute = JSON.parse(cinemaPaymentGateway[0].setting_data);
      obj.backend_api_route = apiRoute.PAYMENT_API_ROUTE;
    }

    // get reserved shop items

    const getReservedShopItems = await global
      .knexConnection("reserve_shop_items")
      .select(
        "reserve_shop_items.item_quantity",
        "shop_items.item_price",
        "reserve_shop_items.item_id",
        "shop_items.item_name",
        "shop_items.item_image"
      )
      .join(
        "shop_items",
        "reserve_shop_items.item_id",
        "=",
        "shop_items.item_id"
      )
      .where({ reservation_id })
      .where({ "reserve_shop_items.is_reserved": "Y" });

    if (getReservedShopItems.length > 0) {
      for (let i of getReservedShopItems) {
        obj.totalprice +=
          parseFloat(i.item_price) * parseFloat(i.item_quantity);
      }
    }

    // Merge event data with the calculated reservation details
    event_data.Records[0] = {
      ...event_data.Records[0],
      ...obj,
    };
    return sendResponse(res, 200, "Success", {
      Records: [...event_data.Records],
      getReservationDetail,
      reservedShopItems: getReservedShopItems,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving reservation details.",
      error
    );
  }
};

export const resetReserveTime = async (req, res) => {
  let reqbody = { ...req.body, ...req.params };
  const { reservation_id } = reqbody;

  try {
    // Validate reservation_id
    const checkFields = ["reservation_id"];
    const result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Reservation ID is required");
    }

    // Get reservation details to ensure the reservation exists and is active
    const [getReservationDetail] = await global
      .knexConnection("ms_reservation")
      .where({ reservation_id, is_reserved: "Y" });

    if (!getReservationDetail) {
      return sendResponse(res, 400, "Reservation not found");
    }

    // Get current date and time based on the timezone of the reservation
    const currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      getReservationDetail.timezone_name
    );

    // Create the update object with the new timestamps
    const update_obj = {
      created_at: currentDateTimeNew,
      updated_at: currentDateTimeNew,
    };

    // Update the reservation with the new timestamps
    await global
      .knexConnection("ms_reservation")
      .update(update_obj)
      .where({ reservation_id });
    return sendResponse(res, 200, "Timer Reset");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while resetting the reservation time.",
      error
    );
  }
};

export const releaseSeats = async (req, res) => {
  const reqbody = { ...req.body, ...req.params };
  const { reservation_id } = reqbody;

  try {
    // Validate reservation_id
    const checkFields = ["reservation_id"];
    const validationResult = await checkValidation(checkFields, reqbody);
    if (!validationResult.status) {
      return sendResponse(res, 400, "Reservation ID is required");
    }

    // Get reservation details to ensure the reservation exists and is active
    const [reservation] = await global
      .knexConnection("ms_reservation")
      .where({ reservation_id, is_reserved: "Y" });

    if (!reservation) {
      return sendResponse(res, 400, "Seat Released or Already Booked");
    }

    // Get the current date and time based on the reservation's timezone
    const currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      reservation.timezone_name
    );

    // Prepare the object to update reservation status to "Released"
    const update_obj = { is_reserved: "N" };

    // Update the reservation status to "Released"
    await global
      .knexConnection("ms_reservation")
      .update(update_obj)
      .where({ reservation_id });

    // Return a success response
    return sendResponse(res, 200, "Seat Released", {
      Records: "Seat Released", // Success message
      update_obj, // Information about the updated reservation status
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while releasing the seat.",
      error
    );
  }
};

export const allReserveSeatBySchedule = async (req, res) => {
  let reqbody = { ...req.body, ...req.params };
  const { event_sch_id } = reqbody;

  try {
    // Validate event_sch_id
    let checkFields = ["event_sch_id"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Event Schedule ID is required");
    }

    // Fetch reserved seat details
    let getReservationDetail = await global
      .knexConnection("ms_reservation")
      .select([
        "seat_name",
        "seat_type",
        "seat_group_id",
        "column_name",
        "row_name",
        "no_of_seats",
        "seat_type_id",
      ])
      .where({ event_sch_id, is_reserved: "Y" });

    // Fetch manually blocked seat details
    let getManualBlockDetail = await global
      .knexConnection("event_manual_blocked_seats")
      .select([
        "seat_name",
        "seat_type",
        "column_name",
        "row_name",
        "seat_group_id",
        "event_id",
        "event_sch_id",
      ])
      .where({ event_sch_id });

    // Combine the results and return them in a response
    return sendResponse(res, 200, "All Reserved and Blocked Seats", {
      Records: [...getReservationDetail, ...getManualBlockDetail],
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving seat reservations.",
      error
    );
  }
};

export async function applyVoucher(req, res) {
  const reqbody = { ...req.query, ...req.body, ...req.params };
  const { reservation_id, event_id, voucher_code, seatCount } = reqbody;

  try {
    // Validate required fields
    if (!reservation_id || !event_id || !voucher_code) {
      return sendResponse(
        res,
        400,
        "Reservation ID, Event ID, and Voucher Code are required."
      );
    }

    // Fetch the voucher details from the database
    const getVoucher = await global.knexConnection("ms_vouchers").where({
      event_id: event_id,
      voucher_code: voucher_code,
      voucher_is_active: "Y",
    });

    // Check if the voucher exists
    if (!getVoucher.length) {
      return sendResponse(res, 400, "Invalid Voucher Code");
    }

    // Check if the voucher has already been applied to the reservation
    const getAddedVouchers = await global
      .knexConnection("ms_reserve_vouchers")
      .select("ms_reservation.reservation_id")
      .leftJoin(
        "ms_reservation",
        "ms_reservation.reservation_id",
        "ms_reserve_vouchers.reservation_id"
      )
      .where({
        "ms_reserve_vouchers.event_id": event_id,
        "ms_reserve_vouchers.voucher_code": voucher_code,
        "ms_reserve_vouchers.reservation_id": reservation_id,
        "ms_reservation.is_reserved": "Y",
      })
      .groupBy("ms_reserve_vouchers.reservation_id");

    // Check if voucher usage exceeds available quantity
    if (
      getAddedVouchers.length >=
      parseFloat(getVoucher[0].total_available_voucher)
    ) {
      return sendResponse(res, 400, "Total Voucher Code limit exceeded");
    }

    // Validate seat count against the voucher's minimum and maximum seat requirements
    const seatCountValue = parseFloat(seatCount);
    const { min_seats_required, max_seats_required } = getVoucher[0];

    if (seatCountValue < min_seats_required) {
      return sendResponse(
        res,
        400,
        `Minimum seat count should be greater than ${min_seats_required}`
      );
    }

    if (seatCountValue > max_seats_required) {
      return sendResponse(
        res,
        400,
        `Maximum seat count should not be greater than ${max_seats_required}`
      );
    }

    // Prepare the object to insert into ms_reserve_vouchers
    const voucherObj = {
      reservation_id,
      event_id,
      voucher_id: getVoucher[0].voucher_id,
      voucher_code,
      voucher_discount_percent: getVoucher[0].voucher_discount_value || 0,
      rv_is_active: "Y",
    };

    // Insert the voucher application into the database
    await global.knexConnection("ms_reserve_vouchers").insert(voucherObj);

    //get reservation data
    const reservation = await global
      .knexConnection("ms_reservation")
      .select("seat_price", "r_id", "no_of_seats")
      .where({ reservation_id, is_reserved: "Y" });

    //update voucher data in reservation table
    for (let item of reservation) {
      let update_obj = {
        voucher_applied: "Y",
        voucher_code: voucher_code,
        voucher_discount_percent:
          parseFloat(getVoucher[0].voucher_discount_value) || 0,
        voucher_discount_amount:
          (parseFloat(getVoucher[0].voucher_discount_value || 0) / 100) *
          parseFloat(item.seat_price) *
          parseFloat(item.no_of_seats || 1),
      };
      await global
        .knexConnection("ms_reservation")
        .update(update_obj)
        .where({ r_id: item.r_id });
    }

    // Send success response
    return sendResponse(res, 200, "Voucher Code Applied", {
      voucher_code: voucher_code,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while applying the voucher code.",
      error
    );
  }
}

export async function removeVoucher(req, res) {
  const reqbody = { ...req.query, ...req.body, ...req.params };
  const { reservation_id, rv_id } = reqbody;

  try {
    // Validate the presence of reservation_id
    if (!reservation_id) {
      return sendResponse(
        res,
        400,
        "Reservation ID is required to remove the voucher!"
      );
    }

    //Update Reservation Table
    let update_obj = {
      voucher_applied: "N",
      voucher_code: "",
      voucher_discount_percent: 0,
      voucher_discount_amount: 0,
    };
    await global
      .knexConnection("ms_reservation")
      .update(update_obj)
      .where({ reservation_id });

    // Delete the voucher record from ms_reserve_vouchers
    await global
      .knexConnection("ms_reserve_vouchers")
      .where({ reservation_id })
      .del();

    return sendResponse(res, 200, "Voucher Code Removed Successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while removing the voucher.",
      error
    );
  }
}

export async function validatePromotions(req, res) {
  const reqbody = { ...req.query, ...req.body, ...req.params };
  const { reservation_id, rv_id } = reqbody;

  try {
    // Validate reservation_id is provided
    if (!reservation_id) {
      return sendResponse(
        res,
        400,
        "Reservation ID is required to validate promotions!"
      );
    }

    // Fetch the voucher data associated with the reservation_id
    const existingVoucher = await global
      .knexConnection("ms_reserve_vouchers")
      .where({ reservation_id })
      .first();

    if (!existingVoucher) {
      return sendResponse(
        res,
        400,
        "No voucher found for the provided reservation ID."
      );
    }

    // If rv_id is provided, validate it against the existing voucher
    if (rv_id && existingVoucher.rv_id !== rv_id) {
      return sendResponse(
        res,
        400,
        "The provided voucher ID does not match the existing voucher for this reservation."
      );
    }

    // Remove the voucher for the given reservation_id
    await global
      .knexConnection("ms_reserve_vouchers")
      .where({ reservation_id })
      .del();
    return sendResponse(res, 200, "Voucher successfully removed.");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while validating promotions.",
      error
    );
  }
}

export const addReservationSeatsIo = async (req, res) => {
  const { event_sch_id, event_id, selectedSeatsArray, seatsio_eventkey } =
    req.body;
  const { user_info } = req;

  try {
    // Validate required fields in the request body
    const requiredFields = [
      "event_sch_id",
      "event_id",
      "selectedSeatsArray",
      "seatsio_eventkey",
    ];
    const validationResult = await checkValidation(requiredFields, req.body);
    if (!validationResult.status) {
      return sendResponse(res, 400, "Validation Error", validationResult);
    }

    let seatsIoSeatArray = [];
    let seatReservationData = [];

    // Process each selected seat
    for (const seat of selectedSeatsArray) {
      // Validate seat data
      const seatFields = [
        "seatGroupId",
        "seatPrice",
        "seatType",
        "seatRowName",
        "seatColName",
      ];
      const seatValidationResult = await checkValidation(seatFields, seat);
      if (!seatValidationResult.status) {
        return sendResponse(res, 400, "Validation Error", seatValidationResult);
      }

      // Check if the seat is already reserved
      const existingReservation = await global
        .knexConnection("ms_reservation")
        .where({
          is_reserved: "Y",
          seat_name: `${seat.seatRowName}${seat.seatColName}`,
          seat_group_id: seat.seatGroupId,
          event_sch_id: event_sch_id,
        });

      if (
        existingReservation.length &&
        existingReservation[0].row_name !== "GA-"
      ) {
        return sendResponse(res, 400, "Seat Already Reserved");
      }

      // Add seat to SeatsIO holding array
      const seatIdentifier = seat.seatUniqueId;
      if (seat.objectType === "GeneralAdmissionArea" && seat.seatQuantity) {
        seatsIoSeatArray.push({
          objectId: seat.seatType,
          quantity: seat.seatQuantity,
        });
      } else {
        seatsIoSeatArray.push(seatIdentifier);
      }

      // Prepare seat data for database insertion
      seatReservationData.push({
        seat_group_id: seat.seatGroupId,
        seat_type: seat.seatType,
        seat_name: `${seat.seatRowName}${seat.seatColName}`,
        row_name: seat.seatRowName,
        column_name: seat.seatColName,
        seat_price: seat.seatPrice,
      });
    }

    // Generate a unique reservation ID
    const reservation_id = uuidv4();

    // Retrieve event data
    const eventData = await EVENT_DATA({ event_id });
    if (!eventData.Records.length) {
      return sendResponse(res, 400, "Event Doesn't Exist");
    }

    // Check if event schedule exists
    const scheduleData = await global
      .knexConnection("event_schedule")
      .where({ event_sch_id });
    if (!scheduleData.length) {
      return sendResponse(res, 400, "Schedule Doesn't Exist");
    }

    // Fetch SeatsIO credentials
    const seatsioCredential = await SeatsIoCredentialFunction({
      org_id: eventData.Records[0].org_id,
      setting_key: "seats_io",
    });

    if (seatsioCredential.false) {
      return sendResponse(
        res,
        400,
        "Seats.io credentials not found for this organization"
      );
    }

    const { SEATSIO_SECRET_WORKSPACE_KEY } = seatsioCredential.data;
    const client = new SeatsioClient(Region.EU(), SEATSIO_SECRET_WORKSPACE_KEY);

    // Create a hold token and hold the seats in SeatsIO
    const holdToken = await client.holdTokens.create(15); // Hold time in minutes
    await client.events.hold(
      seatsio_eventkey,
      seatsIoSeatArray,
      holdToken.holdToken
    );

    // Prepare reservation data for database insertion
    const currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      eventData.Records[0].tz_name
    );
    const reservationData = seatReservationData.map((seatData) => ({
      ...seatData,
      reservation_id,
      event_sch_id,
      event_id,
      is_seat_layout_exist: eventData.Records[0].event_seating_type,
      created_at: currentDateTimeNew,
      timezone_name: eventData.Records[0].tz_name,
      created_by: user_info ? user_info.user_id : null,
      seat_release_time: eventData.Records[0].cinema_seat_release_time || 15,
      seatsio_holdtoken: holdToken.holdToken,
      seatsio_eventkey,
    }));

    // Insert reservation data into the database
    await global.knexConnection("ms_reservation").insert(reservationData);
    return sendResponse(res, 200, "Reservation Created Successfully", {
      reservation_id: reservation_id,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing the reservation. Please try again.",
      error
    );
  }
};

export const reservePass = async (req, res) => {
  try {
    const reqbody = { ...req.body, ...req.params };
    const { user_info } = req;
    const { pass_id } = reqbody;

    const checkFields = ["pass_id"];
    const result = await checkValidation(checkFields, reqbody);

    if (!result.status) {
      return sendResponse(res, 400, "Pass ID is required");
    }

    const reservation_id = uuidv4();

    // Fetch pass data
    const passData = await global
      .knexConnection("movie_event_pass")
      .select("movie_event_pass.*", "ms_currencies.curr_code")
      .leftJoin(
        "ms_currencies",
        "ms_currencies.curr_id",
        "movie_event_pass.pass_currency_id"
      )
      .where({
        "movie_event_pass.pass_id": pass_id,
        "movie_event_pass.pass_is_active": "Y",
      });

    if (!passData.length) {
      return sendResponse(res, 400, "Pass does not exists");
    }

    // Simplify amount and tax calculation
    const passAmount = parseFloat(passData[0].pass_amount);
    const passTaxValue =
      (parseFloat(passData[0].pass_tax_value) / 100) * passAmount;
    const passTotalPrice = passAmount + passTaxValue;

    const insertData = {
      p_reservation_id: reservation_id,
      pass_id: pass_id,
      pass_price: passAmount.toFixed(3),
      pass_tax_percent: passData[0].pass_tax_value,
      pass_tax_value: passTaxValue,
      pass_total_price: passTotalPrice,
      pass_price_currency: passData[0].curr_code,
      pass_release_time: 15,
    };

    // Insert reservation data into database
    await global.knexConnection("ms_pass_reservation").insert(insertData);
    return sendResponse(res, 200, "Reservation Created Successfully", {
      reservation_id: reservation_id,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing the reservation. Please try again.",
      error
    );
  }
};

export const getReservePassDetails = async (req, res) => {
  try {
    const reqbody = { ...req.body, ...req.params };
    const { reservation_id } = reqbody;
    const Booking_time = 10; // Default Booking Time

    // Validate required fields
    const checkFields = ["reservation_id"];
    const result = await checkValidation(checkFields, reqbody);

    if (!result.status) {
      return sendResponse(res, 400, "Reservation ID is required");
    }

    // Fetch reservation details
    const getReservationDetail = await global
      .knexConnection("ms_pass_reservation")
      .select(
        "movie_event_pass.pass_name",
        "movie_event_pass.pass_feature",
        "movie_event_pass.pass_valid_days",
        "movie_event_pass.pass_tax_value",
        "pass_type",
        "pass_validity_from",
        "pass_validity_to",
        "pass_amount",
        "discount_type",
        "pass_discount_value",
        "pass_tnc",
        "p_reservation_id",
        "ms_pass_reservation.pass_total_price",
        "ms_pass_reservation.pass_tax_value",
        "ms_pass_reservation.pass_tax_percent",
        "ms_pass_reservation.pass_price",
        "pass_release_time",
        "ms_pass_reservation.pass_price_currency"
      )
      .leftJoin(
        "movie_event_pass",
        "movie_event_pass.pass_id",
        "ms_pass_reservation.pass_id"
      )
      .where({
        p_reservation_id: reservation_id,
        p_is_reserved: "Y",
        "movie_event_pass.pass_is_active": "Y",
      });

    if (!getReservationDetail.length) {
      return sendResponse(res, 400, "Reservation not found or pass released");
    }

    const currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      null
    );

    // Prepare response object
    const obj = {
      pass_name: getReservationDetail[0].pass_name,
      pass_type: getReservationDetail[0].pass_type,
      pass_validity_from: getReservationDetail[0].pass_validity_from,
      pass_validity_to: getReservationDetail[0].pass_validity_to,
      pass_valid_days: `${getReservationDetail[0].pass_valid_days} Days`,
      pass_amount: parseFloat(getReservationDetail[0].pass_amount),
      pass_tax_in_percent: getReservationDetail[0].pass_tax_percent,
      pass_tax_value: getReservationDetail[0].pass_tax_value,
      total_amount_payable: getReservationDetail[0].pass_total_price,
      curr_code: getReservationDetail[0].pass_price_currency,
      discount_type: getReservationDetail[0].discount_type,
      pass_discount_value: getReservationDetail[0].pass_discount_value,
      pass_tnc: getReservationDetail[0].pass_tnc,
      pass_feature: getReservationDetail[0].pass_feature,
      p_reservation_id: getReservationDetail[0].p_reservation_id,
      pass_release_time: getReservationDetail[0].pass_release_time,
      minutes: 0,
      seconds: 0,
      reserved_time: moment(getReservationDetail[0].created_at).format(
        "YYYY-MM-DD HH:mm:ss"
      ),
      release_time: moment(getReservationDetail[0].created_at)
        .add(
          getReservationDetail[0].pass_release_time || Booking_time,
          "minutes"
        )
        .format("YYYY-MM-DD HH:mm:ss"),
      backend_api_route: null,
      currentDateTime: currentDateTimeNew,
    };

    // Calculate time remaining for release
    obj.seconds =
      moment(obj.release_time).diff(moment(obj.currentDateTime), "seconds") %
      60;
    obj.minutes =
      moment(obj.release_time).diff(moment(obj.currentDateTime), "minutes") %
      60;

    // Format pass validity date
    obj.pass_validity_to = moment()
      .add(getReservationDetail[0].pass_valid_days, "days")
      .format("DD/MM/YYYY");

    // Fetch payment gateway configuration
    const getCinemaPaymentGateway = await global
      .knexConnection("organization_setting")
      .where({ setting_is_active: "Y" })
      .where((builder) => {
        builder.orWhere({ setting_key: "payone_payment" });
      });

    if (getCinemaPaymentGateway.length) {
      let apiRoute = JSON.parse(getCinemaPaymentGateway[0].setting_data);
      obj.backend_api_route = apiRoute.PASS_PAYMENT_API_ROUTE;
    }

    // Return response
    return sendResponse(res, 200, "Reservation details fetched successfully", {
      Records: [obj],
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred in getReservePassDetails",
      error
    );
  }
};

export async function applyPass(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { reservation_id, pass_id, customer_email } = reqbody;

    if (!reservation_id || !pass_id || !customer_email) {
      return sendResponse(
        res,
        400,
        "Reservation ID, Pass ID and Customer Email are required"
      );
    }

    let logged_in_customer_id = req["logged_in_customer_id"] || null;
    // Get customer details

    if (!logged_in_customer_id) {
      return sendResponse(res, 400, "User not found");
    }

    // Get pass details
    const getPass = await global
      .knexConnection("movie_event_pass")
      .select("movie_event_pass.*")
      .where({
        "movie_event_pass.pass_id": pass_id,
        "movie_event_pass.pass_is_active": "Y",
      });
    if (!getPass.length) {
      return sendResponse(res, 400, "Pass not found");
    }

    // Get reservation details
    const getReservationDetail = await global
      .knexConnection("ms_reservation")
      .select("reservation_id", "seat_type_id", "event_id", "seat_price")
      .where({
        reservation_id,
        is_reserved: "Y",
      });
    if (!getReservationDetail.length) {
      return sendResponse(
        res,
        400,
        "Reservation not found or seat is released"
      );
    }

    // Get event details and validate pass type
    const getEventDetail = await global
      .knexConnection("ms_event")
      .select("type")
      .where({
        event_id: getReservationDetail[0].event_id,
      });
    if (!getEventDetail.length) {
      return sendResponse(res, 400, "Event not found");
    }

    // Check pass type compatibility
    if (getPass[0].pass_type !== getEventDetail[0].type) {
      return sendResponse(
        res,
        400,
        "Pass type and event type are not compatible"
      );
    }

    // Validate seat type for the pass
    const validSeatType = getReservationDetail.find(
      (z) => z.seat_type_id === getPass[0].seat_type_id
    );
    if (!validSeatType) {
      return sendResponse(res, 400, "Seat type not eligible for pass!");
    }

    // Check if user has already bought the pass and handle limits
    const getAlreadyBoughtUserPass = await global
      .knexConnection("ms_booking")
      .select("booking_id", "booking_date_time")
      .where({
        voucher_code: "PASS-" + pass_id,
        logged_in_customer_id,
        booking_is_active: "Y",
      });

    if (getAlreadyBoughtUserPass.length) {
      const maxPerUser = parseFloat(getPass[0].max_transaction_per_user);
      if (getAlreadyBoughtUserPass.length >= maxPerUser) {
        return sendResponse(res, 400, "Per user pass limit exceed!");
      }

      // Filter bookings for today's date
      const filterForPerDayPass = getAlreadyBoughtUserPass.filter((x) =>
        moment(x.booking_date_time).isSame(moment(), "day")
      );

      const maxPerDay = parseFloat(getPass[0].max_transaction_per_day);
      if (filterForPerDayPass.length >= maxPerDay) {
        return sendResponse(res, 400, "Per day pass limit exceed!");
      }
    }

    // Prepare data to insert into ms_reserve_pass
    const obj = {
      reservation_id,
      pass_id,
      seat_type_id: validSeatType.seat_type_id,
      logged_in_customer_id,
      pass_discount_percent: getPass[0].pass_discount_value || 0,
      rp_is_active: "Y",
    };

    await global.knexConnection("ms_reserve_pass").insert(obj);

    //update pass data in reservation table

    const getvalidSeatType = getReservationDetail.filter(
      (z) => z.seat_type_id === passData[0].seat_type_id
    );
    if (getvalidSeatType.length) {
      let update_obj = {
        pass_applied: "Y",
        pass_code: getPass[0].pass_name,
        pass_discount_percent: parseFloat(getPass[0].pass_discount_value) || 0,
        pass_discount_amount:
          (parseFloat(getPass[0].pass_discount_value) / 100) *
          parseFloat(item.seat_price),
      };
      await global
        .knexConnection("ms_reservation")
        .update(update_obj)
        .where({ reservation_id: getvalidSeatType[0].reservation_id });
    }
    return sendResponse(res, 200, "Pass applied successfully", {
      pass_name: getPass[0].pass_name,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while applying the pass.",
      error
    );
  }
}

export async function getCustomerPassById(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const logged_in_customer_id = req["logged_in_customer_id"] || null;

    if (!logged_in_customer_id) {
      return sendResponse(res, 400, "Customer ID not provided!");
    }

    // Fetching customer pass details
    const getCustomerPass = await global
      .knexConnection("pass_booking")
      .select(
        "pass_booking.pass_name",
        "pass_booking.pass_id",
        "pass_booking.pass_discount_percent"
      )
      .join(
        "ms_customers",
        "ms_customers.customer_id",
        "pass_booking.customer_id"
      )
      .where({
        "ms_customers.customer_id": logged_in_customer_id,
        "pass_booking.is_active": "Y", // Assuming is_active is for the pass itself
      });

    if (!getCustomerPass.length) {
      return sendResponse(res, 400, "Pass not found for user");
    }

    return sendResponse(res, 200, "Customer valid pass found", {
      Records: getCustomerPass,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the pass.",
      error
    );
  }
}

export async function removePass(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const reservation_id = reqbody.reservation_id || null;

    // Validate the required field
    if (!reservation_id) {
      return sendResponse(res, 400, "Reservation ID is required!");
    }

    // Delete pass from reservation
    const rowsAffected = await global
      .knexConnection("ms_reserve_pass")
      .where({ reservation_id })
      .del();

    // Check if any row was deleted
    if (rowsAffected === 0) {
      return sendResponse(
        res,
        400,
        "No pass found with the provided reservation ID!"
      );
    }

    return sendResponse(res, 200, "Pass removed successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while removing the pass.",
      error
    );
  }
}

export async function getCustomerPassHistory(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const logged_in_customer_id = req["logged_in_customer_id"] || null;

    // Validate customer_id
    if (!logged_in_customer_id) {
      return sendResponse(res, 400, "Customer ID is required!");
    }

    // Fetch customer pass details
    const getCustomerPass = await global
      .knexConnection("pass_booking")
      .select("pass_booking.*")
      .join(
        "ms_customers",
        "ms_customers.customer_id",
        "pass_booking.customer_id"
      )
      .where({
        "ms_customers.customer_id": logged_in_customer_id,
        is_active: "Y",
      });

    // If no passes found, return a message
    if (!getCustomerPass.length) {
      return sendResponse(
        res,
        400,
        "No active passes found for this customer!"
      );
    }

    // Process each pass history asynchronously
    await Promise.all(
      getCustomerPass.map(async (z) => {
        // Format the dates
        z["purches_on"] = moment(z.booking_date_time).format("DD/MM/YYYY");
        z["valid_till"] = moment(z.booking_date_time)
          .add(z.pass_valid_days, "days")
          .format("DD/MM/YYYY");

        // Get the total number of tickets bought with this pass
        const ticketsBought = await global
          .knexConnection("ms_booking")
          .count("booking_id as total_pass_booked_tickets")
          .where({
            "ms_booking.customer_id": z.customer_id,
            voucher_code: "PASS-" + z.pass_id,
            booking_is_active: "Y",
          });

        z["total_pass_booked_tickets"] =
          ticketsBought[0].total_pass_booked_tickets;
      })
    );
    return sendResponse(
      res,
      200,
      "Customer Pass History retrieved successfully",
      {
        Records: getCustomerPass,
      }
    );
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the pass history.",
      error
    );
  }
}

export async function getCustomerTicketHistory(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const logged_in_customer_id = req["logged_in_customer_id"] || null;

    // Validate customer_id
    if (!logged_in_customer_id) {
      return sendResponse(res, 400, "Customer ID is required!");
    }

    // Fetch customer tickets from the database
    const getCustomerTickets = await global
      .knexConnection("ms_booking")
      .select("ms_booking.*")
      .join(
        "ms_customers",
        "ms_customers.customer_id",
        "ms_booking.customer_id"
      )
      .where({
        "ms_customers.customer_id": logged_in_customer_id,
      });

    // Format the purchase date for each ticket

    getCustomerTickets.forEach((ticket) => {
      ticket["purches_on"] = moment(ticket.booking_date_time).format(
        "DD/MM/YYYY"
      );
    });
    return sendResponse(
      res,
      200,
      "Customer Ticket History retrieved successfully",
      {
        Records: getCustomerTickets,
      }
    );
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the ticket history.",
      error
    );
  }
}
export async function downloadTicket(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { booking_code } = reqbody;

    // Validate Booking Code
    if (!booking_code) {
      return sendResponse(res, 400, "Booking Code is required!");
    }

    const filePrefix = booking_code;
    const directoryPath = path.join(
      global.__base,
      "/public/uploads/ticketInvoice"
    );

    // Check if directory exists
    await access(directoryPath, fs.constants.R_OK);

    // Read directory
    const files = await readdir(directoryPath);
    const matchingFiles = files.filter((file) => file.startsWith(filePrefix));

    if (matchingFiles.length === 0) {
      return sendResponse(res, 404, "No matching files found");
    }

    // Create a ZIP file in memory and send it
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filePrefix}_tickets.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    for (const file of matchingFiles) {
      const filePath = path.join(directoryPath, file);
      archive.file(filePath, { name: file });
    }

    archive.finalize();

    archive.on("error", (err) => {
      console.error("Archive error:", err);
      return sendResponse(res, 500, "Error creating ZIP file", err);
    });
  } catch (error) {
    console.error("Server error:", error);
    return sendResponse(
      res,
      500,
      "An error occurred while downloading ticket",
      error
    );
  }
}
