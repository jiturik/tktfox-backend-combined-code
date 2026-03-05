import excel from "exceljs";
import { CreateInvSendTicketEmail } from "../../cron/CreateInvSendTicketEmail.js";
import { pagination } from "../../lib/pagination.js";
import { sendResponse } from "../../lib/responseService.js";

export async function getTransactionList(req, res) {
  try {
    // Combine request data
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { user_info } = req;
    const booking_id = reqbody.booking_id || null;

    // Safely parse filters with error handling
    let parsedFilters = {};
    parsedFilters = JSON.parse(reqbody.filters || "{}");

    // Extract filters
    const {
      event_ids = null,
      booking_code = null,
      customer_email = null,
      promo_code = null,
      search = null,
      selectedEventType = null,
    } = parsedFilters;

    const user_id = reqbody.user_id || null;
    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;

    // Fetch transaction list with query building and error handling
    const TransactionList = await global
      .knexConnection("ms_booking")
      .select("ms_booking.*", "ms_event.org_id", "PBD.is_booked", "PBD.is_paid")
      .leftJoin("ms_event", "ms_event.event_id", "ms_booking.event_id")
      .leftJoin(
        "ms_payment_booking_detail as PBD",
        "ms_booking.reservation_id",
        "PBD.reservation_id"
      )
      .where((builder) => {
        if (booking_id) builder.where("booking_id", "=", booking_id);
        if (event_ids && event_ids.length)
          builder.whereIn("ms_booking.event_id", event_ids);
        if (booking_code)
          builder.where("booking_code", "like", `%${booking_code}%`);
        if (customer_email)
          builder.where("c_email", "like", `%${customer_email}%`);
        if (promo_code)
          builder.where("voucher_code", "like", `%${promo_code}%`);
        if (user_info?.org_id)
          builder.where("ms_event.org_id", "=", user_info.org_id);
        if (selectedEventType)
          builder.where("ms_event.event_is_active", "=", selectedEventType);
        if (search) {
          builder.whereRaw(`concat_ws(' ', c_name, c_phone_number) like ?`, [
            `%${search}%`,
          ]);
        }
      })
      .orderBy("booking_id", "desc")
      .paginate(pagination(limit, currentPage));

    // Send response
    return sendResponse(res, 200, "Transaction List", {
      Records: TransactionList,
    });
  } catch (error) {
    return sendResponse(res, 500, "Error fetching transaction list", error);
  }
}

export async function getReservationBookingList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { user_info } = req;

    // Safely parse filters with error handling
    let parsedFilters = {};

    parsedFilters = JSON.parse(reqbody.filters || "{}");

    // Extract parameters and filters
    const booking_id = reqbody.booking_id || null;
    const {
      event_ids = null,
      booking_code = null,
      customer_email = null,
      search = null,
      selectedEventType = null,
      paymentBookStatus = null,
    } = parsedFilters;

    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;

    // Fetch reservation list
    const ReservationListAll = await global
      .knexConnection("ms_payment_booking_detail as PBD")
      .select(
        global.knexConnection.raw(`
          PBD.is_refund, PBD.is_paid, R.r_id, R.reservation_id, R.is_reserved, 
          R.event_id, group_concat(R.seat_name) as seatName, 
          group_concat(R.seat_type) as seatTypes, sum(R.seat_price) as seatPrice, 
          PBD.c_name, PBD.email, PBD.phone_number, PBD.country_code, 
          PBD.payment_capture, PBD.is_guest, PBD.is_booked, 
          B.booking_code, B.booking_type_name, B.total_price as totalPaidAmount, 
          B.booking_date_time, B.currency as amountCurrency, E.event_name
        `)
      )
      .leftJoin("ms_reservation as R", "R.reservation_id", "PBD.reservation_id")
      .leftJoin("ms_event as E", "E.event_id", "R.event_id")
      .leftJoin("ms_booking as B", "R.reservation_id", "B.reservation_id")
      .where((builder) => {
        if (booking_id) builder.where("B.booking_id", "=", booking_id);
        if (event_ids && event_ids.length)
          builder.whereIn("B.event_id", event_ids);
        if (booking_code)
          builder.where("B.booking_code", "like", `%${booking_code}%`);
        if (customer_email)
          builder.where("PBD.email", "like", `%${customer_email}%`);
        if (user_info?.org_id) builder.where("E.org_id", "=", user_info.org_id);
        if (selectedEventType)
          builder.where("E.event_is_active", "=", selectedEventType);
        if (paymentBookStatus === "N") {
          builder.where("PBD.is_paid", "=", "Y");
          builder.where("PBD.is_refund", "=", "Y");
        }
        if (search) {
          builder.whereRaw(
            `concat_ws(' ', PBD.c_name, PBD.phone_number) like ?`,
            [`%${search}%`]
          );
        }
      })
      .groupBy("R.reservation_id")
      .orderBy("R.r_id", "desc")
      .paginate(pagination(limit, currentPage));

    return sendResponse(res, 200, "Reservation List", {
      Records: ReservationListAll,
    });
  } catch (error) {
    return sendResponse(res, 500, "Error fetching reservation list", error);
  }
}

export async function exportBookingReport(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { user_info } = req;

    // Safely parse filters with error handling
    let parsedFilters = {};

    parsedFilters = JSON.parse(reqbody.payload || "{}");

    // Extract filters
    const {
      booking_id = null,
      event_ids = null,
      booking_code = null,
      customer_email = null,
      promo_code = null,
      search = null,
      selectedEventType = null,
    } = parsedFilters;

    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;

    // Fetch transaction report data from the database
    const TransactionReport = await global
      .knexConnection("ms_booking")
      .select("ms_booking.*", "ms_event.org_id", "PBD.is_booked", "PBD.is_paid")
      .leftJoin("ms_event", "ms_event.event_id", "ms_booking.event_id")
      .leftJoin(
        "ms_payment_booking_detail as PBD",
        "ms_booking.reservation_id",
        "PBD.reservation_id"
      )
      .where((builder) => {
        if (booking_id) builder.where("booking_id", "=", booking_id);
        if (event_ids && event_ids.length)
          builder.whereIn("ms_booking.event_id", event_ids);
        if (booking_code)
          builder.where("booking_code", "like", `%${booking_code}%`);
        if (customer_email)
          builder.where("c_email", "like", `%${customer_email}%`);
        if (promo_code)
          builder.where("voucher_code", "like", `%${promo_code}%`);
        if (user_info?.org_id)
          builder.where("ms_event.org_id", "=", user_info.org_id);
        if (selectedEventType)
          builder.where("ms_event.event_is_active", "=", selectedEventType);
        if (search) {
          builder.whereRaw(`concat_ws(' ', c_name, c_phone_number) like ?`, [
            `%${search}%`,
          ]);
        }
      })
      .orderBy("booking_id", "desc");

    // Create the Excel workbook
    let workbook = new excel.Workbook();
    let worksheet = workbook.addWorksheet("Bookings");

    // Define Excel columns
    const excelColumns = [
      { key: "booking_is_active", header: "Booking Status", width: 20 },
      { key: "event_name", header: "Event Name", width: 20 },
      { key: "event_date", header: "Event Date", width: 20 },
      { key: "event_time", header: "Event Time", width: 20 },
      { key: "cinema_name", header: "Cinema", width: 20 },
      { key: "booking_code", header: "BookingID", width: 20 },
      { key: "c_email", header: "Customer Email", width: 40 },
      { key: "c_name", header: "Customer Name", width: 20 },
      { key: "c_country_code", header: "Country Code", width: 20 },
      { key: "c_phone_number", header: "Phone No.", width: 20 },
      { key: "seat_names", header: "Seats Names", width: 20 },
      { key: "total_seats", header: "Total Seats", width: 20 },
      {
        key: "total_before_discount",
        header: "Amount Before Discount",
        width: 20,
      },
      { key: "voucher_code", header: "Voucher", width: 20 },
      { key: "discount_percent", header: "Discount Percent", width: 20 },
      { key: "discount_value", header: "Discount Amount", width: 20 },
      { key: "total_price", header: "Final Total Amount Paid", width: 20 },
      { key: "currency", header: "Currency", width: 20 },
      { key: "seats_scanned", header: "Scanned Seats", width: 20 },
      { key: "seats_tobe_scanned", header: "Seats To be Scanned", width: 20 },
      { key: "booking_date_time", header: "Booking Date", width: 20 },
      { key: "is_guest", header: "Is Guest User", width: 20 },
      {
        key: "payment_transaction_id",
        header: "Payone TransactionID",
        width: 20,
      },
    ];
    worksheet.columns = excelColumns;
    worksheet.addRow({}).commit();

    // Add transaction data to Excel
    for (let item of TransactionReport) {
      item.booking_is_active =
        item.booking_is_active === "N" ? "Cancelled" : "Active";
      worksheet.addRow(item);
    }

    // Set the response headers for the Excel file download
    const excelName = "Booking Report";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${excelName}.xlsx`
    );

    // Write the workbook and end the response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while generating the booking report.",
      error
    );
  }
}

export async function exportReservationReport(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { user_info } = req;

    // Safely parse filters with error handling
    let parsedFilters = {};

    parsedFilters = JSON.parse(reqbody.filters || "{}");

    // Extract filters
    const {
      booking_id = null,
      event_ids = null,
      booking_code = null,
      customer_email = null,
      search = null,
      selectedEventType = null,
      paymentBookStatus = null,
    } = parsedFilters;

    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;

    // Fetch reservation data from the database
    const ReservationData = await global
      .knexConnection("ms_payment_booking_detail as PBD")
      .select(
        global.knexConnection.raw(
          `PBD.is_refund, PBD.is_paid, R.r_id, R.reservation_id, R.is_reserved, 
          R.event_id, group_concat(R.seat_name) as seatName, 
          group_concat(R.seat_type) as seatTypes, 
          sum(R.seat_price) as seatPrice, PBD.c_name, PBD.email, 
          PBD.phone_number, PBD.country_code, PBD.payment_capture, 
          PBD.is_guest, PBD.is_booked, B.booking_code, 
          B.booking_type_name, B.total_price as totalPaidAmount, 
          B.booking_date_time, B.currency as amountCurrency, 
          E.event_name`
        )
      )
      .leftJoin("ms_reservation as R", "R.reservation_id", "PBD.reservation_id")
      .leftJoin("ms_event as E", "E.event_id", "R.event_id")
      .leftJoin("ms_booking as B", "R.reservation_id", "B.reservation_id")
      .where((builder) => {
        if (booking_id) builder.where("B.booking_id", "=", booking_id);
        if (event_ids && event_ids.length)
          builder.whereIn("B.event_id", event_ids);
        if (booking_code)
          builder.where("B.booking_code", "like", `%${booking_code}%`);
        if (customer_email)
          builder.where("PBD.email", "like", `%${customer_email}%`);
        if (user_info?.org_id) builder.where("E.org_id", "=", user_info.org_id);
        if (selectedEventType)
          builder.where("E.event_is_active", "=", selectedEventType);
        if (paymentBookStatus === "N") {
          builder
            .where("PBD.is_paid", "=", "Y")
            .where("PBD.is_refund", "=", "Y");
        }
        if (search) {
          builder.whereRaw(
            `concat_ws(' ', PBD.c_name, PBD.phone_number) like ?`,
            [`%${search}%`]
          );
        }
      })
      .groupBy("R.reservation_id")
      .orderBy("R.r_id", "desc");

    // Create the Excel workbook
    let workbook = new excel.Workbook();
    let worksheet = workbook.addWorksheet("Reservations");

    // Define Excel columns
    const excelColumns = [
      { key: "event_name", header: "Event Name", width: 20 },
      { key: "reservation_id", header: "ReservationID", width: 20 },
      { key: "c_name", header: "Customer Name", width: 20 },
      { key: "email", header: "Customer Email", width: 40 },
      { key: "country_code", header: "Country Code", width: 20 },
      { key: "phone_number", header: "Phone No.", width: 20 },
      { key: "seatName", header: "Seats Names", width: 20 },
      { key: "seatTypes", header: "Seat Types", width: 20 },
      { key: "seatPrice", header: "Total Seat Price", width: 20 },
      { key: "is_reserved", header: "Booking Status", width: 20 },
      { key: "is_paid", header: "Payment Status", width: 20 },
      { key: "is_refund", header: "Is Refund Case", width: 20 },
      { key: "payment_capture", header: "PG Response", width: 20 },
      { key: "totalPaidAmount", header: "Total Paid Amount", width: 20 },
      { key: "amountCurrency", header: "Currency", width: 20 },
      { key: "booking_code", header: "Booking Code", width: 20 },
      { key: "booking_date_time", header: "Booking Date", width: 20 },
    ];
    worksheet.columns = excelColumns;
    worksheet.addRow({}).commit();

    // Add reservation data to Excel
    for (let item of ReservationData) {
      worksheet.addRow(item);
    }

    // Set response headers for file download
    const excelName = "Reservation Report";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${excelName}.xlsx`
    );

    // Write the workbook to the response stream
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while generating the reservation report.",
      error
    );
  }
}

export async function getEventHomeDataById(req, res) {
  const reqBody = { ...req.query, ...req.body, ...req.params };
  const eventId = reqBody.event_id || null;

  if (!eventId) {
    return sendResponse(res, 400, "Event ID is required");
  }

  try {
    // Fetch data in parallel
    const [eventTransactions, ticketScannedCount, bookedSeats, seatTypes] =
      await Promise.all([
        getEventTransactions(eventId),
        getTicketScannedCount(eventId),
        getAllBookedSeats(eventId),
        getEventSeatTypes(eventId),
      ]);

    // Process voucher data
    const { totalVoucherTransactionCount, voucherSummaryArray } =
      processVoucherData(eventTransactions);

    // Process schedule data
    const { scheduleData, totalBookedSeats } = processScheduleData(
      seatTypes,
      bookedSeats
    );

    // Prepare response object
    const response = {
      event_total_trans: eventTransactions.length,
      event_total_seats_scanned: ticketScannedCount,
      event_total_voucher_trans: totalVoucherTransactionCount,
      event_total_bookedSeats: totalBookedSeats,
      eventScheduleSummary: scheduleData,
      voucherSummaryArray,
    };
    return sendResponse(res, 200, "Event Home Data", { Records: response });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching home data.",
      error
    );
  }
}

// Helper Functions
async function getEventTransactions(eventId) {
  return await global
    .knexConnection("ms_booking")
    .select("event_id", "booking_id", "seat_names", "voucher_code")
    .where("ms_booking.event_id", eventId)
    .andWhere("ms_booking.booking_is_active", "Y");
}

async function getTicketScannedCount(eventId) {
  const result = await global
    .knexConnection("ms_booking")
    .sum("seats_scanned as event_total_seats_scanned")
    .where("ms_booking.event_id", eventId)
    .andWhere("ms_booking.booking_is_active", "Y");
  return result[0]?.event_total_seats_scanned || 0;
}

async function getAllBookedSeats(eventId) {
  return await global
    .knexConnection("ms_reservation")
    .select(
      "ms_reservation.seat_type",
      "ms_reservation.no_of_seats",
      "event_schedule.sch_date",
      "event_schedule.sch_time",
      "event_schedule.sch_max_capacity",
      "event_schedule.event_sch_id"
    )
    .leftJoin(
      "event_schedule",
      "event_schedule.event_sch_id",
      "ms_reservation.event_sch_id"
    )
    .where({
      is_booked: "Y",
      "ms_reservation.event_id": eventId,
    });
}

async function getEventSeatTypes(eventId) {
  return await global
    .knexConnection("event_sch_seat_type")
    .select(
      "event_sch_seat_type.*",
      "ms_seat_class_type.seat_class_name",
      "event_schedule.sch_date",
      "event_schedule.sch_time",
      "event_schedule.sch_max_capacity"
    )
    .leftJoin(
      "ms_seat_class_type",
      "ms_seat_class_type.sct_id",
      "event_sch_seat_type.sct_id"
    )
    .leftJoin(
      "event_schedule",
      "event_schedule.event_sch_id",
      "event_sch_seat_type.event_sch_id"
    )
    .where({
      "ms_seat_class_type.sct_is_active": "Y",
      "event_schedule.sch_is_active": "Y",
      "event_sch_seat_type.event_id": eventId,
    })
    .orderBy("event_sch_seat_type.event_sch_ss_id", "asc");
}

function processVoucherData(eventTransactions) {
  let totalVoucherTransactionCount = 0;
  const voucherSummaryArray = [];

  eventTransactions.forEach((booking) => {
    if (booking.voucher_code) {
      totalVoucherTransactionCount++;

      const seatDetails = (booking.seat_names || "")
        .split(",")
        .map((seat) => seat.trim());

      seatDetails.forEach((seat) => {
        const [seatType, countStr] = seat.split("-");
        const count = parseInt(countStr, 10) || 1;

        const existingObj = voucherSummaryArray.find(
          (obj) =>
            obj.VoucherCode.toLowerCase() ===
              booking.voucher_code.toLowerCase() && obj.SeatType === seatType
        );

        if (existingObj) {
          existingObj.Count += count;
        } else {
          voucherSummaryArray.push({
            VoucherCode: booking.voucher_code,
            SeatType: seatType,
            Count: count,
          });
        }
      });
    }
  });

  return { totalVoucherTransactionCount, voucherSummaryArray };
}

function processScheduleData(seatTypes, bookedSeats) {
  const scheduleData = [];
  let totalBookedSeats = 0;

  seatTypes.forEach((type) => {
    const scheduleIndex = scheduleData.findIndex(
      (x) => x.event_sch_id === type.event_sch_id
    );

    const bookedSeatTypes = bookedSeats.filter(
      (seat) =>
        seat.event_sch_id === type.event_sch_id &&
        seat.seat_type === type.seat_class_name
    );

    const soldCount = bookedSeatTypes.reduce(
      (sum, seat) => sum + parseInt(seat.no_of_seats || 1, 10),
      0
    );

    const seatInfo = {
      seat_type: type.seat_class_name,
      count: soldCount,
      total_allocated: type.available_seats,
    };

    if (scheduleIndex >= 0) {
      scheduleData[scheduleIndex].seatTypes.push(seatInfo);
      scheduleData[scheduleIndex].sch_sold_seats += soldCount;
    } else {
      scheduleData.push({
        event_sch_id: type.event_sch_id,
        event_sch_date: type.sch_date,
        event_sch_time: type.sch_time,
        sch_max_capacity: type.sch_max_capacity,
        sch_sold_seats: soldCount,
        seatTypes: [seatInfo],
      });
    }

    totalBookedSeats += soldCount;
  });

  return { scheduleData, totalBookedSeats };
}

export async function resendTicketCustomer(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };

    // Assuming CreateInvSendTicketEmail returns data with status or error
    const data = await CreateInvSendTicketEmail(reqbody);

    //if (data && data.status) {
    return sendResponse(res, 200, "Email Ticket Sent");
    // } else {
    //   return sendResponse(res, 400, "Failed to send email");
    // }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while sending the email",
      error
    );
  }
}

export async function getPassTransactionList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const pass_booking_id = reqbody.pass_booking_id || null;
    const { user_info } = req;
    let parsedFilters = JSON.parse(reqbody.filters);

    let event_ids = parsedFilters.event_ids || null;
    let booking_code = parsedFilters.booking_code || null;
    let customer_email = parsedFilters.customer_email || null;
    let promo_code = parsedFilters.promo_code || null;
    let search = parsedFilters.search || null;
    let selectedEventType = parsedFilters.selectedEventType || null;

    const user_id = reqbody.user_id || null;
    const limit = req.query.limit ? parseInt(req.query.limit) : 100;
    const currentPage = req.query.currentPage
      ? parseInt(req.query.currentPage)
      : 1;

    const query = global
      .knexConnection("pass_booking")
      .select("pass_booking.*")
      .where("is_active", "=", "Y");

    // Apply filters
    if (pass_booking_id) {
      query.where("pass_booking_id", "=", pass_booking_id);
    }
    if (booking_code) {
      query.where("booking_code", "like", `%${booking_code}%`);
    }
    if (customer_email) {
      query.where("c_email", "like", `%${customer_email}%`);
    }
    if (search) {
      query.whereRaw(
        `concat_ws(' ', c_name, c_phone_number) like '%${search}%'`
      );
    }

    // Apply pagination and order
    const TransactionList = await query
      .orderBy("pass_booking_id", "desc")
      .paginate(pagination(limit, currentPage));
    return sendResponse(res, 200, "Pass Transaction List", {
      Records: TransactionList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching pass transactions",
      error
    );
  }
}
