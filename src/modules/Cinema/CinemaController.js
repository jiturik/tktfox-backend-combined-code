import { checkValidation } from "../../lib/checkValidation.js";
import { dataReturnUpdate } from "../../lib/helper.js";
import { pagination } from "../../lib/pagination.js";
import { sendResponse } from "../../lib/responseService.js";

import {
  getFromRedis,
  removeFromRedis,
  storeInRedis,
} from "../../redis/redisHelper.js";

// Add or edit cinema information
export async function addEditCinema(req, res) {
  const { user_info } = req;
  const reqbody = req.body;

  // Destructure the fields from the request body
  const {
    country_id,
    city_id,
    timezone_id,
    currency_id,
    pay_currency_id,
    exchange_rate,
    cinema_name,
    cinema_address,
    cinema_pincode,
    cinema_email,
    cinema_cont_per_name,
    cinema_cont_per_number,
    cinema_description,
    cinema_lat,
    cinema_long,
    cinema_seat_release_time,
    cinema_is_active,
    cinema_id,
  } = reqbody;

  let cinemaOrgId = user_info.org_id;
  const isUpdate = cinema_id ? true : false;
  let checkFields = [
    "country_id",
    "timezone_id",
    "cinema_name",
    "cinema_address",
    "cinema_pincode",
    "city_id",
    "cinema_email",
    "cinema_cont_per_name",
    "cinema_is_active",
    "currency_id",
    "pay_currency_id",
    "exchange_rate",
  ];

  try {
    // Validate request fields
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Invalid request data", result);
    }

    // Check if the cinema name already exists
    let checkCinemaExist = await global
      .knexConnection("ms_cinemas")
      .select(["cinema_name"])
      .where({ cinema_name })
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("cinema_id", [cinema_id]);
        }
      });

    if (checkCinemaExist.length) {
      return sendResponse(res, 400, "Cinema Name Already Exists");
    }

    // Prepare cinema data for insertion or update
    let obj = {
      org_id: cinemaOrgId || null,
      country_id: country_id || null,
      city_id: city_id || null,
      timezone_id: timezone_id || null,
      currency_id: currency_id || null,
      pay_currency_id: pay_currency_id || null,
      exchange_rate: currency_id == pay_currency_id ? 1 : exchange_rate || 1,
      cinema_name: cinema_name || null,
      cinema_address: cinema_address || null,
      cinema_pincode: cinema_pincode || null,
      cinema_lat: cinema_lat || null,
      cinema_long: cinema_long || null,
      cinema_email: cinema_email || null,
      cinema_cont_per_name: cinema_cont_per_name || null,
      cinema_cont_per_number: cinema_cont_per_number || null,
      cinema_description: cinema_description || null,
      cinema_seat_release_time: cinema_seat_release_time || 15,
      cinema_is_active: cinema_is_active || "Y",
      ...dataReturnUpdate(user_info, isUpdate),
    };

    // Insert or update cinema record
    if (isUpdate) {
      await global
        .knexConnection("ms_cinemas")
        .update(obj)
        .where({ cinema_id });
    } else {
      await global.knexConnection("ms_cinemas").insert(obj);
    }
    return sendResponse(res, 200, "Cinema Updated Successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while adding/editing cinema.",
      error
    );
  }
}

// Get a list of cinemas with optional filters
export async function getCinemaList(req, res) {
  const reqbody = { ...req.query, ...req.body };
  const { user_info } = req;

  const {
    cinema_id,
    country_id,
    city_id,
    org_id,
    limit = 100,
    currentPage = 1,
  } = reqbody;
  const isWebsiteUser = req["is_website_user"] || false;

  if (isWebsiteUser) {
    const redisData = await getFromRedis("websiteCinemaList");
    if (redisData) {
      return sendResponse(res, 200, "Cinema List Fetched From Redis", {
        Records: redisData,
      });
    }
  }

  let cinema_is_active = isWebsiteUser ? "Y" : null;

  try {
    // Build query dynamically with filters
    const CinemaList = await global
      .knexConnection("ms_cinemas")
      .select([
        "ms_cinemas.*",
        "ms_cities.city_name",
        "ms_countries.country_name",
        "ms_currencies.curr_code",
        "ms_time_zones.tz_name",
        "organizations.org_name",
      ])
      .leftJoin("ms_cities", "ms_cities.city_id", "ms_cinemas.city_id")
      .leftJoin(
        "ms_countries",
        "ms_countries.country_id",
        "ms_cinemas.country_id"
      )
      .leftJoin(
        "ms_currencies",
        "ms_currencies.curr_id",
        "ms_cinemas.currency_id"
      )
      .leftJoin(
        "ms_time_zones",
        "ms_time_zones.tz_id",
        "ms_cinemas.timezone_id"
      )
      .leftJoin("organizations", "organizations.org_id", "ms_cinemas.org_id")
      .where((builder) => {
        if (cinema_id) builder.where("cinema_id", "=", cinema_id);
        if (user_info.org_id)
          builder.where("ms_cinemas.org_id", "=", user_info.org_id);
        if (city_id) builder.where("ms_cinemas.city_id", "=", city_id);
        if (cinema_is_active)
          builder.where("ms_cinemas.cinema_is_active", "=", cinema_is_active);
        if (country_id) builder.where("ms_cinemas.country_id", "=", country_id);
        if (org_id) builder.where("ms_cinemas.org_id", "=", org_id);
        if (isWebsiteUser)
          builder.where("ms_cinemas.cinema_is_active", "=", "Y");
        if (req.query.search) {
          builder.whereRaw(
            ` concat_ws(' ',cinema_name,cinema_email) like '%${req.query.search}%'`
          );
        }
      })
      .orderBy("cinema_id", "desc")
      .paginate(pagination(limit, currentPage));

    if (isWebsiteUser) {
      storeInRedis("websiteCinemaList", CinemaList);
    }
    return sendResponse(res, 200, "Cinema List", {
      Records: CinemaList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving the cinema list.",
      error
    );
  }
}
