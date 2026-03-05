import { checkValidation } from "../../lib/checkValidation.js";
import { dataReturnUpdate } from "../../lib/helper.js";
import { pagination } from "../../lib/pagination.js";
import NodeCache from "node-cache";
import bcrypt from "bcryptjs";
import zlib from "zlib";

import {
  getFromRedis,
  removeFromRedis,
  storeInRedis,
} from "../../redis/redisHelper.js";
import { sendResponse } from "../../lib/responseService.js";

const eventCache = new NodeCache();

export async function addEditCountries(req, res) {
  try {
    const { user_info, body: reqbody } = req;
    const {
      country_name,
      country_code,
      country_mob_code,
      country_flag_upload,
      country_is_active,
      country_id,
    } = reqbody;
    const isUpdate = !!country_id;
    const checkFields = [
      "country_name",
      "country_code",
      "country_mob_code",
      "country_is_active",
    ];

    // Validate required fields
    let validationResult = await checkValidation(checkFields, reqbody);
    if (!validationResult.status) {
      return sendResponse(res, 400, "Validation Error", validationResult);
    }

    // Check if country exists
    let checkCountryExist = await global
      .knexConnection("ms_countries")
      .select([
        "country_name",
        "country_code",
        "country_mob_code",
        "country_is_active",
      ])
      .where("country_name", country_name)
      .andWhere((builder) => {
        if (isUpdate) builder.whereNotIn("country_id", [country_id]);
      });

    if (checkCountryExist.length) {
      return sendResponse(res, 400, "Country Already Exists");
    }

    // Prepare object for insert or update
    let obj = {
      country_name,
      country_code,
      country_flag_upload,
      country_mob_code,
      country_is_active: country_is_active || "Y",
      org_id: user_info.org_id,
      ...dataReturnUpdate(user_info, isUpdate),
    };

    // Insert or Update the country
    if (isUpdate) {
      await global
        .knexConnection("ms_countries")
        .update(obj)
        .where({ country_id });
    } else {
      await global.knexConnection("ms_countries").insert(obj);
    }
    return sendResponse(res, 200, "Country Updated Successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing the country.",
      error
    );
  }
}

export async function getCountryList(req, res) {
  try {
    const { query: reqbody, user_info } = req;
    const {
      country_id,
      country_is_active = "Y",
      limit = 100,
      currentPage = 1,
      search,
    } = reqbody;
    const isWebsiteUser = req.is_website_user || false;
    const isMaster = reqbody.isMaster === "Y";
    const finalCountryIsActive =
      isWebsiteUser || !isMaster ? "Y" : country_is_active;

    const CountryList = await global
      .knexConnection("ms_countries")
      .select([
        "country_name",
        "country_code",
        "country_mob_code",
        "country_is_active",
        "country_flag_upload",
        "ms_countries.country_id",
      ])
      .where((builder) => {
        if (country_id)
          builder.where("ms_countries.country_id", "=", country_id);
        if (finalCountryIsActive)
          builder.where("country_is_active", "=", finalCountryIsActive);
        if (search) {
          builder.whereRaw(
            `concat_ws(' ', country_name, country_code) LIKE ?`,
            [`%${search}%`]
          );
        }
      })
      .orderBy("ms_countries.country_id", "desc")
      .paginate(pagination(limit, currentPage));

    return sendResponse(res, 200, "Country List Retrieved Successfully", {
      Records: CountryList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the country list.",
      error
    );
  }
}

export async function addEditCities(req, res) {
  try {
    const { user_info, body: reqbody } = req;
    const { city_name, city_is_active, country_id, city_id } = reqbody;
    const isUpdate = !!city_id;
    const checkFields = ["city_name", "city_is_active", "country_id"];

    // Validate required fields
    let validationResult = await checkValidation(checkFields, reqbody);
    if (!validationResult.status) {
      return sendResponse(res, 400, "Validation Error", validationResult);
    }

    // Check if city exists
    let checkCityExist = await global
      .knexConnection("ms_cities")
      .select(["city_name", "city_is_active"])
      .where("city_name", city_name)
      .andWhere((builder) => {
        if (isUpdate) builder.whereNotIn("city_id", [city_id]);
      });

    if (checkCityExist.length) {
      return sendResponse(res, 400, "City Already Exists");
    }

    // Prepare object for insert or update
    let obj = {
      city_name,
      city_is_active: city_is_active || "Y",
      country_id,
      org_id: user_info.org_id,
      ...dataReturnUpdate(user_info, isUpdate),
    };

    // Insert or Update the city
    if (isUpdate) {
      await global.knexConnection("ms_cities").update(obj).where({ city_id });
    } else {
      await global.knexConnection("ms_cities").insert(obj);
    }
    return sendResponse(res, 200, "City Updated Successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing the city.",
      error
    );
  }
}

export async function getCityList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };
    const country_id = reqbody.country_id || null;
    let city_is_active = reqbody.city_is_active || null;
    const city_id = reqbody.city_id || null;
    const limit = req.query.limit ? req.query.limit : 100;
    const currentPage = req.query.currentPage ? req.query.currentPage : 1;
    const { user_info } = req;
    let isMaster = reqbody.isMaster && reqbody.isMaster === "Y" ? true : false;

    if (!isMaster) {
      city_is_active = "Y";
    }

    const CityList = await global
      .knexConnection("ms_cities")
      .leftJoin(
        "ms_countries",
        "ms_countries.country_id",
        "ms_cities.country_id"
      )
      .select([
        "city_name",
        "city_is_active",
        "country_name",
        "ms_countries.country_id",
        "city_id",
      ])
      .where((builder) => {
        if (country_id) {
          builder.where("ms_countries.country_id", "=", country_id);
        }
        if (city_is_active) {
          builder.where("city_is_active", "=", city_is_active);
        }
        if (city_id) {
          builder.where("city_id", "=", city_id);
        }
        if (req.query.search) {
          builder.whereRaw(
            ` concat_ws(' ',city_name) like '%${req.query.search}%'`
          );
        }
      })
      .orderBy("country_id", "desc")
      .paginate(pagination(limit, currentPage));
    return sendResponse(res, 200, "City List", { Records: CityList });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching city list.",
      error
    );
  }
}

export async function addEditLanguages(req, res) {
  try {
    let reqbody = req.body;
    const { user_info } = req;
    const { lang_name, lang_is_active, lang_iso2, lang_iso3, lang_id } =
      reqbody;
    const isUpdate = lang_id ? true : false;
    let checkFields = ["lang_name", "lang_is_active"];
    let result = await checkValidation(checkFields, reqbody);

    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    let checkLanguageExist = await global
      .knexConnection("ms_languages")
      .select(["lang_name", "lang_is_active"])
      .where({ lang_name })
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("lang_id", [lang_id]);
        }
      });

    if (checkLanguageExist.length) {
      return sendResponse(res, 400, "Language Already Exist");
    } else {
      let obj = {
        lang_name: lang_name || null,
        lang_iso2: lang_iso2 || null,
        lang_iso3: lang_iso3 || null,
        lang_is_active: lang_is_active || "Y",
        org_id: user_info.org_id,
        ...dataReturnUpdate(user_info, isUpdate),
      };

      if (isUpdate) {
        await global
          .knexConnection("ms_languages")
          .update(obj)
          .where({ lang_id });
      } else {
        await global.knexConnection("ms_languages").insert(obj);
      }
      return sendResponse(res, 200, "Language Updated Successfully");
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing the language.",
      error
    );
  }
}

export async function getLanguageList(req, res) {
  try {
    const { user_info } = req;
    const reqbody = { ...req.query, ...req.body };
    const lang_id = reqbody.lang_id || null;
    let lang_is_active = reqbody.lang_is_active || null;
    const limit = req.query.limit ? req.query.limit : 100;
    const currentPage = req.query.currentPage ? req.query.currentPage : 1;
    const isWebsiteUser = req["is_website_user"] || false;

    if (isWebsiteUser) {
      lang_is_active = "Y";
    }

    let isMaster = reqbody.isMaster && reqbody.isMaster === "Y" ? true : false;
    if (!isMaster) {
      lang_is_active = "Y";
    }

    const LanguageList = await global
      .knexConnection("ms_languages")
      .select([
        "lang_iso2",
        "lang_iso3",
        "lang_name",
        "lang_id",
        "lang_is_active",
      ])
      .where((builder) => {
        if (lang_id) {
          builder.where("lang_id", "=", lang_id);
        }
        if (lang_is_active) {
          builder.where("lang_is_active", "=", lang_is_active);
        }
        if (req.query.search) {
          builder.whereRaw(
            ` concat_ws(' ',lang_name,lang_iso2,lang_iso3) like '%${req.query.search}%'`
          );
        }
      })
      .orderBy("lang_id", "desc")
      .paginate(pagination(limit, currentPage));

    return sendResponse(res, 200, "Language List", { Records: LanguageList });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching language list.",
      error
    );
  }
}

export async function addEditGenre(req, res) {
  try {
    let reqbody = req.body;
    const { user_info } = req;
    const { genre_name, genre_is_active, genre_id } = reqbody;
    const isUpdate = genre_id ? true : false;
    let checkFields = ["genre_name", "genre_is_active"];
    let result = await checkValidation(checkFields, reqbody);

    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    let checkGenreExist = await global
      .knexConnection("ms_genre")
      .select(["genre_name", "genre_is_active"])
      .where({ genre_name })
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("genre_id", [genre_id]);
        }
      });

    if (checkGenreExist.length) {
      return sendResponse(res, 400, "Genre Already Exist");
    } else {
      let obj = {
        genre_name: genre_name || null,
        genre_is_active: genre_is_active || "Y",
        org_id: user_info.org_id,
        ...dataReturnUpdate(user_info, isUpdate),
      };

      if (isUpdate) {
        await global.knexConnection("ms_genre").update(obj).where({ genre_id });
      } else {
        await global.knexConnection("ms_genre").insert(obj);
      }

      return sendResponse(res, 200, "Genre Updated Successfully");
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing genre.",
      error
    );
  }
}

export async function getGenreList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };
    const genre_id = reqbody.genre_id || null;
    let genre_is_active = reqbody.genre_is_active || null;
    const limit = req.query.limit ? req.query.limit : 100;
    const currentPage = req.query.currentPage ? req.query.currentPage : 1;
    const { user_info } = req;
    let isMaster = reqbody.isMaster && reqbody.isMaster === "Y" ? true : false;

    if (!isMaster) {
      genre_is_active = "Y";
    }

    const GenreList = await global
      .knexConnection("ms_genre")
      .select(["genre_name", "genre_id", "genre_is_active"])
      .where((builder) => {
        if (genre_id) {
          builder.where("genre_id", "=", genre_id);
        }
        if (genre_is_active) {
          builder.where("genre_is_active", "=", genre_is_active);
        }
        if (req.query.search) {
          builder.whereRaw(
            ` concat_ws(' ',genre_name) like '%${req.query.search}%'`
          );
        }
      })
      .orderBy("genre_id", "desc")
      .paginate(pagination(limit, currentPage));
    return sendResponse(res, 200, "Genre List", { Records: GenreList });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching genre list.",
      error
    );
  }
}

export async function addEditSeatType(req, res) {
  try {
    let reqbody = req.body;
    const { user_info } = req;
    const { seat_class_name, sct_is_active, sct_id } = reqbody;
    const isUpdate = sct_id ? true : false;
    let checkFields = ["seat_class_name", "sct_is_active"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    let checkSeatTypeExist = await global
      .knexConnection("ms_seat_class_type")
      .select(["seat_class_name", "sct_is_active"])
      .where({ seat_class_name })
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("sct_id", [sct_id]);
        }
      });

    if (checkSeatTypeExist.length) {
      return sendResponse(res, 400, "Seat Type Already Exist");
    } else {
      let obj = {
        seat_class_name: seat_class_name || null,
        sct_is_active: sct_is_active || "Y",
        org_id: user_info.org_id,
        ...dataReturnUpdate(user_info, isUpdate),
      };
      if (isUpdate) {
        await global
          .knexConnection("ms_seat_class_type")
          .update(obj)
          .where({ sct_id });
      } else {
        await global.knexConnection("ms_seat_class_type").insert(obj);
      }
      return sendResponse(res, 200, "Seat Type Updated Successfully");
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing seat type.",
      error
    );
  }
}

export async function getSeatTypeList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };
    const sct_id = reqbody.sct_id || null;
    let sct_is_active = reqbody.sct_is_active || null;
    const limit = req.query.limit ? req.query.limit : 100;
    const currentPage = req.query.currentPage ? req.query.currentPage : 1;
    const { user_info } = req;
    let isMaster = reqbody.isMaster && reqbody.isMaster === "Y" ? true : false;

    if (!isMaster) {
      sct_is_active = "Y";
    }

    const SeatTypeList = await global
      .knexConnection("ms_seat_class_type")
      .select(["seat_class_name", "sct_id", "sct_is_active"])
      .where((builder) => {
        if (sct_id) builder.where("sct_id", "=", sct_id);
        if (sct_is_active) builder.where("sct_is_active", "=", sct_is_active);
        if (req.query.search) {
          builder.whereRaw(
            ` concat_ws(' ',seat_class_name) like '%${req.query.search}%'`
          );
        }
      })
      .orderBy("sct_id", "desc")
      .paginate(pagination(limit, currentPage));
    return sendResponse(res, 200, "Seat Type List", { Records: SeatTypeList });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the seat type list.",
      error
    );
  }
}

export async function addEditCurrency(req, res) {
  try {
    let reqbody = req.body;
    const { user_info } = req;
    const { curr_code, curr_is_active, curr_id, curr_name } = reqbody;
    const isUpdate = curr_id ? true : false;
    let checkFields = ["curr_code", "curr_is_active", "curr_name"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    let checkCurrencyExist = await global
      .knexConnection("ms_currencies")
      .select(["curr_code", "curr_is_active"])
      .where({ curr_code })
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("curr_id", [curr_id]);
        }
      });

    if (checkCurrencyExist.length) {
      return sendResponse(res, 400, "Currency Already Exist");
    } else {
      let obj = {
        curr_code: curr_code || null,
        curr_name: curr_name || null,
        curr_is_active: curr_is_active || "Y",
        org_id: user_info.org_id,
        ...dataReturnUpdate(user_info, isUpdate),
      };
      if (isUpdate) {
        await global
          .knexConnection("ms_currencies")
          .update(obj)
          .where({ curr_id });
      } else {
        await global.knexConnection("ms_currencies").insert(obj);
      }
      return sendResponse(res, 200, "Currency Updated Successfully");
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing currency.",
      error
    );
  }
}

export async function getCurrencyList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };
    const curr_id = reqbody.curr_id || null;
    let curr_is_active = reqbody.curr_is_active || null;
    const limit = req.query.limit ? req.query.limit : 100;
    const currentPage = req.query.currentPage ? req.query.currentPage : 1;
    const { user_info } = req;
    let isMaster = reqbody.isMaster && reqbody.isMaster === "Y" ? true : false;

    if (!isMaster) {
      curr_is_active = "Y";
    }

    const CurrencyList = await global
      .knexConnection("ms_currencies")
      .select(["curr_code", "curr_name", "curr_id", "curr_is_active"])
      .where((builder) => {
        if (curr_id) builder.where("curr_id", "=", curr_id);
        if (curr_is_active)
          builder.where("curr_is_active", "=", curr_is_active);
        if (req.query.search) {
          builder.whereRaw(
            ` concat_ws(' ',curr_code,curr_name) like '%${req.query.search}%'`
          );
        }
      })
      .orderBy("curr_id", "desc")
      .paginate(pagination(limit, currentPage));
    return sendResponse(res, 200, "Currency List", { Records: CurrencyList });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the currency list.",
      error
    );
  }
}

export async function addEditBanner(req, res) {
  try {
    let reqbody = req.body;
    const { user_info } = req;
    const { bannerArray, country_id } = reqbody;
    let checkFields = ["bannerArray", "country_id"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }
    //Remove redis cache
    await removeFromRedis(`redisCache:activeWebsiteBanner`);

    let arrayBanner = [];

    for (let objBanner of bannerArray) {
      let checkFields2 = ["event_id", "order"];
      let result2 = await checkValidation(checkFields2, objBanner);
      if (!result2.status) {
        return sendResponse(res, 400, "Validation Error", result2);
      }
      arrayBanner.push({
        event_id: objBanner.event_id,
        order: objBanner.order,
        country_id,
      });
    }

    await global.knexConnection("ms_banner").where({ country_id }).del();
    await global.knexConnection("ms_banner").insert(arrayBanner);
    return sendResponse(res, 200, "Banner Updated Successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing banner.",
      error
    );
  }
}

export async function getBannerList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };
    const {
      b_id,
      event_id,
      country_id,
      limit = 100,
      currentPage = 1,
    } = reqbody;
    const isWebsiteUser = req["is_website_user"] || false;
    const { user_info } = req;
    if (isWebsiteUser) {
      const redisData = await getFromRedis(`redisCache:activeWebsiteBanner`);
      if (redisData) {
        return sendResponse(res, 200, "Banner List from Redis cache", {
          Records: redisData,
        });
      }
    }

    const BannerList = await global
      .knexConnection("ms_banner")
      .leftJoin("ms_event", "ms_event.event_id", "ms_banner.event_id")
      .select([
        "ms_banner.*",
        "event_name",
        "event_short_description",
        "event_image_medium",
        "event_image_large",
        "event_image_small",
      ])
      .where((builder) => {
        if (b_id) builder.where("b_id", "=", b_id);
        if (event_id) builder.where("event_id", "=", event_id);
        if (!isWebsiteUser && user_info.org_id)
          builder.where("ms_event.org_id", "=", user_info.org_id);
        if (isWebsiteUser) builder.where("event_is_active", "=", "Y");
        if (country_id) builder.where("country_id", "=", country_id);
        if (req.query.search)
          builder.whereRaw(
            ` concat_ws(' ',event_name) like '%${req.query.search}%'`
          );
      })
      .orderBy("order", "asc")
      .paginate(pagination(limit, currentPage));

    if (isWebsiteUser) {
      await storeInRedis(`redisCache:activeWebsiteBanner`, BannerList, 3600);
    }
    return sendResponse(res, 200, "Banner List", { Records: BannerList });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching banner.",
      error
    );
  }
}

export async function addEditSeatLayout(req, res) {
  try {
    const reqbody = req.body;
    const { user_info } = req;
    const {
      seat_layout_name,
      seat_layout_data,
      sl_id,
      seat_count,
      priceArray,
      sl_is_active,
      sl_type,
      is_dashboard,
      layout_width,
    } = reqbody;
    const isUpdate = !!sl_id;

    let checkFields = is_dashboard
      ? ["seat_layout_name"]
      : ["seat_layout_name", "seat_layout_data", "priceArray"];
    let result = await checkValidation(checkFields, reqbody);

    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    let checkExist = await global
      .knexConnection("ms_seat_layout")
      .select(["seat_layout_name"])
      .where({ seat_layout_name })
      .andWhere((builder) => {
        if (isUpdate) builder.whereNotIn("sl_id", [sl_id]);
      });

    if (checkExist.length) {
      return sendResponse(res, 400, "Seat Layout Name Already Exist");
    }

    const obj =
      is_dashboard && isUpdate
        ? {
            seat_layout_name: seat_layout_name || null,
            sl_type: sl_type || "open",
            sl_is_active: sl_is_active || "Y",
            layout_width,
          }
        : {
            seat_layout_name: seat_layout_name || null,
            seat_layout_data: seat_layout_data
              ? JSON.stringify(seat_layout_data)
              : null,
            price_data: priceArray ? JSON.stringify(priceArray) : null,
            seat_count: seat_count || 0,
          };

    if (isUpdate) {
      await global
        .knexConnection("ms_seat_layout")
        .update(obj)
        .where({ sl_id });
      eventCache.del("SL" + sl_id);
    } else {
      await global.knexConnection("ms_seat_layout").insert(obj);
    }
    return sendResponse(res, 200, `Seat Layout Updated Successfully`);
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing seat layout.",
      error
    );
  }
}

export async function getSeatLayoutList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };
    const {
      sl_id,
      layout_admin,
      is_dashboard,
      layout_clone,
      curr_is_active,
      limit = 100,
      currentPage = 1,
    } = reqbody;
    let seat_layout_select = [
      "sl_id",
      "seat_layout_name",
      "seat_count",
      "price_data",
      "sl_type",
      "sl_is_active",
      "layout_width",
    ];

    if (sl_id) {
      if (
        layout_admin &&
        layout_admin == "Y" &&
        layout_clone &&
        layout_clone == "N"
      ) {
        const getSeatBooked = await global
          .knexConnection("ms_reservation")
          .select("event_sch_id")
          .leftJoin("ms_event", "ms_event.event_id", "ms_reservation.event_id")
          .where({
            "ms_reservation.is_reserved": "Y",
            "ms_event.sl_id": sl_id,
          });

        if (getSeatBooked.length) {
          return sendResponse(
            res,
            400,
            "Seats booked for this layout cannot edit, please contact admin"
          );
        }
      }

      if (layout_admin && layout_admin == "Y") {
        const cachedLayoutAdmin = eventCache.get("SL_ADMIN" + sl_id);
        if (cachedLayoutAdmin) {
          return sendResponse(
            res,
            200,
            "Seat Layout List from cache",
            cachedLayoutAdmin
          );
        }
        seat_layout_select.push("seat_layout_data");
      } else {
        const cachedLayout = eventCache.get("SL" + sl_id);
        if (cachedLayout) {
          return sendResponse(
            res,
            200,
            "Seat Layout List from cache",
            cachedLayout
          );
        }
        seat_layout_select.push("seat_layout_data");
      }
    }

    const SeatLayoutList = await global
      .knexConnection("ms_seat_layout")
      .select(seat_layout_select)
      .where((builder) => {
        if (sl_id) builder.where("sl_id", "=", sl_id);
        if (!is_dashboard) builder.where("sl_is_active", "=", "Y");
        if (req.query.search)
          builder.whereRaw(
            ` concat_ws(' ',seat_layout_name) like '%${req.query.search}%'`
          );
      })
      .orderBy("sl_id", "desc")
      .orderBy("sl_is_active", "Y")
      .paginate(pagination(limit, currentPage));

    if (SeatLayoutList && SeatLayoutList.data && sl_id) {
      SeatLayoutList.data.map((z) => {
        let compressedString =
          layout_admin && layout_admin == "Y"
            ? z.seat_layout_data
            : zlib.deflateSync(z.seat_layout_data).toString("base64");
        z["seat_layout_data"] = compressedString;
      });

      const cacheKey =
        layout_admin && layout_admin == "Y" ? "SL_ADMIN" + sl_id : "SL" + sl_id;
      eventCache.set(cacheKey, SeatLayoutList, 9000000);
    }
    return sendResponse(res, 200, "Seat Layout List", SeatLayoutList);
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing seat layout.",
      error
    );
  }
}

export async function getTimeZoneList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };
    const { tz_id, curr_is_active, limit = 100, currentPage = 1 } = reqbody;

    const TimeZoneList = await global
      .knexConnection("ms_time_zones")
      .select(["tz_name", "tz_id"])
      .where((builder) => {
        if (tz_id) builder.where("tz_id", "=", tz_id);
        if (req.query.search)
          builder.whereRaw(
            ` concat_ws(' ',tz_name,curr_name) like '%${req.query.search}%'`
          );
      })
      .orderBy("tz_id", "desc")
      .paginate(pagination(limit, currentPage));
    return sendResponse(res, 200, "Time Zone List", { Records: TimeZoneList });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing time zone.",
      error
    );
  }
}

export async function addEditOrgWebsite(req, res) {
  try {
    const reqbody = req.body;
    const { user_info } = req;
    const { org_id, website_url } = reqbody;

    const result = await checkValidation(["org_id", "website_url"], reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    await global.knexConnection("org_website").where({ org_id }).del();

    const webArry = website_url
      .filter((i) => i.value)
      .map((i) => ({
        org_id: org_id,
        website_url: i.value,
      }));

    await global.knexConnection("org_website").insert(webArry);
    return sendResponse(res, 200, "Org Website Linked");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing org website.",
      error
    );
  }
}

export async function addEditRoles(req, res) {
  try {
    const reqbody = req.body;
    const { user_info } = req;
    const { role_id, role_name, role_is_active } = reqbody;
    const isUpdate = role_id ? true : false;
    const checkFields = ["role_name"];

    // Validate required fields
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    // Check if the role already exists
    const checkRoleExist = await global
      .knexConnection("ms_roles")
      .select(["role_name"])
      .where("role_name", role_name)
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("role_id", [role_id]);
        }
      });

    if (checkRoleExist.length) {
      return sendResponse(res, 400, "Role Already Exists");
    }

    // Prepare data to insert/update
    const obj = {
      role_id: role_id || null,
      role_name: role_name || null,
      role_is_active: role_is_active || "Y",
      ...dataReturnUpdate(user_info, isUpdate),
    };

    if (isUpdate) {
      await global.knexConnection("ms_roles").update(obj).where({ role_id });
    } else {
      await global.knexConnection("ms_roles").insert(obj);
    }
    return sendResponse(res, 200, `Role Updated Successfully`);
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing role.",
      error
    );
  }
}

export async function getRolesList(req, res) {
  try {
    const { user_info } = req;
    const reqbody = { ...req.query, ...req.body };
    const role_id = reqbody.role_id || null;
    const role_is_active = reqbody.curr_is_active || null;
    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;

    const RolesList = await global
      .knexConnection("ms_roles")
      .where((builder) => {
        builder.where("role_id", "!=", 1);
        if (role_id) builder.where("role_id", "=", role_id);
        builder.where("role_id", "!=", 3);
        if (user_info.is_super_admin !== "Y") builder.where("role_id", "!=", 3);
        if (req.query.search)
          builder.whereRaw(
            ` concat_ws(' ',role_name) like '%${req.query.search}%'`
          );
      })
      .orderBy("role_id", "desc")
      .paginate(pagination(limit, currentPage));
    return sendResponse(res, 200, "Roles List", { Records: RolesList });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing role.",
      error
    );
  }
}

export async function getOrgList(req, res) {
  try {
    const { user_info } = req;
    if (user_info.is_super_admin !== "Y") {
      return sendResponse(res, 403, "Access Denied!");
    }

    const reqbody = { ...req.query, ...req.body };
    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;

    const OrgList = await global
      .knexConnection("organizations")
      .select(
        global.knexConnection.raw(
          `organizations.*,group_concat(org_website.website_url) as org_website_names`
        )
      )
      .leftJoin("org_website", "organizations.org_id", "org_website.org_id")
      .where((builder) => {
        if (req.query.search)
          builder.whereRaw(
            ` concat_ws(' ',org_name) like '%${req.query.search}%'`
          );
      })
      .orderBy("organizations.org_id", "desc")
      .groupBy("organizations.org_id")
      .paginate(pagination(limit, currentPage));
    return sendResponse(res, 200, "Org List", { Records: OrgList });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing org.",
      error
    );
  }
}

export async function addEditOrg(req, res) {
  try {
    const reqbody = req.body;
    const { user_info } = req;
    if (user_info.is_super_admin !== "Y") {
      return sendResponse(res, 403, "Access Denied! Only Super Admin");
    }

    const {
      first_name,
      last_name,
      email,
      mobile_number,
      employee_code,
      user_name,
      password,
      user_is_active,
      role_id,
      user_id,
      role_permission,
    } = reqbody;
    const isUpdate = user_id ? true : false;
    let checkFields = isUpdate
      ? [
          "first_name",
          "last_name",
          "mobile_number",
          "user_name",
          "user_is_active",
          "role_id",
          "email",
          "role_permission",
        ]
      : [
          "first_name",
          "last_name",
          "mobile_number",
          "user_name",
          "password",
          "user_is_active",
          "role_id",
          "email",
          "role_permission",
        ];

    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Invalid Request Data", result);
    }

    const checkUserExist = await global
      .knexConnection("users")
      .select([
        "user_name",
        "first_name",
        "last_name",
        "email",
        "role_name",
        "password",
        "users.user_id",
        "users.role_id",
      ])
      .leftJoin("ms_roles", "ms_roles.role_id", "users.role_id")
      .where((builder) => {
        builder.where({ user_name });
        builder.orWhere({ email: user_name });
      })
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("user_id", [user_id]);
        }
      });

    if (checkUserExist.length) {
      return sendResponse(res, 400, "User Already Exists");
    }

    const obj = {
      first_name,
      last_name,
      email,
      mobile_number,
      employee_code,
      user_name,
      user_is_active: user_is_active || "Y",
      role_id: role_id || 1,
      org_id: user_info.org_id,
      role_permission: JSON.stringify(role_permission) || null,
      ...dataReturnUpdate(user_info, isUpdate),
    };

    if (isUpdate) {
      await global.knexConnection("users").update(obj).where({ user_id });
    } else {
      obj["password"] = bcrypt.hashSync(password, 10);
      const orgObj = {
        org_name: first_name || null,
        org_is_active: "Y",
      };

      const [orgId] = await global
        .knexConnection("organizations")
        .insert(orgObj)
        .returning("org_id");
      obj.org_id = orgId;
      await global.knexConnection("users").insert(obj);
    }

    return sendResponse(res, 200, "User Updated Successfully.");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing org.",
      error
    );
  }
}

export async function addEditVouchers(req, res) {
  try {
    const reqbody = req.body;
    const { user_info } = req;
    const {
      event_id,
      voucher_code,
      min_seats_required,
      max_seats_required,
      max_transaction_per_user,
      total_available_voucher,
      discount_type,
      voucher_discount_value,
      voucher_id,
      voucher_is_active,
    } = reqbody;
    const isUpdate = voucher_id ? true : false;

    const checkFields = [
      "event_id",
      "voucher_code",
      "min_seats_required",
      "max_seats_required",
      "max_transaction_per_user",
      "total_available_voucher",
      "discount_type",
      "voucher_discount_value",
    ];

    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Invalid Request Data", result);
    }

    const checkVoucherExist = await global
      .knexConnection("ms_vouchers")
      .select(["voucher_code"])
      .where({ event_id, voucher_code })
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("voucher_id", [voucher_id]);
        }
      });

    if (checkVoucherExist.length) {
      return sendResponse(res, 400, "Voucher Already Exists");
    }

    const obj = {
      event_id,
      voucher_code,
      min_seats_required: min_seats_required || 1,
      max_seats_required: max_seats_required || 1,
      max_transaction_per_user: max_transaction_per_user || 1,
      total_available_voucher: total_available_voucher || 0,
      discount_type: discount_type || "percent",
      voucher_discount_value: voucher_discount_value || 0,
      voucher_is_active: voucher_is_active || "Y",
      ...dataReturnUpdate(user_info, isUpdate),
    };

    if (isUpdate) {
      await global
        .knexConnection("ms_vouchers")
        .update(obj)
        .where({ voucher_id });
    } else {
      await global.knexConnection("ms_vouchers").insert(obj);
    }
    return sendResponse(res, 200, "Voucher Updated Successfully.");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while creating voucher.",
      error
    );
  }
}

// Function to retrieve the voucher list
export async function getVoucherList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };
    const voucher_id = reqbody.voucher_id || null;
    const voucher_code = reqbody.voucher_code || null;
    const selectedEventType = reqbody.selectedEventType || null;
    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;
    const { user_info } = req;

    // Fetching voucher data from the database with filters and pagination
    const VoucherList = await global
      .knexConnection("ms_vouchers")
      .leftJoin("ms_event", "ms_event.event_id", "ms_vouchers.event_id")
      .select(["ms_vouchers.*", "ms_event.event_name"])
      .where((builder) => {
        if (voucher_id) builder.where("voucher_id", "=", voucher_id);
        if (req.query.search)
          builder.whereRaw(
            `concat_ws(' ', voucher_code) like '%${req.query.search}%'`
          );
        if (user_info.org_id)
          builder.where("ms_event.org_id", "=", user_info.org_id);
        if (selectedEventType)
          builder.where("ms_event.event_is_active", "=", selectedEventType);
      })
      .orderBy("voucher_id", "desc")
      .paginate(pagination(limit, currentPage));

    return sendResponse(res, 200, "Voucher List Retrieved Successfully.", {
      Records: VoucherList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving vouchers.",
      error
    );
  }
}

// Function to add/edit blocked seats
export async function addEditBlockedSeats(req, res) {
  try {
    let reqbody = req.body;
    const { user_info } = req;
    const { event_id, event_sch_id, seatsArray } = reqbody;
    const checkFields = ["event_id", "event_sch_id"];

    // Validate input fields
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Invalid Request Data", result);
    }

    let arraySeats = [];
    for (let objSeats of seatsArray) {
      // Check if the seat is already reserved
      let get_all_active_reserve_data = await global
        .knexConnection("ms_reservation")
        .select("r_id")
        .where({
          is_reserved: "Y",
          event_id,
          event_sch_id,
          row_name: objSeats.seatRowName,
          column_name: objSeats.seatColName,
          seat_type: objSeats.seatType,
          seat_group_id: objSeats.seatGroupId,
        });

      if (get_all_active_reserve_data.length) {
        return sendResponse(
          res,
          400,
          "Some of the given seats are already reserved. Please check."
        );
      }

      // Prepare seat data for insertion
      let obj = {
        event_id,
        event_sch_id,
        seat_name: objSeats.seatRowName + objSeats.seatColName,
        seat_type: objSeats.seatType,
        row_name: objSeats.seatRowName,
        column_name: objSeats.seatColName,
        seat_group_id: objSeats.seatGroupId,
      };

      arraySeats.push(obj);
    }

    // Delete existing blocked seats before inserting new ones
    await global
      .knexConnection("event_manual_blocked_seats")
      .where({ event_id, event_sch_id })
      .del();

    // Insert new blocked seats
    await global
      .knexConnection("event_manual_blocked_seats")
      .insert(arraySeats);
    return sendResponse(res, 200, "Seats Blocked/Released Successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while blocking/unblocking seats.",
      error
    );
  }
}

// Function to retrieve blocked seats for an event
export async function getEventBlockedSeats(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { event_id, event_sch_id } = reqbody;

    // Get customer blocked seats
    const getReservationDetail = await global
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
      .where({
        event_id,
        event_sch_id,
        is_reserved: "Y",
      });

    // Get admin manually blocked seats
    const getManualBlockDetail = await global
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
      .where({
        event_sch_id,
        event_id,
      });

    // Combine customer and admin blocked seats
    const objBlocked = {
      customerBlockedSeats: getReservationDetail,
      adminBlockedSeats: getManualBlockDetail,
    };
    return sendResponse(
      res,
      200,
      "Blocked Seats Retrieved Successfully",
      objBlocked
    );
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving blocked seats.",
      error
    );
  }
}

// Function to get contact us list (could be contact form submissions or similar)
export async function getContactUsList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };
    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;

    // Fetch contact us submissions from the database
    const ContactList = await global
      .knexConnection("ms_subscriber")
      .orderBy("subscriber_id", "desc")
      .paginate(pagination(limit, currentPage));
    return sendResponse(res, 200, "Contact Us List Retrieved Successfully", {
      Records: ContactList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving contact us list.",
      error
    );
  }
}

export async function cancelBooking(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };
    const { reservation_id } = reqbody;

    if (!reservation_id) {
      return sendResponse(res, 400, "Missing reservation_id in request", {
        status: false,
      });
    }

    // Check if booking exists
    const checkBooking = await global
      .knexConnection("ms_booking")
      .select("booking_id", "booking_code")
      .where({ reservation_id });

    if (!checkBooking.length) {
      return sendResponse(res, 404, "Booking Not Found!", { status: false });
    }

    const booking_code = checkBooking[0].booking_code;

    // Use transaction to ensure atomicity of updates
    await global.knexConnection.transaction(async (trx) => {
      await trx("ms_booking")
        .where({ reservation_id })
        .update({ booking_is_active: "N" });

      await trx("ms_reservation")
        .where({ reservation_id })
        .update({ is_reserved: "N", is_booked: "N" });
    });

    return sendResponse(
      res,
      200,
      `Booking ID ${booking_code} cancelled. Please release seats from seats.io if applicable!`,
      {
        status: true,
      }
    );
  } catch (error) {
    // Log the error properly if you have a logger
    console.error("Error in cancelBooking:", error);
    return sendResponse(
      res,
      500,
      "An error occurred while cancelling the booking.",
      {
        status: false,
        error: error,
      }
    );
  }
}
