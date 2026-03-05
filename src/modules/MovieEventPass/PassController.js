import moment from "moment";
import { checkValidation } from "../../lib/checkValidation.js";
import { currentDateTime, dataReturnUpdate } from "../../lib/helper.js";
import { pagination } from "../../lib/pagination.js";

import { sendResponse } from "../../lib/responseService.js";

export async function addEditPass(req, res) {
  try {
    let reqbody = req.body;
    const { user_info } = req;
    const {
      pass_id,
      pass_name,
      pass_type,
      total_available_pass,
      pass_validity_from,
      pass_validity_to,
      discount_type,
      pass_discount_value,
      pass_tnc,
      pass_email_content,
      max_seats_per_trans,
      max_transaction_per_day,
      max_transaction_per_user,
      pass_target,
      is_validate_genre,
      is_validate_lang,
      pass_is_active,
      country_id,
      city_id,
      cinema_id,
      pass_validity,
      pass_amount,
      pass_currency_id,
      pass_feature,
      pass_tax_value,
      pass_valid_days,
      seat_type_id,
    } = reqbody;

    const isUpdate = pass_id ? true : false;
    const checkFields = [
      "pass_name",
      "pass_type",
      "total_available_pass",
      "pass_validity_from",
      "pass_validity_to",
      "discount_type",
      "pass_discount_value",
      "pass_tnc",
      "pass_email_content",
      "max_seats_per_trans",
      "max_transaction_per_day",
      "max_transaction_per_user",
      "pass_target",
      "is_validate_genre",
      "is_validate_lang",
      "pass_is_active",
      "pass_amount",
      "pass_currency_id",
      "pass_feature",
      "pass_tax_value",
      "pass_valid_days",
      "seat_type_id",
    ];

    // Validate input fields
    let validationResult = await checkValidation(checkFields, reqbody);
    if (!validationResult.status) {
      return sendResponse(res, 400, "Validation Error", validationResult);
    }

    // Validate date range
    if (moment(pass_validity_to).isBefore(pass_validity_from)) {
      return sendResponse(
        res,
        400,
        "Pass from date should be less than pass to date"
      );
    }

    // Check if the pass name already exists
    let checkPassExist = await global
      .knexConnection("movie_event_pass")
      .select(["pass_name"])
      .where({ pass_name })
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("pass_id", [pass_id]);
        }
      });

    if (checkPassExist.length) {
      return sendResponse(res, 400, "Pass Name Already Exists");
    } else {
      const obj = {
        pass_name,
        pass_type,
        total_available_pass,
        pass_validity_from,
        pass_validity_to,
        discount_type: "percent", // Default discount type
        pass_discount_value,
        pass_tnc,
        pass_email_content,
        max_seats_per_trans,
        max_transaction_per_day,
        max_transaction_per_user,
        pass_target,
        is_validate_genre,
        is_validate_lang,
        pass_is_active,
        pass_amount,
        pass_currency_id,
        pass_tax_value,
        pass_feature,
        pass_valid_days: pass_valid_days || 1,
        seat_type_id: seat_type_id || null,
        ...dataReturnUpdate(user_info, isUpdate),
      };

      let insert_pass_id = null;
      if (isUpdate) {
        await global
          .knexConnection("movie_event_pass")
          .update(obj)
          .where({ pass_id });
        insert_pass_id = pass_id;
      } else {
        obj["org_id"] = user_info.org_id;
        const insertNew = await global
          .knexConnection("movie_event_pass")
          .insert(obj);
        insert_pass_id = insertNew[0];
      }

      let insert_arry = [];
      // Handle pass_target associations
      if (pass_target === "country" && country_id.length) {
        await global
          .knexConnection("movie_event_pass_mapper")
          .where({ pass_id: insert_pass_id })
          .del();
        for (let i of country_id) {
          insert_arry.push({
            pass_id: insert_pass_id,
            country_id: i,
            pass_target: "country",
          });
        }
      }

      if (pass_target === "city" && city_id.length) {
        await global
          .knexConnection("movie_event_pass_mapper")
          .where({ pass_id: insert_pass_id })
          .del();
        for (let i of city_id) {
          const getCity = await global
            .knexConnection("ms_cities")
            .where({ city_id: i });
          if (getCity.length) {
            insert_arry.push({
              pass_id: insert_pass_id,
              city_id: getCity[0].city_id,
              country_id: getCity[0].country_id,
              pass_target: "city",
            });
          }
        }
      }

      if (pass_target === "cinema" && cinema_id.length) {
        await global
          .knexConnection("movie_event_pass_mapper")
          .where({ pass_id: insert_pass_id })
          .del();
        for (let i of cinema_id) {
          const getCinema = await global
            .knexConnection("ms_cinemas")
            .where({ cinema_id: i });
          if (getCinema.length) {
            insert_arry.push({
              pass_id: insert_pass_id,
              city_id: getCinema[0].city_id,
              country_id: getCinema[0].country_id,
              cinema_id: getCinema[0].cinema_id,
              pass_target: "cinema",
            });
          }
        }
      }

      await global
        .knexConnection("movie_event_pass_mapper")
        .insert(insert_arry);

      return sendResponse(res, 200, "Pass Updated Successfully");
    }
  } catch (error) {
    return sendResponse(res, 500, "Error in addEditPass", error);
  }
}

export async function getPassList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const pass_id = reqbody.pass_id || null;
    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;
    const isWebsiteUser = reqbody["is_website_user"] || false;
    const selectedEventType = reqbody.selectedEventType || null;
    const country_id = reqbody.country_id || null;

    const passList = await global
      .knexConnection("movie_event_pass")
      .select(
        global.knexConnection.raw(
          `movie_event_pass.*,group_concat(movie_event_pass_mapper.cinema_id) as cinema_ids,group_concat(movie_event_pass_mapper.city_id) as city_ids,group_concat(movie_event_pass_mapper.country_id) as country_ids,ms_currencies.curr_code`
        )
      )
      .leftJoin(
        "movie_event_pass_mapper",
        "movie_event_pass.pass_id",
        "movie_event_pass_mapper.pass_id"
      )
      .leftJoin(
        "ms_currencies",
        "ms_currencies.curr_id",
        "movie_event_pass.pass_currency_id"
      )
      .where((builder) => {
        if (pass_id) builder.where("movie_event_pass.pass_id", pass_id);
        if (selectedEventType)
          builder.where("movie_event_pass.pass_is_active", selectedEventType);
        if (isWebsiteUser) {
          builder.where("movie_event_pass.pass_is_active", "Y");
          builder.where("movie_event_pass_mapper.country_id", country_id);
        }
        if (reqbody.search) {
          builder.whereRaw(
            ` concat_ws(' ',movie_event_pass.pass_name) like '%${reqbody.search}%'`
          );
        }
      })
      .groupBy("movie_event_pass.pass_id")
      .orderBy("pass_id", "desc")
      .paginate(pagination(limit, currentPage));

    let newRecords = passList.data.map((z) => {
      z["pass_validity_from"] = currentDateTime(
        z["pass_validity_from"],
        "DD/MM/YYYY"
      );
      z["pass_validity_to"] = currentDateTime(
        z["pass_validity_to"],
        "DD/MM/YYYY"
      );

      if (z.cinema_ids && z.pass_target === "cinema" && pass_id) {
        z["cinema_id"] = z.cinema_ids.split(",").map(Number);
      }
      if (z.city_ids && z.pass_target === "city" && pass_id) {
        z["city_id"] = z.city_ids.split(",").map(Number);
      }
      if (z.country_ids && z.pass_target === "country" && pass_id) {
        z["country_id"] = z.country_ids.split(",").map(Number);
      }
      return z;
    });

    return sendResponse(res, 200, "Pass List", {
      Records: newRecords,
      Pagination: passList ? passList.pagination : null,
    });
  } catch (error) {
    return sendResponse(res, 500, "Error in getPassList", error);
  }
}

export async function addEditPassDiscount(req, res) {
  try {
    // Destructure the input data from the request body, query, and params
    const { pass_id, arrayDiscountedEvents } = {
      ...req.body,
      ...req.query,
      ...req.params,
    };

    // Fields that need to be validated
    const checkFields = ["pass_id", "arrayDiscountedEvents"];

    // Validate input fields
    let validationResult = await checkValidation(checkFields, req.body);
    if (!validationResult.status) {
      return sendResponse(
        res,
        400,
        "Pass ID is required and arrayDiscountedEvents is required"
      );
    }

    // Ensure arrayDiscountedEvents is an array and has valid structure
    if (
      !Array.isArray(arrayDiscountedEvents) ||
      arrayDiscountedEvents.length === 0
    ) {
      await global
        .knexConnection("pass_event_movie_discount")
        .where({ pass_id })
        .del();

      return sendResponse(res, 200, "updated");
    }

    let arrayDiscount = arrayDiscountedEvents.map((item) => ({
      pass_id: pass_id,
      event_id: item.event_id,
      discount_percent: item.discount_percent,
    }));

    // Clear any existing discounts for the pass_id
    await global
      .knexConnection("pass_event_movie_discount")
      .where({ pass_id })
      .del();

    // Insert new discounts into the database
    await global
      .knexConnection("pass_event_movie_discount")
      .insert(arrayDiscount);

    // Send a success response
    return sendResponse(res, 200, "Discounts added successfully");
  } catch (error) {
    return sendResponse(res, 500, "Error in addEditPassDiscount", error);
  }
}

export async function getPassDiscountList(req, res) {
  try {
    // Destructure and combine params, query, and body
    const { pass_id } = { ...req.params, ...req.query, ...req.body };

    // Check if pass_id is provided
    if (!pass_id) {
      return sendResponse(res, 400, "Pass ID is required");
    }

    // Initialize the discount array to hold the results
    let discountArray = [];

    // Fetch the discount list from the database
    const getDiscountList = await global
      .knexConnection("pass_event_movie_discount")
      .where({ pass_id });

    // Check if any discounts are found
    if (getDiscountList.length === 0) {
      return sendResponse(res, 400, "No discounts found for the given pass");
    }

    // Populate the discount array
    for (let i of getDiscountList) {
      discountArray.push({
        event_id: i.event_id,
        discount_percent: i.discount_percent,
      });
    }

    // Return the discount list with a successful status
    return sendResponse(res, 200, "Discount List Retrieved Successfully", {
      Records: discountArray,
    });
  } catch (error) {
    return sendResponse(res, 500, "Error in getPassDiscountList", error);
  }
}
