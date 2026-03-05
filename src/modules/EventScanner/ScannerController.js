import e from "express";
import { pagination } from "../../lib/pagination.js";
import { sendResponse } from "../../lib/responseService.js";

export async function getTransactionByCodeScanner(req, res) {
  const reqbody = { ...req.query, ...req.body, ...req.params };
  const { booking_code, booking_id } = reqbody;

  if (!booking_code) {
    return sendResponse(
      res,
      400,
      "Invalid Booking Code or Booking code not provided!"
    );
  }

  try {
    const TransactionList = await global
      .knexConnection("ms_booking")
      .where((builder) => {
        builder.where("booking_is_active", "Y");
        if (booking_id) builder.where("booking_id", booking_id);
        if (booking_code) builder.where("booking_code", booking_code);
        if (req.query.search) {
          builder.whereRaw(
            `concat_ws(' ', booking_code, c_email, cinema_name, event_name) like ?`,
            [`%${req.query.search}%`]
          );
        }
      })
      .orderBy("booking_id", "desc")
      .paginate(pagination(req.query.limit || 100, req.query.currentPage || 1));

    if (!TransactionList.data.length) {
      return sendResponse(
        res,
        400,
        "Ticket Details Not Found or booking cancelled admin!"
      );
    }
    return sendResponse(res, 200, "Ticket Details", {
      Records: TransactionList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving the ticket details.",
      error
    );
  }
}

export async function getScannedTicketById(req, res) {
  const reqbody = { ...req.query, ...req.body, ...req.params };
  const { booking_code, booking_id } = reqbody;

  if (!booking_id) {
    return sendResponse(
      res,
      400,
      "Invalid Booking Id or Booking ID not provided!"
    );
  }

  try {
    const ScannedTicketList = await global
      .knexConnection("ms_scanned_tickets")
      .where((builder) => {
        if (booking_id) builder.where("booking_id", booking_id);
        if (booking_code) builder.where("booking_code", booking_code);
        if (req.query.search) {
          builder.whereRaw(`concat_ws(' ', booking_code) like ?`, [
            `%${req.query.search}%`,
          ]);
        }
      })
      .orderBy("booking_id", "desc")
      .paginate(pagination(req.query.limit || 100, req.query.currentPage || 1));

    if (!ScannedTicketList.data.length) {
      return sendResponse(res, 400, "Scan Ticket Details Not Found ");
    }
    return sendResponse(res, 200, "Scan Ticket Details", {
      Records: ScannedTicketList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving the scanned ticket details.",
      error
    );
  }
}

export async function getScannedTicketList(req, res) {
  const reqbody = { ...req.query, ...req.body, ...req.params };
  const { user_info } = req;
  const { booking_code, booking_id } = reqbody;
  const user_id = user_info.user_id;

  try {
    const EventArray = await global
      .knexConnection("event_managers")
      .select("event_id", "user_id")
      .where({ user_id });

    if (!EventArray.length) {
      return sendResponse(res, 400, "Event not assigned");
    }

    const eventIds = EventArray.filter((e) => e.user_id === user_id).map(
      (e) => e.event_id
    );

    const ScannedTicketList = await global
      .knexConnection("ms_scanned_tickets")
      .select([
        "ms_scanned_tickets.scan_id",
        "ms_scanned_tickets.booking_id",
        "ms_scanned_tickets.booking_code",
        "ms_scanned_tickets.scanned_by",
        "ms_scanned_tickets.removed_by",
        "ms_scanned_tickets.scan_is_active",
        "ms_scanned_tickets.created_at",
        "ms_scanned_tickets.updated_at",
        "scanUser.first_name as scanedByFirstName",
        "scanUser.last_name as scanedByLastName",
        "removeUser.first_name as removedByFirstName",
        "removeUser.last_name as removedByByLastName",
        "ms_booking.event_id",
      ])
      .leftJoin(
        "ms_booking",
        "ms_booking.booking_id",
        "ms_scanned_tickets.booking_id"
      )
      .leftJoin(
        "users as scanUser",
        "scanUser.user_id",
        "ms_scanned_tickets.scanned_by"
      )
      .leftJoin(
        "users as removeUser",
        "removeUser.user_id",
        "ms_scanned_tickets.removed_by"
      )
      .where((builder) => {
        if (booking_id) builder.where("booking_id", booking_id);
        if (booking_code) builder.where("booking_code", booking_code);
        if (eventIds.length) builder.whereIn("ms_booking.event_id", eventIds);
        if (req.query.search)
          builder.whereRaw(`concat_ws(' ', booking_code) like ?`, [
            `%${req.query.search}%`,
          ]);
      })
      .orderBy("scan_id", "desc")
      .paginate(pagination(req.query.limit || 100, req.query.currentPage || 1));

    return sendResponse(res, 200, "Scan Ticket Details", {
      Records: ScannedTicketList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving the scanned ticket details.",
      error
    );
  }
}

export async function addEditScanTicket(req, res) {
  const reqbody = { ...req.query, ...req.body, ...req.params };
  const { user_info } = req;
  const { booking_id, scan_id, add_scan_ticket_count } = reqbody;

  if (!booking_id) {
    return sendResponse(
      res,
      400,
      "Invalid Booking Id or Booking ID not provided!"
    );
  }

  try {
    const TransactionList = await global
      .knexConnection("ms_booking")
      .where("booking_id", booking_id);

    if (!TransactionList.length) {
      return sendResponse(res, 400, "Ticket Details Not Found");
    }

    const managerList = await global.knexConnection("event_managers").where({
      user_id: user_info.user_id,
      event_id: TransactionList[0].event_id,
    });

    if (!managerList.length) {
      return sendResponse(
        res,
        400,
        "Event Manager not assigned! Please contact admin."
      );
    }

    if (scan_id) {
      // Removing scan ticket
      await global
        .knexConnection("ms_scanned_tickets")
        .where({ scan_id })
        .update({ scan_is_active: "N", removed_by: user_info.user_id });

      await global
        .knexConnection("ms_booking")
        .where({ booking_id })
        .update({
          seats_scanned: TransactionList[0].seats_scanned - 1,
          seats_tobe_scanned: TransactionList[0].seats_tobe_scanned + 1,
        });

      return sendResponse(res, 200, "Scan Details Removed Successfully");
    }

    if (
      parseFloat(add_scan_ticket_count) >
      parseFloat(TransactionList[0].seats_tobe_scanned)
    ) {
      return sendResponse(
        res,
        400,
        "Seats to be scanned cannot be greater than total available seats"
      );
    }

    for (let i = 1; i <= parseInt(add_scan_ticket_count); i++) {
      await global.knexConnection("ms_scanned_tickets").insert({
        booking_id,
        booking_code: TransactionList[0].booking_code,
        event_id: TransactionList[0].event_id,
        scanned_by: user_info.user_id,
        scan_is_active: "Y",
      });
    }

    await global
      .knexConnection("ms_booking")
      .where({ booking_id })
      .update({
        seats_scanned:
          TransactionList[0].seats_scanned + parseInt(add_scan_ticket_count),
        seats_tobe_scanned:
          TransactionList[0].seats_tobe_scanned -
          parseInt(add_scan_ticket_count),
      });
    return sendResponse(res, 200, "Scan Details Added Successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while adding/editing scan ticket.",
      error
    );
  }
}
