import { currentDateTime } from "../../lib/helper.js";
import { pagination } from "../../lib/pagination.js";
import { sendResponse } from "../../lib/responseService.js";

export async function getTransactionByCode(req, res) {
  const reqbody = { ...req.query, ...req.body, ...req.params };
  const { booking_id, booking_code, user_id } = reqbody;

  // Ensure booking code or booking ID is provided
  if (!booking_code && !booking_id) {
    return sendResponse(res, 400, "Booking Code or Booking ID is required.");
  }

  const limit = parseInt(req.query.limit) || 100;
  const currentPage = parseInt(req.query.currentPage) || 1;

  // Ensure limit and currentPage are valid numbers
  if (limit <= 0 || currentPage <= 0) {
    return sendResponse(res, 400, "Invalid pagination parameters.");
  }

  try {
    // Query the booking records with the provided filters
    const TransactionList = await global
      .knexConnection("ms_booking")
      .select("ms_booking.*", "ms_event.event_image_small")
      .leftJoin("ms_event", "ms_event.event_id", "ms_booking.event_id")
      .where({ "ms_event.event_is_active": "Y" })
      .where((builder) => {
        if (booking_id) builder.where("booking_id", "=", booking_id);
        if (booking_code) builder.where("booking_code", "=", booking_code);
        if (req.query.search) {
          builder.whereRaw(
            `concat_ws(' ', booking_code, c_email, cinema_name, event_name) like ?`,
            [`%${req.query.search}%`]
          );
        }
      })
      .orderBy("booking_id", "desc")
      .paginate(pagination(limit, currentPage));

    // Check if no records are found
    if (!TransactionList.data.length) {
      return sendResponse(res, 400, "Ticket details not found.");
    }

    // Process the records asynchronously
    const updatedTransactionList = await Promise.all(
      TransactionList.data.map(async (obj) => {
        // Format the event date and booking date
        obj["event_date"] = currentDateTime(obj["event_date"], "YYYY-MM-DD");
        obj["booking_date_time"] = currentDateTime(
          obj["event_end_date"],
          "YYYY-MM-DD hh:mm:ss"
        );

        // Fetch organiser data for each event
        const organiserData = await global
          .knexConnection("ms_event_extra_info")
          .select("extra_info_description", "extra_info_name")
          .where({
            event_id: obj.event_id,
            extra_info_type: "organiser",
            extra_info_is_active: "Y",
          });

        obj["organiserData"] = organiserData;

        // Fetch shop items using reservation_id from booking table
        const shopItems = await global
          .knexConnection("reserve_shop_items")
          .select(
            "reserve_shop_items.item_quantity",
            "reserve_shop_items.item_price",
            "reserve_shop_items.item_id",
            "shop_items.item_name",
            "shop_items.item_image"
          )
          .join(
            "shop_items",
            "reserve_shop_items.item_id",
            "shop_items.item_id"
          )
          .where({ reservation_id: obj.reservation_id })
          .where({ "reserve_shop_items.is_booked": "Y" });

        let shopAmount = 0;
        if (shopItems.length > 0) {
          for (let item of shopItems) {
            shopAmount +=
              parseFloat(item.item_price) * parseFloat(item.item_quantity);
          }
        }

        obj["shop_items"] = shopItems;
        obj["shop_amount"] = shopAmount;
        return obj;
      })
    );

    // Return the response with the updated data

    return sendResponse(res, 200, "Ticket Details retrieved successfully.", {
      Records: updatedTransactionList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching ticket details.",
      error
    );
  }
}
