import { jwtDecode } from "jwt-decode";
import jwt from "jsonwebtoken";

import { sendResponse } from "../lib/responseService.js";

//website token check

export async function checkWebsiteSessionExist(req, res, next) {
  try {
    const userInfo = await validateWebToken(req, res);

    if (userInfo) {
      req.user_info = userInfo;
      req.logged_in_customer_id = userInfo.customer_id || null;
      req.logged_in_customer_email = userInfo.email || null; // Fixed typo from "emai" to "email"
      req.is_website_user = true;
      req.org_id = null;

      return next();
    } else {
      return sendResponse(res, 403, "You are not authorized");
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred during website token validation",
      error
    );
  }
}

export async function validateWebToken(req, res) {
  try {
    if (!req.headers.authorization) {
      return sendResponse(res, 403, "You are not authorized");
    }

    const { customer_id, email, is_website_user } = jwtDecode(
      req.headers.authorization
    );
    if (customer_id && email && is_website_user) {
      return {
        customer_id: customer_id,
        email: email,
        is_website_user: true,
        org_id: null,
      };
      //} else if (is_website_user) {
    } else {
      return {
        customer_id: null,
        email: null,
        is_website_user: true,
        org_id: null,
      };
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred during website token validation",
      error
    );
  }
}

//Admin Pannel token check
export async function checkSessionExist(req, res, next) {
  const userInfo = await validateToken(req, res);

  if (userInfo) {
    req.user_info = userInfo;
    req.is_website_user = false;
    return next();
  } else {
    return sendResponse(res, 403, "You are not authorized");
  }
}

async function validateToken(req, res) {
  try {
    if (!req.headers.authorization) {
      return sendResponse(res, 403, "You are not authorized");
    }

    const { token, customer_id, email } = jwtDecode(req.headers.authorization);
    if (customer_id && email) {
      return { customer_id: customer_id, email: email, is_website_user: true };
    } else {
      const query = global
        .knexConnection("user_token")
        .select([
          "user_name",
          "first_name",
          "last_name",
          "email",
          "role_name",
          "users.user_id",
          "users.role_id",
          "users.org_id",
          "users.is_super_admin",
        ])
        .leftJoin("users", "user_token.user_id", "users.user_id")
        .leftJoin("ms_roles", "ms_roles.role_id", "users.role_id")
        .where({ multi_token_id: token });

      const userData = await query;

      if (userData.length) {
        return userData[0];
      } else {
        return null;
      }
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred during admin token validation",
      error
    );
  }
}
