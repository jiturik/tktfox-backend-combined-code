import { checkValidation } from "../../lib/checkValidation.js";
import { dataReturnUpdate } from "../../lib/helper.js";
import { pagination } from "../../lib/pagination.js";
import { v4 } from "uuid";
import { sendResponse } from "../../lib/responseService.js";

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

async function checkAvailability(item_id, requestedQuantity) {
  const item = await global
    .knexConnection("shop_items")
    .where({ item_id })
    .first();

  if (!item) {
    return {
      status: false,
      message: "Invalid item id",
    };
  }

  const quantity = Number(requestedQuantity);

  if (!quantity || Number.isNaN(quantity)) {
    return {
      status: false,
      message: "Item quantity is required",
    };
  }

  const minQty = Number(item.item_min_quantity) || 0;
  const maxQty = Number(item.item_max_quantity) || 0;

  if (minQty && quantity < minQty) {
    return {
      status: false,
      message: `Minimum quantity for this item is ${minQty}`,
    };
  }

  if (maxQty && quantity > maxQty) {
    return {
      status: false,
      message: `Maximum quantity for this item is ${maxQty}`,
    };
  }

  const soldResult = await global
    .knexConnection("reserve_shop_items")
    .where({ item_id, is_reserved: "Y" })
    .sum({ total_sold: "item_quantity" })
    .first();

  const soldQty = Number(soldResult?.total_sold) || 0;
  const totalQty = Number(item.item_total_quantity) || 0;
  const availableQty = totalQty - soldQty;

  if (quantity > availableQty) {
    return {
      status: false,
      message: "Insufficient quantity available for this item",
    };
  }

  return {
    status: true,
    item,
    availableQty,
  };
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

      await global.knexConnection("reserve_shop_items").insert({
        reservation_id,
        item_id: i.item_id,
        item_quantity: i.item_quantity,
        item_price: availability.item.item_price,
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
        break;
      }

      const availability = await checkAvailability(i.item_id, i.item_quantity);

      if (!availability.status) {
        return sendResponse(res, 400, availability.message);
      }

      await global.knexConnection("reserve_shop_items").insert({
        reservation_id,
        item_id: i.item_id,
        item_quantity: i.item_quantity,
        item_price: availability.item.item_price,
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

    return sendResponse(res, 200, "Direct Shop Retrieved Successfully", {
      directReservationItems: checkDirectReservationItems,
      totalAmount: totalAmount,
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
