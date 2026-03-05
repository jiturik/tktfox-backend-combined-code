import _ from "lodash";
import moment from "moment";

import { checkValidation } from "../../lib/checkValidation.js";
import { currentDateTime, dataReturnUpdate } from "../../lib/helper.js";
import { pagination } from "../../lib/pagination.js";

import {
  getFromRedis,
  removeFromRedis,
  storeInRedis,
} from "../../redis/redisHelper.js";
import { sendResponse } from "../../lib/responseService.js";
import e from "express";

export async function addEditEvent(req, res) {
  try {
    const reqbody = req.body;
    const { user_info } = req;
    const {
      org_id,
      event_cinema_id,
      event_name,
      event_start_date,
      event_end_date,
      event_age_limit,
      event_image_small,
      event_image_medium,
      event_image_large,
      event_short_description,
      event_long_description,
      event_tnc,
      event_seating_type,
      event_booking_active,
      event_is_private,
      event_is_active,
      event_id,
      event_sch_array,
      event_genre_ids,
      event_managers_ids,
      event_language_ids,
      sl_id,
      seatsio_eventkey,
      selectable_max_seats,
      event_prefix_code,
      type,
      event_booking_fees,
      has_shop,
    } = reqbody;

    let cinemaOrgId = org_id || user_info.org_id;
    const isUpdate = event_id;

    const requiredFields = [
      "event_cinema_id",
      "event_name",
      "event_start_date",
      "event_end_date",
      "event_short_description",
      "event_long_description",
      "event_booking_active",
      "event_seating_type",
      "event_is_private",
      "event_is_active",
      "selectable_max_seats",
      "event_prefix_code",
      "type",
      "event_booking_fees",
    ];

    let validation = await checkValidation(requiredFields, reqbody);
    if (!validation.status) {
      return sendResponse(res, 400, "Validation Error", validation);
    }

    // Remove redis cache
    await removeFromRedis("redisCache:activeWebsiteEventList");
    if (isUpdate && event_id) {
      await removeFromRedis(`redisCache:activeWebsiteEventById-${event_id}`);
    }

    // Validate event dates
    if (moment(event_end_date).isBefore(event_start_date)) {
      return sendResponse(
        res,
        400,
        "Event Start Date should be less than Event End Date",
      );
    }

    // Validate event schedule array
    if (event_sch_array && event_sch_array.length) {
      for (let schedule of event_sch_array) {
        const scheduleValidation = await checkValidation(
          ["sch_date", "sch_time", "sch_is_active"],
          schedule,
        );
        if (!scheduleValidation.status) {
          return sendResponse(res, 400, "Validation Error", scheduleValidation);
        }

        // Validate schedule date is between event start and end date
        if (
          !moment(schedule.sch_date).isBetween(
            moment(event_start_date),
            moment(event_end_date),
            undefined,
            "[]",
          )
        ) {
          return sendResponse(
            res,
            400,
            "Schedule Date should be between Event Start Date and End Date",
          );
        }

        // Validate seat type details in schedule
        if (
          schedule.sch_seat_type_array &&
          schedule.sch_seat_type_array.length
        ) {
          for (let seatType of schedule.sch_seat_type_array) {
            const seatValidation = await checkValidation(
              ["sct_id", "available_seats", "price_per_seat"],
              seatType,
            );
            if (!seatValidation.status) {
              return sendResponse(res, 400, "Validation Error", seatValidation);
            }
          }
        }
      }
    }

    // Check if event already exists
    const existingEvent = await global
      .knexConnection("ms_event")
      .select(["event_name"])
      .where({
        event_name,
        event_cinema_id,
      })
      .andWhere((builder) => {
        if (isUpdate) {
          builder.whereNotIn("event_id", [event_id]);
        }
      });

    if (existingEvent.length) {
      return sendResponse(res, 400, "Event Name Already Exists");
    }

    // Prepare the event object for insertion or update
    const eventObj = {
      event_cinema_id: event_cinema_id || null,
      event_name: event_name || null,
      event_start_date: event_start_date || null,
      event_end_date: event_end_date || null,
      event_age_limit: event_age_limit || null,
      event_image_small: event_image_small || null,
      event_image_medium: event_image_medium || null,
      event_image_large: event_image_large || null,
      selectable_max_seats: selectable_max_seats || 1,
      event_short_description: event_short_description || null,
      event_long_description: event_long_description || null,
      event_tnc: event_tnc || null,
      event_seating_type: event_seating_type || "N",
      event_booking_active: event_booking_active || "Y",
      event_is_private: event_is_private || "N",
      event_is_active: event_is_active || "Y",
      sl_id: sl_id || null,
      seatsio_eventkey: null,
      org_id: cinemaOrgId || null,
      event_prefix_code: event_prefix_code || "TKT",
      type: type,
      event_booking_fees: event_booking_fees || 0,
      has_shop: has_shop || "N",
      ...dataReturnUpdate(user_info, isUpdate),
    };

    let insert_event_id;
    if (isUpdate) {
      await global
        .knexConnection("ms_event")
        .update(eventObj)
        .where({ event_id });
      insert_event_id = event_id;
    } else {
      const insertResult = await global
        .knexConnection("ms_event")
        .insert(eventObj);
      insert_event_id = insertResult[0];
    }

    // Insert related event genres, managers, and languages
    if (event_genre_ids && event_genre_ids.length) {
      await global
        .knexConnection("event_genre")
        .where({ event_id: insert_event_id })
        .del();
      const genreInsertArray = event_genre_ids.map((genre_id) => ({
        event_id: insert_event_id,
        genre_id,
      }));
      await global.knexConnection("event_genre").insert(genreInsertArray);
    }

    if (event_managers_ids && event_managers_ids.length) {
      await global
        .knexConnection("event_managers")
        .where({ event_id: insert_event_id })
        .del();
      const managerInsertArray = event_managers_ids.map((user_id) => ({
        event_id: insert_event_id,
        user_id,
      }));
      await global.knexConnection("event_managers").insert(managerInsertArray);
    }

    if (event_language_ids && event_language_ids.length) {
      await global
        .knexConnection("event_language")
        .where({ event_id: insert_event_id })
        .del();
      const languageInsertArray = event_language_ids.map((lang_id) => ({
        event_id: insert_event_id,
        lang_id,
      }));
      await global.knexConnection("event_language").insert(languageInsertArray);
    }

    // Handle event schedule and seating
    if (event_sch_array && event_sch_array.length) {
      for (let schedule of event_sch_array) {
        const scheduleObj = {
          event_id: insert_event_id,
          seatsio_eventkey: schedule.seatsio_eventkey || null,
          sch_date: schedule.sch_date || null,
          sch_time: schedule.sch_time || null,
          sch_max_capacity: schedule.sch_max_capacity || null,
          sch_is_active: schedule.sch_is_active || "Y",
        };

        let schedule_id;
        if (schedule.event_sch_id) {
          schedule_id = schedule.event_sch_id;
          await global
            .knexConnection("event_schedule")
            .update(scheduleObj)
            .where({ event_sch_id: schedule.event_sch_id });
        } else {
          const insertSchedule = await global
            .knexConnection("event_schedule")
            .insert(scheduleObj);
          schedule_id = insertSchedule[0];
        }

        if (
          schedule.sch_seat_type_array &&
          schedule.sch_seat_type_array.length
        ) {
          await global
            .knexConnection("event_sch_seat_type")
            .where({ event_sch_id: schedule_id })
            .del();
          const seatInsertArray = schedule.sch_seat_type_array.map(
            (seatType) => ({
              event_id: insert_event_id,
              event_sch_id: schedule_id,
              sct_id: seatType.sct_id || null,
              available_seats: seatType.available_seats || null,
              price_per_seat: seatType.price_per_seat || 0,
              is_active: seatType.is_active || "Y",
            }),
          );
          await global
            .knexConnection("event_sch_seat_type")
            .insert(seatInsertArray);
        }
      }
    }
    return sendResponse(res, 200, "Event Updated Successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing the event",
      error,
    );
  }
}

export async function getEventList(req, res) {
  try {
    const { query, body, params, user_info } = req;
    const { org_id } = user_info;

    // Merge query, body, and params into the reqbody object
    const reqbody = {
      ...query,
      ...body,
      ...params,
      //org_id,
      isWebsiteUser: req.is_website_user || false,
    };

    //Check if event_id is present in redis cache
    if (req.is_website_user && reqbody.event_id) {
      const redisData = await getFromRedis(
        `redisCache:activeWebsiteEventById-${reqbody.event_id}`,
      );

      if (redisData) {
        return sendResponse(
          res,
          200,
          "Active event list By Id fetched from Redis cache",
          { ...redisData },
        );
      }
    }

    // Fetch event data
    const getEventData = await EVENT_DATA(reqbody);

    if (req.is_website_user && reqbody.event_id) {
      await storeInRedis(
        `redisCache:activeWebsiteEventById-${reqbody.event_id}`,
        getEventData,
        3600,
      );
    }

    return sendResponse(res, 200, "Event list fetched successfully", {
      ...getEventData,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "Unable to fetch event list. Please try again later.",
      error,
    );
  }
}

export async function getActiveEventList(req, res) {
  try {
    const redisData = await getFromRedis("redisCache:activeWebsiteEventList");
    if (redisData) {
      return sendResponse(
        res,
        200,
        "Active event list fetched from Redis cache",
        { data: redisData },
      );
    }
    const reqbody = { ...req.query, ...req.body };
    const data = await getActiveListData(reqbody);

    await storeInRedis("redisCache:activeWebsiteEventList", data, 3600);
    return sendResponse(res, 200, "Active event list fetched successfully", {
      data,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "Unable to fetch active event list. Please try again later.",
      error,
    );
  }
}

export async function addEditEventExtra(req, res) {
  try {
    const reqbody = req.body;
    const { user_info } = req;
    const {
      extra_info_id,
      event_id,
      extra_info_name,
      extra_info_description,
      extra_info_img,
      extra_info_is_active,
      extra_info_type,
    } = reqbody;

    const isUpdate = extra_info_id; // Simplified check for update

    const checkFields = [
      "event_id",
      "extra_info_name",
      "extra_info_img",
      "extra_info_type",
    ];

    // Validate required fields
    const result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    //Remove redis cache
    await removeFromRedis("redisCache:activeWebsiteEventList");
    if (event_id) {
      await removeFromRedis(`redisCache:activeWebsiteEventById-${event_id}`);
    }

    // Construct the object for insert or update
    const obj = {
      event_id,
      extra_info_name: extra_info_name || null,
      extra_info_description: extra_info_description || null,
      extra_info_img: extra_info_img || null,
      extra_info_type: extra_info_type || null,
      extra_info_is_active: extra_info_is_active || null,
    };

    // Perform insert or update based on whether it's an update or not
    if (isUpdate) {
      await global
        .knexConnection("ms_event_extra_info")
        .update(obj)
        .where({ extra_info_id });
    } else {
      await global.knexConnection("ms_event_extra_info").insert(obj);
    }

    return sendResponse(res, 200, "Event Extra Info Updated Successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "Error in addEditEventExtra. Please try again later.",
      error,
    );
  }
}

export async function getEventExtraInfoList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { event_id, extra_info_type, extra_info_is_active, is_website_user } =
      reqbody;

    // Handle pagination parameters
    const limit = req.query.limit || 10;
    const currentPage = req.query.currentPage || 1;

    // Building the query
    const EventExtraInfoList = await global
      .knexConnection("ms_event_extra_info")
      .select("ms_event_extra_info.*")
      .where((builder) => {
        if (event_id) {
          builder.where("event_id", "=", event_id);
        }
        if (extra_info_type) {
          builder.where("extra_info_type", "=", extra_info_type);
        }
        if (extra_info_is_active !== undefined) {
          builder.where(
            "extra_info_is_active",
            "=",
            extra_info_is_active ? "Y" : "N",
          );
        } else {
          builder.where("extra_info_is_active", "=", "Y"); // Default to active if not specified
        }
      })
      .orderBy("extra_info_id", "desc")
      .paginate(pagination(limit, currentPage));

    return sendResponse(res, 200, "Event Extra Info List", {
      Records: EventExtraInfoList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "Error in getEventExtraInfoList. Please try again later.",
      error,
    );
  }
}

//Helper Functions

const getActiveListData = async (reqbody) => {
  try {
    const {
      cinema_id,
      type,
      country_id,
      city_id,
      event_id,
      org_id,
      limit = 100,
      currentPage = 1,
      search,
      isMaster = false,
    } = reqbody;

    let event_is_active = isMaster ? null : "Y";
    const currentDateTimeNew = currentDateTime(null, "YYYY-MM-DD HH:mm");

    // Build the query for event schedule data
    const eventListData = await global
      .knexConnection("event_schedule")
      .select([
        "ms_event.org_id",
        "ms_event.type",
        "ms_event.event_image_small",
        "event_image_medium",
        "event_image_large",
        "event_name",
        "event_short_description",
        "event_schedule.event_id",
        "event_start_date",
        "event_end_date",
        "ms_event.has_shop",
        "ms_cinemas.cinema_name",
        "ms_cities.city_name",
        global.knexConnection.raw(
          `min(event_schedule.sch_date) as eventDatePlaceholder`,
        ),
      ])
      .leftJoin("ms_event", "ms_event.event_id", "event_schedule.event_id")
      .leftJoin(
        "ms_cinemas",
        "ms_cinemas.cinema_id",
        "ms_event.event_cinema_id",
      )
      .leftJoin("ms_cities", "ms_cities.city_id", "ms_cinemas.city_id")
      .leftJoin(
        "ms_countries",
        "ms_countries.country_id",
        "ms_cinemas.country_id",
      )
      .leftJoin(
        "ms_currencies",
        "ms_currencies.curr_id",
        "ms_cinemas.currency_id",
      )
      .leftJoin(
        "ms_time_zones",
        "ms_time_zones.tz_id",
        "ms_cinemas.timezone_id",
      )
      .leftJoin("organizations", "organizations.org_id", "ms_cinemas.org_id")
      .where((builder) => {
        if (cinema_id) builder.where("event_cinema_id", "=", cinema_id);
        if (city_id) builder.where("ms_cinemas.city_id", "=", city_id);
        if (country_id) builder.where("ms_cinemas.country_id", "=", country_id);
        if (org_id) builder.where("ms_cinemas.org_id", "=", org_id);
        if (event_id) builder.where("ms_event.event_id", "=", event_id);
        if (type) builder.where("ms_event.type", "=", type);
        if (search)
          builder.whereRaw(
            `concat_ws(' ', cinema_name, cinema_email) LIKE '%${search}%'`,
          );
      })
      .where({
        event_is_active: "Y",
        sch_is_active: "Y",
        event_is_private: "N",
      })
      .whereRaw(`concat(sch_date, ' ', sch_time) >= '${currentDateTimeNew}'`)
      .groupBy("event_id")
      .paginate(pagination(limit, currentPage));

    // Format the dates and return the result
    const formattedRecords = eventListData.data.map((event) => {
      return {
        ...event,
        event_end_date: currentDateTime(event.event_end_date, "YYYY-MM-DD"),
        eventDatePlaceholder: currentDateTime(
          event.eventDatePlaceholder,
          "YYYY-MM-DD",
        ),
        event_start_date: currentDateTime(event.event_start_date, "YYYY-MM-DD"),
      };
    });

    return formattedRecords;
  } catch (error) {
    return sendResponse(
      res,
      500,
      "Error in getActiveListData. Please try again later.",
      error,
    );
  }
};
export const ExtraDetail = async ({
  isLanguageRequired = true,
  isGenreRequired = true,
  isSchduleArrayRequired = true,
  isManagerRequired = true,
  event_id,
  isDashboard = true,
  isWebsiteUser = false,
  currentDateTimeNew = null,
  event_sch_id = null,
}) => {
  if (!event_id) {
    return {
      event_genre_ids: [],
      event_managers_ids: [],
      event_language_ids: [],
      event_sch_array: [],
    };
  }

  // Helper function to fetch IDs from related tables
  const fetchIds = async (table, column, whereCondition) => {
    const result = await global
      .knexConnection(table)
      .select(column)
      .where(whereCondition);
    return result.map((item) => item[column]);
  };

  // Fetch related data
  const event_language_ids = isLanguageRequired
    ? await fetchIds("event_language", "lang_id", { event_id })
    : [];

  const event_genre_ids = isGenreRequired
    ? await fetchIds("event_genre", "genre_id", { event_id })
    : [];

  const event_managers_ids = isManagerRequired
    ? await fetchIds("event_managers", "user_id", { event_id })
    : [];

  let event_sch_array = [];

  if (isSchduleArrayRequired) {
    const filters = isWebsiteUser
      ? `concat(sch_date,' ',sch_time)>='${currentDateTimeNew}' and sch_is_active='Y'`
      : "";

    const filterActive = isWebsiteUser ? `is_active='Y'` : "";

    const schedule_array = await global
      .knexConnection("event_schedule")
      .select(
        global.knexConnection.raw(
          `event_schedule.*, concat(event_schedule.sch_date,' ',sch_time) as sch_date_time`,
        ),
      )
      .where({ event_id })
      .whereRaw(filters)
      .where((builder) => event_sch_id && builder.where({ event_sch_id }))
      .orderBy("sch_date_time", "ASC");

    // Fetch seat types for each schedule
    event_sch_array = await Promise.all(
      schedule_array.map(async (schedule) => {
        const seatTypes = await global
          .knexConnection("event_sch_seat_type")
          .select("event_sch_seat_type.*", "ms_seat_class_type.seat_class_name")
          .leftJoin(
            "ms_seat_class_type",
            "ms_seat_class_type.sct_id",
            "event_sch_seat_type.sct_id",
          )
          .whereRaw(filterActive)
          .where({ event_sch_id: schedule.event_sch_id });

        return {
          ...schedule,
          sch_seat_type_array: seatTypes,
          sch_date: currentDateTime(schedule.sch_date, "YYYY-MM-DD"), // Assuming `currentDateTime` is a date formatting function
        };
      }),
    );
  }

  return {
    event_managers_ids,
    event_genre_ids,
    event_language_ids,
    event_sch_array,
  };
};

const fetchEventList = async (reqbody, limit, currentPage) => {
  const {
    cinema_id,
    type,
    country_id,
    city_id,
    event_id,
    org_id,
    event_sch_id,
    isWebsiteUser,
    selectedEventType,
  } = reqbody;

  const filters = (builder) => {
    if (cinema_id) builder.where("event_cinema_id", "=", cinema_id);
    if (type) builder.where("ms_event.type", "=", type);
    if (city_id) builder.where("ms_cinemas.city_id", "=", city_id);
    if (country_id) builder.where("ms_cinemas.country_id", "=", country_id);
    if (org_id) builder.where("ms_cinemas.org_id", "=", org_id);
    if (event_id) builder.where("ms_event.event_id", "=", event_id);
    if (isWebsiteUser) builder.where("ms_event.event_is_active", "=", "Y");
    if (selectedEventType)
      builder.where("ms_event.event_is_active", "=", selectedEventType);
    if (reqbody.search) {
      builder.whereRaw(`concat_ws(' ', cinema_name, cinema_email) LIKE ?`, [
        `%${reqbody.search}%`,
      ]);
    }
  };

  return await global
    .knexConnection("ms_event")
    .select([
      "ms_event.*",
      "ms_cities.city_name",
      "ms_countries.country_name",
      "ms_currencies.curr_code",
      "ms_time_zones.tz_name",
      "organizations.org_name",
      "ms_cinemas.country_id",
      "ms_cinemas.cinema_name",
      "ms_cinemas.cinema_email",
      "ms_cinemas.pay_currency_id",
      "ms_cinemas.exchange_rate",
    ])
    .leftJoin("ms_cinemas", "ms_cinemas.cinema_id", "ms_event.event_cinema_id")
    .leftJoin("ms_cities", "ms_cities.city_id", "ms_cinemas.city_id")
    .leftJoin(
      "ms_countries",
      "ms_countries.country_id",
      "ms_cinemas.country_id",
    )
    .leftJoin(
      "ms_currencies",
      "ms_currencies.curr_id",
      "ms_cinemas.currency_id",
    )
    .leftJoin("ms_time_zones", "ms_time_zones.tz_id", "ms_cinemas.timezone_id")
    .leftJoin("organizations", "organizations.org_id", "ms_cinemas.org_id")
    .where(filters)
    .orderBy("event_id", "desc")
    .paginate(pagination(limit, currentPage));
};

const processEventDetails = async (
  EventList,
  event_id,
  isWebsiteUser,
  currentDateTimeNew,
  event_sch_id,
) => {
  let newArray = [];
  let scheduleStart = { days: 0, hours: 0, minute: 0, second: 0 };

  // Process each event asynchronously
  const promises = EventList.data.map(async (obj) => {
    obj.event_end_date = currentDateTime(obj.event_end_date, "YYYY-MM-DD");
    obj.event_start_date = currentDateTime(obj.event_start_date, "YYYY-MM-DD");

    currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      obj.tz_name,
    );

    // Fetch additional details asynchronously
    const extraData = await ExtraDetail({
      event_id,
      isWebsiteUser,
      currentDateTimeNew,
      event_sch_id,
    });

    const eventData = { ...obj, ...extraData };

    if (event_id && extraData.event_sch_array.length) {
      const nextSchedule = extraData.event_sch_array[0];
      scheduleStart.second =
        moment(nextSchedule.sch_date_time).diff(
          moment(currentDateTimeNew),
          "seconds",
        ) % 60;
      scheduleStart.minute =
        moment(nextSchedule.sch_date_time).diff(
          moment(currentDateTimeNew),
          "minute",
        ) % 60;
      scheduleStart.days = moment(nextSchedule.sch_date_time).diff(
        moment(currentDateTimeNew),
        "days",
      );
      scheduleStart.hours =
        moment(nextSchedule.sch_date_time).diff(
          moment(currentDateTimeNew),
          "hour",
        ) % 24;
    }

    return eventData;
  });

  newArray = await Promise.all(promises); // Wait for all event data to be processed

  return { newArray, scheduleStart };
};

const processEventSchedules = (newArray, isWebsiteUser) => {
  if (isWebsiteUser && newArray[0]?.event_sch_array) {
    let array = [];

    newArray[0].event_sch_array.forEach((z) => {
      let findIndex2 = array.findIndex(
        (sch) => sch.schedule_date === z.sch_date,
      );
      if (findIndex2 >= 0) {
        array[findIndex2].schedule_array.push({
          sch_time: z.sch_time,
          event_sch_id: z.event_sch_id,
          sch_date_time: z.sch_date_time,
          seatsio_eventkey: z.seatsio_eventkey,
          sch_date_unix: moment(z.sch_date_time).unix(),
        });
      } else {
        array.push({
          schedule_date: z.sch_date,
          schedule_array: [
            {
              sch_time: z.sch_time,
              event_sch_id: z.event_sch_id,
              sch_date_time: z.sch_date_time,
              sch_date_unix: moment(z.sch_date_time).unix(),
              seatsio_eventkey: z.seatsio_eventkey,
            },
          ],
        });
      }
    });

    array.forEach((data) => {
      data.schedule_array = _.orderBy(
        data.schedule_array,
        ["sch_date_unix"],
        ["ASC"],
      );
    });

    newArray[0].schedule_date_array = array;
  }
};

export const EVENT_DATA = async (reqbody) => {
  const {
    limit = 100,
    currentPage = 1,
    event_id,
    isWebsiteUser,
    event_sch_id,
  } = reqbody;

  const currentDateTimeNew = currentDateTime(null, "YYYY-MM-DD HH:mm:ss", null);

  // Step 1: Fetch event list
  const EventList = await fetchEventList(reqbody, limit, currentPage);

  // Step 2: Process event details (async)
  const { newArray, scheduleStart } = await processEventDetails(
    EventList,
    event_id,
    isWebsiteUser,
    currentDateTimeNew,
    event_sch_id,
  );

  // Step 3: Process event schedules if needed
  processEventSchedules(newArray, reqbody.isWebsiteUser);

  return {
    message: "Event List",
    status: true,
    Records: newArray,
    Pagination: EventList ? EventList.pagination : null,
    scheduleStart,
    currentDateTimeNew,
  };
};
