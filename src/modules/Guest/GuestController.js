import { checkValidation } from "../../lib/checkValidation.js";
import { dataReturnUpdate, sendEmailClient } from "../../lib/helper.js";
import { pagination } from "../../lib/pagination.js";
import { v4 as uuidv4 } from "uuid";

import { sendResponse } from "../../lib/responseService.js";

export async function addEditGuest(req, res) {
  let reqbody = req.body;
  const { user_info } = req;
  const {
    guest_first_name,
    guest_last_name,
    guest_email,
    guest_phone_number,
    guest_is_active,
    guest_id,
  } = reqbody;
  let guest_id_new = guest_id || null;
  const isUpdate = guest_id ? true : false;
  let checkFields = ["guest_phone_number", "guest_email"];

  try {
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Guest phone number and email is required");
    }

    let checkUserExist = await global
      .knexConnection("ms_guest_customers")
      .select(["guest_unique_id"])
      .where((builder) => {
        builder.where({ guest_email });
        builder.where({ guest_phone_number });
      });

    let obj = {
      guest_first_name: guest_first_name || null,
      guest_last_name: guest_last_name || null,
      guest_email: guest_email || null,
      guest_phone_number: guest_phone_number || null,
      guest_is_active: guest_is_active || "Y",
      ...dataReturnUpdate(user_info, isUpdate),
    };

    if (checkUserExist.length || guest_id_new) {
      guest_id_new = checkUserExist[0].guest_unique_id;
      await global
        .knexConnection("ms_guest_customers")
        .update(obj)
        .where({ guest_unique_id: guest_id_new });
      obj["guest_id"] = guest_id_new;
      obj["guest_unique_id"] = guest_id_new;
    } else {
      obj["guest_unique_id"] = uuidv4();
      await global.knexConnection("ms_guest_customers").insert(obj);
    }
    return sendResponse(res, 200, "Guest created successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while adding/editing guest",
      error
    );
  }
}

export async function getGuestList(req, res) {
  const reqbody = { ...req.query, ...req.body, ...req.params };
  const guest_id = reqbody.guest_id;
  const limit = req.query.limit ? req.query.limit : 100;
  const currentPage = req.query.currentPage ? req.query.currentPage : 1;

  const isWebsiteUser = req["is_website_user"] || false;

  try {
    if (isWebsiteUser) {
      let result = await checkValidation(["guest_id"], reqbody);
      if (!result.status) {
        return sendResponse(res, 400, "Guest id is required");
      }
    }

    const UserList = await global
      .knexConnection("ms_guest_customers")
      .select([
        "guest_first_name",
        "guest_last_name",
        "guest_phone_number",
        "guest_email",
        "guest_unique_id as guest_id",
        "guest_is_active",
        "guest_id as g_id",
      ])
      .where((builder) => {
        if (guest_id) {
          builder.where("guest_unique_id", "=", guest_id);
        }
        if (req.query.search) {
          builder.whereRaw(
            ` concat_ws(' ',guest_first_name,guest_last_name,guest_email,guest_phone_number) like '%${req.query.search}%'`
          );
        }
      })
      .orderBy("g_id", "desc")
      .paginate(pagination(limit, currentPage));
    return sendResponse(res, 200, "Guest List", {
      Records: UserList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving guest",
      error
    );
  }
}

export async function addSubscriber(req, res) {
  let reqbody = req.body;
  const { subscriber_info } = req;
  const {
    subscriber_email,
    subscriber_name,
    subscriber_subject,
    subscriber_message,
    is_subscriber,
  } = reqbody;

  try {
    let checkFields = ["subscriber_email"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Subscriber email is required");
    }

    let checkSubscriberExist = await global
      .knexConnection("ms_subscriber")
      .select(["subscriber_email"])
      .where((builder) => {
        builder.where({ subscriber_email });
      });

    let obj = {
      subscriber_email: subscriber_email || null,
      subscriber_name: subscriber_name || null,
      subscriber_subject: subscriber_subject || null,
      subscriber_message: subscriber_message || null,
      is_subscriber: is_subscriber || "Y",
      ...dataReturnUpdate(subscriber_info),
    };

    if (checkSubscriberExist.length && is_subscriber == "Y") {
      return sendResponse(res, 400, "Email Already Subscribed");
    } else {
      await global.knexConnection("ms_subscriber").insert(obj);
      if (is_subscriber == "N") {
        let emailHtml = `<html>
        <body>
        <h3>Subject: ${subscriber_subject}</h3>
        <h3>Customer Name: ${subscriber_name}</h3>
        <h3>Customer Email-Id: ${subscriber_email}</h3>
        <p>Message : ${subscriber_message}</p>
        </body>
        </html>`;
        await sendEmailClient(
          null,
          `${process.env.CLIENT_NAME}- Contact Us`,
          emailHtml,
          null
        );
      }
    }
    return sendResponse(
      res,
      200,
      "Response Received. We will get back to you soon!",
      {
        Records: [obj],
      }
    );
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing the subscription.",
      error
    );
  }
}
