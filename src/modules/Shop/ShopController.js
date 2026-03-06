import { checkValidation } from "../../lib/checkValidation.js";
import { dataReturnUpdate } from "../../lib/helper.js";
import { pagination } from "../../lib/pagination.js";
import { v4 } from "uuid";
import { sendResponse } from "../../lib/responseService.js";
import { checkAvailability } from "../../lib/shopHelpers.js";

export async function addEditShopCategory(req, res) {
  let reqbody = req.body;
  const { user_info } = req;
  const { category_id, category_name, category_is_active } = reqbody;
  const isUpdate = category_id ? true : false;
  let checkFields = [];
  if (isUpdate) {
    checkFields = ["category_name"];
  } else {
    checkFields = ["category_name"];
  }

  try {
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Invalid Request Data", result);
    }

    let checkUserExist = await global
      .knexConnection("shop_categories")
      .select(["category_name"])

      .where((builder) => {
        builder.where({ category_name });
      })
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("category_id", [category_id]);
        }
      });

    if (checkUserExist.length) {
      return sendResponse(res, 400, "User Already Exist");
    } else {
      let obj = {
        category_name: category_name || null,
        category_is_active: category_is_active || null,

        ...dataReturnUpdate(user_info, isUpdate),
      };

      if (isUpdate) {
        await global
          .knexConnection("shop_categories")
          .update(obj)
          .where({ category_id });
      } else {
        await global.knexConnection("shop_categories").insert(obj);
      }

      return sendResponse(res, 200, "Category Created Successfully");
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An unexpected error occurred in addEditShopCategory",
      error,
    );
  }
}

export async function getShopCategory(req, res) {
  try {
    const { query: reqbody, user_info } = req;
    const {
      category_id,
      category_is_active = "Y",
      limit = 100,
      currentPage = 1,
      search,
    } = reqbody;
    const isWebsiteUser = req.is_website_user || false;

    const itemList = await global
      .knexConnection("shop_categories")

      .where((builder) => {
        if (category_id)
          builder.where("shop_categories.category_id", "=", category_id);
        if (isWebsiteUser) builder.where("category_is_active", "=", "Y");
        if (search) {
          builder.whereRaw(
            `concat_ws(' ', category_name, category_name) LIKE ?`,
            [`%${search}%`],
          );
        }
      })
      .orderBy("shop_categories.category_id", "desc")
      .paginate(pagination(limit, currentPage));

    return sendResponse(res, 200, "Shop Category List Retrieved Successfully", {
      Records: itemList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the category list.",
      error,
    );
  }
}
export async function addEdtShopItems(req, res) {
  let reqbody = req.body;
  const { user_info } = req;
  const {
    item_name,
    item_unique_code,
    item_short_description,
    item_long_description,
    item_price,
    item_category_id,
    item_min_quantity,
    item_max_quantity,
    item_total_quantity,
    item_image,
    item_is_active,
    item_id,
    item_order,
  } = reqbody;
  const isUpdate = item_id ? true : false;
  let checkFields = [];
  if (isUpdate) {
    checkFields = [
      "item_name",
      "item_short_description",
      // "item_long_description",
      "item_price",
      "item_category_id",
      "item_min_quantity",
      "item_max_quantity",
      "item_total_quantity",
      "item_image",
      "item_is_active",
      "item_unique_code",
    ];
  } else {
    checkFields = [
      "item_name",
      "item_short_description",
      // "item_long_description",
      "item_price",
      "item_category_id",
      "item_min_quantity",
      "item_max_quantity",
      "item_total_quantity",
      "item_image",
      "item_is_active",
      "item_unique_code",
    ];
  }

  try {
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Invalid Request Data", result);
    }

    let checkUserExist = await global
      .knexConnection("shop_items")
      .select(["item_name"])
      .where((builder) => {
        builder.where({ item_name: item_name });
        builder.orWhere({ item_unique_code: item_unique_code });
      })
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("item_id", [item_id]);
        }
      });

    if (checkUserExist.length) {
      return sendResponse(res, 400, "Item Already Exist");
    } else {
      let obj = {
        item_name: item_name || null,
        item_short_description: item_short_description || null,
        item_long_description: item_long_description || null,
        item_price: item_price || 0,
        item_category_id: item_category_id || null,
        item_min_quantity: item_min_quantity || 1,
        item_max_quantity: item_max_quantity || 10,
        item_total_quantity: item_total_quantity || 0,

        item_image: item_image || null,
        item_is_active: item_is_active || "Y",
        item_unique_code: item_unique_code || null,
        item_order: item_order || null,
        ...dataReturnUpdate(user_info, isUpdate),
      };

      if (isUpdate) {
        await global
          .knexConnection("shop_items")
          .update(obj)
          .where({ item_id });
      } else {
        await global.knexConnection("shop_items").insert(obj);
      }

      return sendResponse(res, 200, "Item Created Successfully");
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An unexpected error occurred in addEdtShopItems",
      error,
    );
  }
}

export async function getShopItems(req, res) {
  try {
    const { query: reqbody, user_info } = req;
    const {
      item_id,
      item_is_active,
      limit = 100,
      currentPage = 1,
      search,
      item_category_id,
    } = reqbody;
    const isWebsiteUser = req.is_website_user || false;

    const itemList = await global
      .knexConnection("shop_items")

      .where((builder) => {
        if (item_id) builder.where("shop_items.item_id", "=", item_id);
        // For website users: only show active items (is_active = 'Y')
        // For dashboard: show both active and inactive (no filter)
        if (isWebsiteUser) {
          builder.where("item_is_active", "=", "Y");
        }
        if (item_category_id)
          builder.where("item_category_id", "=", item_category_id);
        if (search) {
          builder.whereRaw(`concat_ws(' ', item_name, item_name) LIKE ?`, [
            `%${search}%`,
          ]);
        }
      })
      .orderBy("shop_items.item_id", "desc")
      .paginate(pagination(limit, currentPage));

    return sendResponse(res, 200, "Shop Item List Retrieved Successfully", {
      Records: itemList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the item list.",
      error,
    );
  }
}

export async function reserveShopItems(req, res) {
  try {
    const { reservation_id, items_array } = {
      ...req.body,
      ...req.query,
      ...req.params,
    };

    if (!reservation_id) {
      return sendResponse(res, 400, "Reservation id is required");
    }

    const checkReservation = await global
      .knexConnection("ms_reservation")
      .where({ reservation_id })
      .first();

    if (!checkReservation) {
      return sendResponse(res, 400, "Invalid reservation id");
    }

    if (!items_array || items_array.length === 0) {
      return sendResponse(res, 400, "Items array is required");
    }

    for (let i of items_array) {
      if (!i.item_id) {
        return sendResponse(res, 400, "Item id is required");
        break;
      }

      const availability = await checkAvailability(i.item_id, i.item_quantity);

      if (!availability.status) {
        return sendResponse(res, 400, availability.message);
      }

      // Always fetch the latest price from shop_items
      const shopItem = await global
        .knexConnection("shop_items")
        .select("item_price")
        .where({ item_id: i.item_id })
        .first();

      await global.knexConnection("reserve_shop_items").insert({
        reservation_id,
        item_id: i.item_id,
        item_quantity: i.item_quantity,
        item_price: shopItem?.item_price || 0,
      });
    }

    return sendResponse(res, 200, "Shop Item Reserved Successfully", null);
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while reserving the item.",
      error,
    );
  }
}

export async function directShop(req, res) {
  try {
    const { items_array } = {
      ...req.body,
      ...req.query,
      ...req.params,
    };

    if (!items_array || items_array.length === 0) {
      return sendResponse(res, 400, "Items array is required");
    }

    const reservation_id = v4();

    for (let i of items_array) {
      if (!i.item_id) {
        return sendResponse(res, 400, "Item id is required");
      }

      const availability = await checkAvailability(i.item_id, i.item_quantity);

      if (!availability.status) {
        return sendResponse(res, 400, availability.message);
      }

      // Always fetch latest price from shop_items
      const shopItem = await global
        .knexConnection("shop_items")
        .select("item_price")
        .where({ item_id: i.item_id })
        .first();

      await global.knexConnection("reserve_shop_items").insert({
        reservation_id,
        item_id: i.item_id,
        item_quantity: i.item_quantity,
        item_price: shopItem?.item_price || 0,
      });
    }

    return sendResponse(res, 200, "Direct Shop Item Reserved Successfully", {
      reservation_id: reservation_id,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while reserving the item in direct shop.",
      error,
    );
  }
}

export async function getdirectShopReservedItems(req, res) {
  try {
    const { reservation_id } = {
      ...req.body,
      ...req.query,
      ...req.params,
    };
    let pg_api_route = null;

    if (!reservation_id) {
      return sendResponse(res, 400, "Reservation id is required");
    }
    let totalAmount = 0;

    const checkDirectReservationItems = await global
      .knexConnection("reserve_shop_items")
      .select(
        "reserve_shop_items.*",
        "shop_items.item_name",
        "shop_items.item_image",
        "shop_items.item_price",
        "shop_items.item_short_description",
      )
      .join("shop_items", "reserve_shop_items.item_id", "shop_items.item_id")
      .where({ reservation_id, is_reserved: "Y" });

    for (let i of checkDirectReservationItems) {
      totalAmount += i.item_price * i.item_quantity;
    }

    //fetch cinema payment gateway
    const cinemaPaymentGateway = await global
      .knexConnection("organization_setting")
      .where({ org_id: 1 })
      .where((builder) => builder.where({ setting_key: "tap_pay_payment" }));

    if (cinemaPaymentGateway.length) {
      const apiRoute = JSON.parse(cinemaPaymentGateway[0].setting_data);
      pg_api_route = apiRoute.PAYMENT_API_ROUTE_SHOP;
    }

    return sendResponse(res, 200, "Direct Shop Retrieved Successfully", {
      directReservationItems: checkDirectReservationItems,
      totalAmount: totalAmount,
      backend_api_route: pg_api_route,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while getting the direct shop items.",
      error,
    );
  }
}

export async function getShopOrderDetails(req, res) {
  try {
    const { reservation_id } = {
      ...req.body,
      ...req.query,
      ...req.params,
    };

    if (!reservation_id) {
      return sendResponse(
        res,
        400,
        "Reservation id or booking code is required",
      );
    }

    const booking = await global
      .knexConnection("ms_shop_booking")
      .where({ reservation_id })
      .first();

    if (!booking) {
      return sendResponse(res, 404, "Order not found");
    }

    const items = await global
      .knexConnection("reserve_shop_items as r")
      .select(
        "r.*",
        "s.item_name",
        "s.item_image",
        "s.item_short_description",
        "bsi.booking_code",
      )
      .join("shop_items as s", "r.item_id", "s.item_id")
      .leftJoin("booked_shop_items as bsi", function () {
        this.on("bsi.reservation_id", "r.reservation_id").andOn(
          "bsi.item_id",
          "r.item_id",
        );
      })
      .where({
        "r.reservation_id": booking.reservation_id,
        "r.is_booked": "Y",
      });

    const details = items.map((i) => {
      const lineTotal =
        Number(i.item_price || 0) * Number(i.item_quantity || 0);
      return {
        booking_code: i.booking_code,
        reservation_id: booking.reservation_id,
        customer_name: booking.c_name,
        customer_email: booking.c_email,
        customer_phone: booking.c_phone_number,
        booking_date_time: booking.booking_date_time,
        item_id: i.item_id,
        item_name: i.item_name,
        item_image: i.item_image,
        item_short_description: i.item_short_description,
        item_quantity: i.item_quantity,
        item_price: i.item_price,
        line_total: lineTotal,
      };
    });

    const totalAmount = details.reduce(
      (sum, d) => sum + Number(d.line_total || 0),
      0,
    );

    return sendResponse(res, 200, "Shop order details fetched successfully", {
      details,
      totalAmount,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the shop order details.",
      error,
    );
  }
}

export async function getShopOrdersReport(req, res) {
  try {
    const {
      limit = 50,
      currentPage = 1,
      item_name,
      customer_email,
      customer_mobile,
      customer_name,
      reservation_id,
      booking_code,
    } = req.query;

    const query = global
      .knexConnection("ms_shop_booking as b")
      .join("reserve_shop_items as r", "b.reservation_id", "r.reservation_id")
      .join("shop_items as s", "r.item_id", "s.item_id")
      .leftJoin(
        "ms_payment_booking_detail as pbd",
        "b.reservation_id",
        "pbd.reservation_id",
      )
      .where("r.is_booked", "Y");

    if (reservation_id) {
      query.where("b.reservation_id", "like", `%${reservation_id}%`);
    }
    if (booking_code) {
      query.where("b.booking_code", "like", `%${booking_code}%`);
    }
    if (customer_email) {
      query.where("b.c_email", "like", `%${customer_email}%`);
    }
    if (customer_mobile) {
      query.where("b.c_phone_number", "like", `%${customer_mobile}%`);
    }
    if (customer_name) {
      query.where("b.c_name", "like", `%${customer_name}%`);
    }
    if (item_name) {
      query.where("s.item_name", "like", `%${item_name}%`);
    }

    const records = await query
      .select(
        "b.*", // all ms_shop_booking fields
        "s.item_id",
        "s.item_name",
        "r.item_quantity",
        "r.item_price",
        "pbd.is_paid",
        "pbd.payment_transaction_id",
        "pbd.payment_capture",
      )
      .orderBy("b.booking_date_time", "desc")
      .paginate(pagination(limit, currentPage));

    return sendResponse(res, 200, "Shop orders report fetched successfully", {
      Records: records,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the shop orders report.",
      error,
    );
  }
}
