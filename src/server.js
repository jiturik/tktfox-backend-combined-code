import http from 'http';
import express, { Router } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import helmet from 'helmet';
import { jwtDecode } from 'jwt-decode';
import jwt_token from 'jsonwebtoken';
import winston from 'winston';
import path, { dirname } from 'path';
import fs from 'fs';
import { v4 } from 'uuid';
import bcrypt from 'bcryptjs';
import moment$1 from 'moment';
import nodemailer from 'nodemailer';
import momentTimeZone from 'moment-timezone';
import _ from 'lodash';
import NodeCache from 'node-cache';
import zlib from 'zlib';
import multer from 'multer';
import excel from 'exceljs';
import ejs from 'ejs';
import pdf from 'html-pdf';
import QRCode from 'qrcode';
import { SeatsioClient, Region } from 'seatsio';
import { createHash } from 'crypto';
import axios$1 from 'axios';
import { fileURLToPath } from 'url';
import { attachPaginate } from 'knex-paginate';
import { KnexConnection } from './knex/knex.js';
import Redis from 'ioredis';
import 'knex';
import 'dotenv';

// Ensure the logs directory exists
const logsDir = path.resolve("src/winston-logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Function to get the log file name for the current month
const getLogFileName = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
  return `logs-${year}-${month}.log`;
};

// Create and configure the logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(
      (info) =>
        `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
    )
  ),
  transports: [
    // Log to console
    new winston.transports.Console(),
    // Log to file
    new winston.transports.File({
      filename: path.join(logsDir, getLogFileName()),
      maxsize: 5 * 1024 * 1024, // 5MB max size per file
      maxFiles: 12, // Retain logs for up to 12 months
    }),
  ],
});

// Utility function to log messages
const winstonLogger$1 = {
  info: (message) => logger.info(message),
  error: (message, error) => logger.error(message + ": " + error),
  warn: (message) => logger.warn(message),
  debug: (message) => logger.debug(message),
};

const sendResponse = (
  res,
  statusCode = 200,
  message,
  data = null,
  status = true,
  apiVersion = process.env.API_VERSION || "v1"
) => {
  if (statusCode === 500 && data) {
    let errorMessage = data?.message || data?.error;
    winstonLogger$1.error(`${message}=>`, errorMessage);
  }
  if (
    statusCode === 400 ||
    statusCode === 500 ||
    statusCode === 404 ||
    statusCode === 403 ||
    statusCode === 401
  ) {
    status = false;
  }

  return res.status(statusCode).send({
    message,
    status,
    ...data,
    apiVersion,
  });
};

//website token check

async function checkWebsiteSessionExist(req, res, next) {
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

async function validateWebToken(req, res) {
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
async function checkSessionExist(req, res, next) {
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

const checkValidation = (validateArray, reqObj) => {
  return new Promise((resolve, reject) => {
    try {
      for (const key of validateArray) {
        // Check if key exists in the object
        if (!reqObj.hasOwnProperty(key)) {
          return reject({
            status: false,
            message: `${key} key does not exist`,
          });
        }

        const value = reqObj[key];

        // Skip validation for boolean or number 0
        if (
          typeof value === "boolean" ||
          (typeof value === "number" && value === 0)
        ) {
          continue;
        }

        // Check for invalid or empty values
        if (
          value === "" ||
          value === null ||
          value === undefined ||
          value === "undefined" ||
          value === "null"
        ) {
          return reject({
            status: false,
            message: `${key} cannot be empty, undefined, or null`,
          });
        }
      }

      // If all validations pass
      resolve({ status: true, message: "Validation successful" });
    } catch (error) {
      // Handle unexpected errors
      console.error("Error during validation:", error);
      winstonLogger.error("Error in checkValidation.js 1:", error);
      reject({
        status: false,
        message: "An unexpected error occurred during validation",
      });
    }
  });
};

// Function to create a token for the user
const CREATE_TOKEN_FOR_USER = async ({ user_id, role_id, org_id }) => {
  try {
    const random = v4();

    // Delete existing tokens for the user
    await global.knexConnection("user_token").where({ user_id }).del();

    // Insert new token
    let create_user_token = {
      user_id,
      role_id,
      multi_token_id: random,
      user_token_is_active: "Y",
    };

    await global.knexConnection("user_token").insert(create_user_token);

    // Generate the JWT token
    let token = jwt_token.sign(
      { token: random },
      process.env.JWTSECRET || "welcomeuser"
    );
    return token;
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while generating the user token.",
      error
    );
  }
};

// Function to validate user password
async function validateUserPassword(user_name, password) {
  try {
    const user = await global
      .knexConnection("users")
      .select([
        "user_name",
        "first_name",
        "last_name",
        "email",
        "role_name",
        "role_permission",
        "password",
        "users.user_id",
        "users.role_id",
        "users.org_id",
      ])
      .leftJoin("ms_roles", "ms_roles.role_id", "users.role_id")
      .where((builder) => {
        builder.where({ user_name });
        builder.orWhere({ email: user_name });
      });

    if (user.length) {
      const isPasswordValid = await bcrypt.compare(password, user[0].password);
      return { user: user[0], isPasswordValid };
    } else {
      return { error: "User not found" };
    }
  } catch (error) {
    return sendResponse(res, 500, "An error occurred during login.", error);
  }
}

async function login(req, res) {
  const reqbody = req.body;
  const { user_name, password } = reqbody;

  // Check if required fields are present
  const checkFields = ["user_name", "password"];

  let validationResult = await checkValidation(checkFields, reqbody);

  if (!validationResult.status) {
    return sendResponse(res, 400, "Username and password is required.");
  }

  try {
    const { user, isPasswordValid, error } = await validateUserPassword(
      user_name,
      password
    );

    if (error) {
      return res
        .status(400)
        .json({ status: false, message: "Invalid Credentials" });
    }

    if (isPasswordValid) {
      // Generate a token if password is valid
      const token = await CREATE_TOKEN_FOR_USER({
        user_id: user.user_id,
        role_id: user.role_id,
        org_id: user.org_id,
      });

      delete user.password; // Remove password from response for security
      return sendResponse(res, 200, "Login Successfully", {
        Records: [user],
        access_token: token,
      });
    } else {
      return sendResponse(res, 400, "Password doesn't match.");
    }
  } catch (error) {
    return sendResponse(res, 500, "An error occurred during login.", error);
  }
}

async function checkLogin(req, res) {
  const { user_info } = req;

  try {
    return sendResponse(res, 200, "Login Successfully", {
      Records: [user_info],
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while checking login.",
      error
    );
  }
}

const router$c = Router();

function LoginRoutes() {
  // POST Routes
  router$c.post("/login", login);

  // GET Routes
  router$c.get("/check-login-access", checkSessionExist, checkLogin);

  return router$c;
}

// Function to generate JWT
const generateJWT = (user, isWebsiteUser) => {
  return new Promise((resolve, reject) => {
    const payload = {
      customer_id: user.customer_id,
      email: user.email,
      is_website_user: isWebsiteUser,
    };

    const secret = process.env.JWT_SECRET || "secretevent";
    const expiresIn = process.env.JWT_EXPIRATION || "1d";

    jwt_token.sign(payload, secret, { expiresIn }, (err, token) => {
      if (err) {
        reject(err); // Reject the promise if an error occurs
      } else {
        resolve(token); // Resolve the promise with the generated token
      }
    });
  });
};

// Current DateTime Utility with Error Handling
const currentDateTime = (
  date = null,
  format = "YYYY-MM-DD HH:mm",
  TIME_ZONE_SET = ""
) => {
  try {
    const { TIME_ZONE } = global.globalOptions || {};
    let currentDateTime = moment$1().format(format);
    const TIME_ZON_VALUE = TIME_ZONE_SET || TIME_ZONE;

    if (TIME_ZON_VALUE) {
      currentDateTime = momentTimeZone().tz(TIME_ZON_VALUE).format(format);
    }

    if (date) {
      currentDateTime = moment$1(date).format(format);
    }

    return currentDateTime;
  } catch (error) {
    console.error("Error in currentDateTime:", error);
    winstonLogger$1.error("Error in helper.js 1:", error);
    return null; // Return a fallback or null in case of error
  }
};

// Data Update Utility
const dataReturnUpdate = (userInfo, isUpdate = false) => {
  if (!userInfo || !userInfo.user_id) {
    console.error("Invalid userInfo provided");
    return {};
  }

  const timestamp = currentDateTime();
  return isUpdate
    ? { updated_at: timestamp, updated_by: userInfo.user_id }
    : { created_at: timestamp, created_by: userInfo.user_id };
};

// Payment Credential Function with Error Handling
const PaymentCredentialFunction = async ({ org_id, setting_key }) => {
  try {
    if (!org_id || !setting_key) {
      return { status: false, data: {}, message: "Invalid input parameters" };
    }

    const getPaymentCredential = await global
      .knexConnection("organization_setting")
      .where({ org_id, setting_key, setting_is_active: "Y" });

    if (getPaymentCredential.length && getPaymentCredential[0].setting_data) {
      return {
        status: true,
        data: JSON.parse(getPaymentCredential[0].setting_data),
      };
    }

    return { status: false, data: {}, message: "No active credentials found" };
  } catch (error) {
    console.error("Error in PaymentCredentialFunction:", error);
    winstonLogger$1.error("Error in helper.js 2:", error);
    return { status: false, data: {}, message: "An error occurred" };
  }
};

// Seats.IO Credential Function with Error Handling
const SeatsIoCredentialFunction = async ({ org_id, setting_key }) => {
  try {
    if (!org_id || !setting_key) {
      return { status: false, data: {}, message: "Invalid input parameters" };
    }

    const getSeatIoCredential = await global
      .knexConnection("organization_setting")
      .where({ org_id, setting_key, setting_is_active: "Y" });

    if (getSeatIoCredential.length && getSeatIoCredential[0].setting_data) {
      return {
        status: true,
        data: JSON.parse(getSeatIoCredential[0].setting_data),
      };
    }

    return { status: false, data: {}, message: "No active credentials found" };
  } catch (error) {
    console.error("Error in SeatsIoCredentialFunction:", error);
    winstonLogger$1.error("Error in helper.js 3:", error);
    return { status: false, data: {}, message: "An error occurred" };
  }
};

// Nodemailer Transport Setup
const mail = nodemailer.createTransport({
  host: process.env.SENDINBLUE_HOST,
  port: process.env.SENDINBLUE_PORT,
  secure: false, // Use true for 465, false for other ports
  auth: {
    user: process.env.SENDINBLUE_USER,
    pass: process.env.SENDINBLUE_PASSWORD,
  },
});

// Email Sending Function with Error Handling
function sendEmail(to, subject, body, attachment) {
  return new Promise((resolve, reject) => {
    try {
      const mailOptions = {
        from: `${process.env.TICKET_EMAIL_FROM}`,
        to,
        subject,
        html: body,
      };

      if (attachment) {
        mailOptions.attachments = attachment;
      }

      mail.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Error in sendEmail:", error);
          return reject({ status: false, message: "Email not sent" });
        }

        console.log(`Email Sent: ${info.response}`);
        resolve({ status: true, message: "Email sent successfully" });
      });
    } catch (error) {
      console.error("Unexpected error in sendEmail:", error);
      winstonLogger$1.error("Error in helper.js 4:", error);
      reject({ status: false, message: "Unexpected error occurred" });
    }
  });
}

// Email Client Sending Function with Error Handling
function sendEmailClient(from, subject, body, attachment) {
  try {
    const mailOptions = {
      from: `${process.env.CONTACT_US_EMAIL_FROM}`,
      to: `${process.env.CONTACT_US_EMAIL_TO}`,
      subject,
      html: body,
    };

    if (attachment) ;

    mail.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error in sendEmailClient:", error);
      } else {
        console.log(`Email Sent: ${JSON.stringify(info)}`);
      }
    });
  } catch (error) {
    winstonLogger$1.error("Error in helper.js 5:", error);
    console.error("Unexpected error in sendEmailClient:", error);
  }
}

async function pagination(perPage, currentPage) {
  try {
    // Default pagination settings
    const paginate = {
      perPage: 100, // Default items per page
      currentPage: 1, // Default current page
      search: null,
      sort: null,
    };

    // Validate and parse currentPage
    if (currentPage) {
      const parsedCurrentPage = parseInt(currentPage, 10);
      if (isNaN(parsedCurrentPage) || parsedCurrentPage <= 0) {
        throw new Error(
          "Invalid value for currentPage. It must be a positive integer."
        );
      }
      paginate.currentPage = parsedCurrentPage;
    }

    // Validate and parse perPage
    if (perPage) {
      const parsedPerPage = parseInt(perPage, 10);
      if (isNaN(parsedPerPage) || parsedPerPage <= 0) {
        throw new Error(
          "Invalid value for perPage. It must be a positive integer."
        );
      }
      paginate.perPage = parsedPerPage;
    }

    return paginate;
  } catch (error) {
    winstonLogger$1.error("Error in pagination.js 1:", error);
    console.error("Error in pagination function:", error.message);
    return {
      error: true,
      message: error.message,
    };
  }
}

//keys Used in project
//redisCache:activeWebsiteEventList
//redisCache:activeWebsiteEventList
//redisCache:activeWebsiteBannerList
const getFromRedis = async (cacheKey) => {
  try {
    let redisOrgKey = process.env.REDIS_CLIENT_NAME;
    if (!redisOrgKey) {
      console.log("Redis client name is not set.");
      return;
    }
    let cacheKeyNew = `${redisOrgKey}:${cacheKey}`;
    // Fetch the data from Redis
    const cachedData = await global.redisCache.get(cacheKeyNew);

    if (cachedData) {
      return JSON.parse(cachedData);
    }
    return null;
  } catch (error) {
    winstonLogger$1.error("Error in redisHelper.js 1:", error);
    console.error("Error fetching data from Redis:", error);
    return null;
  }
};
const storeInRedis = async (key, value, expiration) => {
  try {
    let redisOrgKey = process.env.REDIS_CLIENT_NAME;
    if (!redisOrgKey) {
      console.log("Redis client name is not set.");
      return;
    }
    let cacheKeyNew = `${redisOrgKey}:${key}`;

    const stringValue = JSON.stringify(value);
    if (expiration) {
      await global.redisCache.set(cacheKeyNew, stringValue, "EX", expiration);
    } else {
      await global.redisCache.set(cacheKeyNew, stringValue);
    }
    console.log(`Data stored in Redis: ${cacheKeyNew}`);
  } catch (err) {
    winstonLogger$1.error("Error in redisHelper.js 2:", err);
    console.error("Error storing data in Redis:", err);
  }
};

const removeFromRedis = async (key) => {
  try {
    let redisOrgKey = process.env.REDIS_CLIENT_NAME;
    if (!redisOrgKey) {
      console.log("Redis client name is not set.");
      return;
    }
    let cacheKeyNew = `${redisOrgKey}:${key}`;
    const result = await global.redisCache.del(cacheKeyNew);
    if (result === 1) {
      console.log(`Data removed from Redis: ${cacheKeyNew}`);
    } else {
      console.log(`Key not found in Redis: ${cacheKeyNew}`);
    }
  } catch (err) {
    winstonLogger$1.error("Error in redisHelper.js 3:", err);
    console.error("Error removing data from Redis:", err);
    throw err;
  }
};

// Add or edit cinema information
async function addEditCinema(req, res) {
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
async function getCinemaList(req, res) {
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

  let cinema_is_active =
    reqbody.isMaster && reqbody.isMaster === "Y" ? null : "Y";

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

const router$b = Router();

function CinemaRoutes() {
  // POST Routes
  router$b.post("/add-edit-cinema", checkSessionExist, addEditCinema);

  // GET Routes
  router$b.get("/getcinemalist", checkSessionExist, getCinemaList);

  return router$b;
}

// Add  Customer
async function addWebCustomer(req, res) {
  let reqbody = req.body;
  const isWebsiteUser = req["is_website_user"] || false;
  if (!isWebsiteUser) {
    return sendResponse(res, 400, "User is not website user.");
  }
  const {
    first_name,
    last_name,
    email,
    phone_number,
    phone_county_code,
    password,
  } = reqbody;

  let checkFields = [
    "first_name",
    "last_name",
    "phone_number",
    "email",
    "password",
  ];

  try {
    // Validate request fields
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Invalid Request Data", result);
    }

    // Check if email or phone already exists
    let checkUserExist = await global
      .knexConnection("ms_customers")
      .select(["email", "is_verified"])
      .where((builder) => {
        builder.where({ email });
      })
      .where({ customer_is_active: "Y" });

    if (checkUserExist.length && checkUserExist[0].is_verified == "Y") {
      return sendResponse(res, 400, "Email already exists.");
    }

    // Prepare customer data object
    let obj = {
      first_name: first_name || null,
      last_name: last_name || null,
      email: email || null,
      phone_number: phone_number || null,
      phone_county_code: phone_county_code || null,
      customer_is_active: "Y",
    };

    // Handle customer  create

    // Create new customer
    obj["email_otp"] = Math.floor(1000 + Math.random() * 9000);
    obj["is_verified"] = "N";
    obj["password"] = bcrypt.hashSync(password, 10);
    obj["customer_unique_id"] = v4();
    if (!checkUserExist.length) {
      await global.knexConnection("ms_customers").insert(obj);
    } else {
      await global
        .knexConnection("ms_customers")
        .update({ email_otp: obj.email_otp })
        .where({ email });
    }

    // Send OTP email
    let emailHtml = `<html><body><p>OTP for signup ${obj["email_otp"]}</p></body></html>`;
    await sendEmail(email, "Signup", emailHtml, null);

    // Remove OTP from the object after email is sent
    delete obj["email_otp"];

    // Send success response
    return sendResponse(res, 200, "Account Created Successfully.", {
      show_otp_screen: true,
      Records: [obj],
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while adding customer.",
      error
    );
  }
}
//verify Customer OTP

async function verifyOTPAndUpdateUser(req, res) {
  const { otp, email } = req.body;

  // Ensure OTP is provided in the request body
  if (!otp || !email) {
    return res
      .status(400)
      .send({ status: false, message: "OTP and email is required." });
  }

  const isWebsiteUser = req["is_website_user"] || false;
  if (!isWebsiteUser) {
    return res
      .status(400)
      .send({ status: false, message: "User is not website user." }); // Return validation errors
  }

  try {
    // Check if user exists and matches the email (optional for extra verification)
    let checkUser = await global
      .knexConnection("ms_customers")
      .select([
        "first_name",
        "last_name",
        "phone_number",
        "phone_county_code",
        "password",
        "email",
        "customer_unique_id",
        "customer_is_active",
        "customer_id",
        "email_otp",
      ])
      .where({ email });

    if (!checkUser.length || checkUser[0].email != email) {
      return res
        .status(404)
        .send({ status: false, message: "User not found." });
    }

    // Verify the OTP matches the one sent (assuming it's stored in the user object or database)
    console.log(checkUser);
    if (checkUser[0].email_otp != otp) {
      return sendResponse(res, 400, "Invalid OTP.");
    }

    // Update user status or verification status
    const updatedUser = await global
      .knexConnection("ms_customers")
      .update({ is_verified: "Y", email_otp: null })
      .where({ email });

    // Attempt to generate the JWT token
    const token = await generateJWT(checkUser[0], true);

    // This will only run if generateJWT succeeds
    console.log("Generated Token:", token);
    return sendResponse(
      res,
      200,
      "OTP verified and user logged in successful.",
      {
        login_token: token,
        Records: checkUser,
      }
    );
  } catch (err) {
    return sendResponse(
      res,
      500,
      "An error occurred while verifying OTP.",
      err
    );
  }
}

// customer sign in
async function customerSignIn(req, res) {
  let reqbody = req.body;
  const { user_name, password } = reqbody;
  let checkFields = ["user_name", "password"];

  try {
    // Validate fields
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Username and password is required.");
    }

    // Check if user exists
    let checkUserExist = await global
      .knexConnection("ms_customers")
      .select([
        "first_name",
        "last_name",
        "phone_number",
        "phone_county_code",
        "password",
        "email",
        "customer_unique_id",
        "customer_is_active",
        "customer_id",
      ])
      .where({ email: user_name, is_verified: "Y" });

    if (checkUserExist.length) {
      bcrypt.compare(
        password,
        checkUserExist[0].password,
        async function (err, result) {
          if (result) {
            if (checkUserExist[0].customer_is_active != "Y") {
              return sendResponse(res, 403, "Account is inactive.");
            }

            // Generate JWT token
            const customerToken = await generateJWT(checkUserExist[0], true);
            return sendResponse(res, 200, "Signin Successfully", {
              customerToken, // Return the token
              Records: checkUserExist,
            });
          } else {
            return sendResponse(res, 400, "Invalid Password.");
          }
        }
      );
    } else {
      return sendResponse(res, 404, "Invalid Credential.");
    }
  } catch (error) {
    return sendResponse(res, 500, "An error occurred during sign-in.", error);
  }
}

// Get Customer List
async function getCustomer(req, res) {
  const logged_in_customer_id = req["logged_in_customer_id"] || null;

  try {
    if (!logged_in_customer_id) {
      return sendResponse(res, 403, "You are not authorized.");
    }

    const getCustomer = await global
      .knexConnection("ms_customers")
      .select([
        "first_name",
        "last_name",
        "phone_number",
        "phone_county_code",
        "email",
        "customer_unique_id",
        "customer_is_active",
        "customer_id",
      ])
      .where({
        customer_id: logged_in_customer_id,
        is_verified: "Y",
        customer_is_active: "Y",
      });

    if (!getCustomer.length) {
      return sendResponse(res, 400, "Customer not found.");
    }
    return sendResponse(res, 200, "Customer details.", {
      Records: getCustomer[0],
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving the customer details.",
      error
    );
  }
}

const router$a = Router();

function CustomerRoutes() {
  // POST Routes
  router$a.post("/add-edit-customer", checkSessionExist, addWebCustomer);

  // GET Routes
  router$a.get("/getcustomerlist", checkSessionExist, getCustomer);

  return router$a;
}

async function addEditEvent(req, res) {
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
      event_booking_fees,
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
    if (moment$1(event_end_date).isBefore(event_start_date)) {
      return sendResponse(
        res,
        400,
        "Event Start Date should be less than Event End Date"
      );
    }

    // Validate event schedule array
    if (event_sch_array && event_sch_array.length) {
      for (let schedule of event_sch_array) {
        const scheduleValidation = await checkValidation(
          ["sch_date", "sch_time", "sch_is_active"],
          schedule
        );
        if (!scheduleValidation.status) {
          return sendResponse(res, 400, "Validation Error", scheduleValidation);
        }

        // Validate schedule date is between event start and end date
        if (
          !moment$1(schedule.sch_date).isBetween(
            moment$1(event_start_date),
            moment$1(event_end_date),
            undefined,
            "[]"
          )
        ) {
          return sendResponse(
            res,
            400,
            "Schedule Date should be between Event Start Date and End Date"
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
              seatType
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
              price_per_seat: seatType.price_per_seat || null,
            })
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
      error
    );
  }
}

async function getEventList(req, res) {
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
        `redisCache:activeWebsiteEventById-${reqbody.event_id}`
      );

      if (redisData) {
        return sendResponse(
          res,
          200,
          "Active event list By Id fetched from Redis cache",
          { ...redisData }
        );
      }
    }

    // Fetch event data
    const getEventData = await EVENT_DATA(reqbody);

    if (req.is_website_user && reqbody.event_id) {
      await storeInRedis(
        `redisCache:activeWebsiteEventById-${reqbody.event_id}`,
        getEventData,
        3600
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
      error
    );
  }
}

async function getActiveEventList(req, res) {
  try {
    const redisData = await getFromRedis("redisCache:activeWebsiteEventList");
    if (redisData) {
      return sendResponse(
        res,
        200,
        "Active event list fetched from Redis cache",
        { data: redisData }
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
      error
    );
  }
}

async function addEditEventExtra(req, res) {
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
      error
    );
  }
}

async function getEventExtraInfoList(req, res) {
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
            extra_info_is_active ? "Y" : "N"
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
      error
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
        "ms_cinemas.cinema_name",
        "ms_cities.city_name",
        global.knexConnection.raw(
          `min(event_schedule.sch_date) as eventDatePlaceholder`
        ),
      ])
      .leftJoin("ms_event", "ms_event.event_id", "event_schedule.event_id")
      .leftJoin(
        "ms_cinemas",
        "ms_cinemas.cinema_id",
        "ms_event.event_cinema_id"
      )
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
        if (cinema_id) builder.where("event_cinema_id", "=", cinema_id);
        if (city_id) builder.where("ms_cinemas.city_id", "=", city_id);
        if (country_id) builder.where("ms_cinemas.country_id", "=", country_id);
        if (org_id) builder.where("ms_cinemas.org_id", "=", org_id);
        if (event_id) builder.where("ms_event.event_id", "=", event_id);
        if (type) builder.where("ms_event.type", "=", type);
        if (search)
          builder.whereRaw(
            `concat_ws(' ', cinema_name, cinema_email) LIKE '%${search}%'`
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
          "YYYY-MM-DD"
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
      error
    );
  }
};
const ExtraDetail = async ({
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

    const schedule_array = await global
      .knexConnection("event_schedule")
      .select(
        global.knexConnection.raw(
          `event_schedule.*, concat(event_schedule.sch_date,' ',sch_time) as sch_date_time`
        )
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
            "event_sch_seat_type.sct_id"
          )
          .where({ event_sch_id: schedule.event_sch_id });

        return {
          ...schedule,
          sch_seat_type_array: seatTypes,
          sch_date: currentDateTime(schedule.sch_date, "YYYY-MM-DD"), // Assuming `currentDateTime` is a date formatting function
        };
      })
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
      "ms_cinemas.country_id"
    )
    .leftJoin(
      "ms_currencies",
      "ms_currencies.curr_id",
      "ms_cinemas.currency_id"
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
  event_sch_id
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
      obj.tz_name
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
        moment$1(nextSchedule.sch_date_time).diff(
          moment$1(currentDateTimeNew),
          "seconds"
        ) % 60;
      scheduleStart.minute =
        moment$1(nextSchedule.sch_date_time).diff(
          moment$1(currentDateTimeNew),
          "minute"
        ) % 60;
      scheduleStart.days = moment$1(nextSchedule.sch_date_time).diff(
        moment$1(currentDateTimeNew),
        "days"
      );
      scheduleStart.hours =
        moment$1(nextSchedule.sch_date_time).diff(
          moment$1(currentDateTimeNew),
          "hour"
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
        (sch) => sch.schedule_date === z.sch_date
      );
      if (findIndex2 >= 0) {
        array[findIndex2].schedule_array.push({
          sch_time: z.sch_time,
          event_sch_id: z.event_sch_id,
          sch_date_time: z.sch_date_time,
          seatsio_eventkey: z.seatsio_eventkey,
          sch_date_unix: moment$1(z.sch_date_time).unix(),
        });
      } else {
        array.push({
          schedule_date: z.sch_date,
          schedule_array: [
            {
              sch_time: z.sch_time,
              event_sch_id: z.event_sch_id,
              sch_date_time: z.sch_date_time,
              sch_date_unix: moment$1(z.sch_date_time).unix(),
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
        ["ASC"]
      );
    });

    newArray[0].schedule_date_array = array;
  }
};

const EVENT_DATA = async (reqbody) => {
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
    event_sch_id
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

const router$9 = Router();

function EventRoutes() {
  // POST Routes
  router$9.post("/add-edit-event", checkSessionExist, addEditEvent);
  router$9.post("/add-edit-eventExtra", checkSessionExist, addEditEventExtra);

  // GET Routes
  router$9.get("/getEventList", checkSessionExist, getEventList);
  router$9.get(
    "/get-event-extraInfoList",
    checkSessionExist,
    getEventExtraInfoList
  );

  return router$9;
}

async function getTransactionByCodeScanner(req, res) {
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

async function getScannedTicketById(req, res) {
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

async function getScannedTicketList(req, res) {
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

async function addEditScanTicket(req, res) {
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

const router$8 = Router();

function ScannerRoutes() {
  // GET Routes
  router$8.get(
    "/getTransactionByCode/:booking_code",
    checkSessionExist,
    getTransactionByCodeScanner
  );
  router$8.get(
    "/getScannedTicketById/:booking_id",
    checkSessionExist,
    getScannedTicketById
  );
  router$8.get("/getScannedTicketList", checkSessionExist, getScannedTicketList);

  // POST Routes
  router$8.post(
    "/add-edit-scanTicket/:booking_id",
    checkSessionExist,
    addEditScanTicket
  );

  return router$8;
}

async function addEditGuest(req, res) {
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
      obj["guest_unique_id"] = v4();
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

async function getGuestList(req, res) {
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

async function addSubscriber(req, res) {
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

const router$7 = Router();

function GuestRoutes() {
  // POST Routes
  router$7.post("/add-edit-guest", checkSessionExist, addEditGuest);

  // GET Routes
  router$7.get("/getGuestList", checkSessionExist, getGuestList);

  return router$7;
}

const eventCache = new NodeCache();

async function addEditCountries(req, res) {
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

async function getCountryList(req, res) {
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

async function addEditCities(req, res) {
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

async function getCityList(req, res) {
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

async function addEditLanguages(req, res) {
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

async function getLanguageList(req, res) {
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

async function addEditGenre(req, res) {
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

async function getGenreList(req, res) {
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

async function addEditSeatType(req, res) {
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

async function getSeatTypeList(req, res) {
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

async function addEditCurrency(req, res) {
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

async function getCurrencyList(req, res) {
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

async function addEditBanner(req, res) {
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

async function getBannerList(req, res) {
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

async function addEditSeatLayout(req, res) {
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

async function getSeatLayoutList(req, res) {
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

async function getTimeZoneList(req, res) {
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

async function addEditOrgWebsite(req, res) {
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

async function addEditRoles(req, res) {
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

async function getRolesList(req, res) {
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

async function getOrgList(req, res) {
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

async function addEditOrg(req, res) {
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

async function addEditVouchers(req, res) {
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
async function getVoucherList(req, res) {
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
async function addEditBlockedSeats(req, res) {
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
async function getEventBlockedSeats(req, res) {
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
async function getContactUsList(req, res) {
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

// import AWS from "aws-sdk";
// import s3 from "@auth0/s3";

// Define storage configuration with error handling for directory creation
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.normalize(global.__base + "/public/uploads");
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (error) {
      console.error("Error creating upload directory:", error);
      winstonLogger$1.error("Error in multerHelper.js 1:", error);
      cb(new Error("Failed to create upload directory"), null);
    }
  },
});

// Utility for file type validation
const validateFileType = (file, allowedExtensions, callback) => {
  try {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext) && !file.mimetype.includes("image")) {
      return callback(
        `Only the following file types are allowed: ${allowedExtensions.join(
          ", "
        )}`
      );
    }
    callback(null, true);
  } catch (error) {
    console.error("Error validating file type:", error);
    winstonLogger$1.error("Error in multerHelper.js 2:", error);
    callback("Error validating file type");
  }
};

// Single file upload with error handling for XLS/XLSX files
multer({
  storage,
  fileFilter: (req, file, callback) => {
    validateFileType(file, [".xls", ".xlsx"], callback);
  },
}).single("file");

// Single image upload with error handling
const uploadImage = multer({
  storage,
  fileFilter: (req, file, callback) => {
    validateFileType(file, [".png", ".jpg", ".jpeg", ".gif", ".svg"], callback);
  },
}).single("image");

// Upload file to AWS S3 with robust error handling
// export const uploadToS3 = (dirPath, originalFileName, callback) => {
//   try {
//     const folder = path.normalize(`${global.__base}/public${dirPath}`);
//     const sanitizedFileName = originalFileName.replace(/[/\\?%*:|"<>]/g, "-");
//     const finalUploadPath = `S3${dirPath}${sanitizedFileName}`;

//     const params = {
//       localFile: path.join(folder, originalFileName),
//       s3Params: {
//         Bucket: global.config.configuration.awsConfig.bucketName,
//         Key: finalUploadPath,
//       },
//     };

//     const awsS3Client = new AWS.S3(global.config.configuration.awsConfig);
//     const client = s3.createClient({
//       s3Client: awsS3Client,
//       maxAsyncS3: 20,
//       s3RetryCount: 3,
//       s3RetryDelay: 1000,
//       multipartUploadThreshold: 20971520, // 20 MB
//       multipartUploadSize: 15728640, // 15 MB
//     });

//     const uploader = client.uploadFile(params);

//     uploader.on("progress", () => {
//       console.log("Upload in progress...");
//     });

//     uploader.on("error", (error) => {
//       console.error("Error during S3 upload:", error.stack);
//       callback(new Error("Failed to upload file to S3"), null);
//     });

//     uploader.on("end", () => {
//       console.log("File successfully uploaded to S3:", finalUploadPath);
//       callback(null, finalUploadPath);
//     });
//   } catch (error) {
//     console.error("Unexpected error in uploadToS3:", error);
//     callback(new Error("Unexpected error during upload"), null);
//   }
// };

async function uploadImageController(req, res) {
  try {
    const { BASE_URL_BACKEND, S3_UPLOAD } = global.globalOptions;
    const imageBaseURL = BASE_URL_BACKEND;
    let SetPath = "/uploads/";

    // Handle image upload
    uploadImage(req, res, (uploadImageError) => {
      if (uploadImageError) {
        return sendResponse(res, 400, "Error uploading image");
      }

      if (!req.file || !req.file.originalname) {
        return sendResponse(res, 400, "Please select a file");
      }

      // Sanitize image file name
      const a = req.file.originalname;
      const imageExtension = a.split(/[. ]+/).pop();
      const withoutExtensionName = a.split(".").slice(0, -1).join(".");
      const sanitizedFileName =
        withoutExtensionName
          .toLowerCase()
          .split(" ")
          .join("_")
          .replace(/[^a-z0-9_]/gi, "") + `.${imageExtension}`;

      req.file.originalname = sanitizedFileName;

      const targetDirectory = path.normalize(
        `${global.__base}/public${SetPath}`
      );

      // Ensure target folder exists
      if (!fs.existsSync(targetDirectory)) {
        fs.mkdirSync(targetDirectory, { recursive: true });
      }

      const existingFile = `${global.__base}/public/uploads/${req.file.filename}`;
      const newFileName = `${Date.now()}-${sanitizedFileName}`;
      const storInto = `${SetPath}${newFileName}`;

      // Rename the file and move it
      fs.rename(
        existingFile,
        path.normalize(`${global.__base}/public${storInto}`),
        (error) => {
          if (error) {
            return sendResponse(res, 500, "Image uploading failed");
          }

          // If S3 upload is enabled, upload to S3
          if (S3_UPLOAD === "Y") {
            uploadToS3(SetPath, newFileName, (s3error, result) => {
              if (s3error) {
                return sendResponse(res, 500, "Error uploading image to S3");
              }

              // Clean up local file after successful upload to S3
              fs.unlink(`${global.__base}/public${storInto}`, (unlinkError) => {
                if (unlinkError) {
                  console.error(
                    "Error deleting local file after S3 upload",
                    unlinkError
                  );
                }
              });
              return sendResponse(
                res,
                200,
                "Image uploaded successfully to S3",
                {
                  path: result,
                }
              );
            });
          } else {
            return sendResponse(
              res,
              200,
              "Image uploaded successfully to server",
              {
                path: storInto,
                fullpath: imageBaseURL + storInto,
              }
            );
          }
        }
      );
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "Unexpected error occurred during image upload",
      error
    );
  }
}

const router$6 = Router();

function MasterRoutes() {
  // POST Routes
  router$6.post("/add-edit-countries", checkSessionExist, addEditCountries);
  router$6.post("/add-edit-cities", checkSessionExist, addEditCities);
  router$6.post("/add-edit-languages", checkSessionExist, addEditLanguages);
  router$6.post("/add-edit-genres", checkSessionExist, addEditGenre);
  router$6.post("/add-edit-seattype", checkSessionExist, addEditSeatType);
  router$6.post("/add-edit-currency", checkSessionExist, addEditCurrency);
  router$6.post("/add-edit-banner", checkSessionExist, addEditBanner);
  router$6.post("/add-edit-seatlayout", addEditSeatLayout);
  router$6.post("/add-edit-roles", checkSessionExist, addEditRoles);
  router$6.post("/add-edit-org", checkSessionExist, addEditOrg);
  router$6.post("/add-edit-vouchers", checkSessionExist, addEditVouchers);
  router$6.post("/add-edit-orgwebsite", checkSessionExist, addEditOrgWebsite);
  router$6.post("/add-edit-blockseats", checkSessionExist, addEditBlockedSeats);
  router$6.route("/uploadimage").post(uploadImageController);

  // GET Routes
  router$6.get("/getcountrylist", checkSessionExist, getCountryList);
  router$6.get("/getcitylist", checkSessionExist, getCityList);
  router$6.get("/getlanguageslist", checkSessionExist, getLanguageList);
  router$6.get("/getgenreslist", checkSessionExist, getGenreList);
  router$6.get("/getseattypelist", getSeatTypeList);
  router$6.get("/getcurrencylist", checkSessionExist, getCurrencyList);
  router$6.get("/getbannerlist", checkSessionExist, getBannerList);
  router$6.get("/getSeatLayoutList", getSeatLayoutList);
  router$6.get("/gettimezonelist", checkSessionExist, getTimeZoneList);
  router$6.get("/getroleslist", checkSessionExist, getRolesList);
  router$6.get("/getOrgList", checkSessionExist, getOrgList);
  router$6.get("/getVoucherList", checkSessionExist, getVoucherList);
  router$6.get("/getContactUsList", checkSessionExist, getContactUsList);
  router$6.get(
    "/getEventBlockedSeats/:event_id/:event_sch_id",
    checkSessionExist,
    getEventBlockedSeats
  );

  return router$6;
}

async function addEditPass(req, res) {
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
    if (moment$1(pass_validity_to).isBefore(pass_validity_from)) {
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

async function getPassList(req, res) {
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

async function addEditPassDiscount(req, res) {
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

async function getPassDiscountList(req, res) {
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

const router$5 = Router();

function PassRoutes() {
  // POST Routes
  router$5.post("/add-edit-pass", checkSessionExist, addEditPass);
  router$5.post(
    "/add-edit-pass-discount",
    checkSessionExist,
    addEditPassDiscount
  );

  // GET Routes
  router$5.get("/getPassList", checkSessionExist, getPassList);
  router$5.get("/getPassDiscountList", checkSessionExist, getPassDiscountList);

  return router$5;
}

var opts = {
  errorCorrectionLevel: "H",
  type: "image/jpeg",
  quality: 0.3,
  margin: 1,
  width: "100",
  color: {
    dark: "#000000",
    light: "#FFFFFF",
  },
};

async function createQRCode(
  qrcode_data,
  returnType = "buffer",
  logo = null
) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!qrcode_data) {
        console.error("QR code data is required.");
        return;
      }

      await QRCode.toDataURL(qrcode_data, opts)
        .then((qrcode) => {
          resolve(qrcode);
        })
        .catch((error) => {
          winstonLogger$1.error("Error in QrcodeGenerator.js 1:", error);
          console.error("Error creating QR code:", error.message);
          reject(
            new Error(
              "Failed to create QR code. Please check your input and try again."
            )
          );
        });
    } catch (error) {
      winstonLogger$1.error("Error in QrcodeGenerator.js 2:", error);
      console.error("Error creating QR code:", error.message);
      reject(
        new Error(
          "Failed to create QR code. Please check your input and try again."
        )
      );
    }
  });
}

const CreateInvSendTicketEmail = async (reqbody) => {
  const BOOKINGID = reqbody?.booking_id || null;
  const resendCustomerEmail = reqbody?.resend_customer_email || null;

  try {
    // Fetch booking data
    const bookingList = await global
      .knexConnection("ms_booking")
      .select(
        "ms_booking.*",
        "ms_event.event_tnc",
        "ms_event.event_seating_type",
        "ms_payment_booking_detail.success_frontend_url"
      )
      .join("ms_event", "ms_event.event_id", "ms_booking.event_id")
      .join(
        "ms_payment_booking_detail",
        "ms_payment_booking_detail.reservation_id",
        "ms_booking.reservation_id"
      )
      .where((builder) => {
        if (BOOKINGID) {
          builder.where("ms_booking.booking_id", BOOKINGID);
        } else {
          builder.where("ms_booking.ticket_sent", "N");
        }
      })
      .orderBy("booking_id", "asc")
      .limit(5);

    if (!bookingList.length) {
      console.log("No invoices or tickets to be sent.");
      return;
    }

    for (const booking of bookingList) {
      try {
        await global
          .knexConnection("ms_booking")
          .where({ booking_id: booking.booking_id })
          .update({ ticket_sent: "Y" });

        // Generate QR code
        const qrUrl = `${booking.success_frontend_url}/${booking.booking_code}`;
        let qrImage = "";
        const qrcodeData = await createQRCode(qrUrl, "buffer")
          .then((qrcode) => {
            qrImage = qrcode;
            console.log("QR Code generated:", booking.booking_code);
          })
          .catch((error) => {
            winstonLogger$1.error("Error in CreateInvSendTicketEmail 1:", error);
            console.error("error in qr generation", error.message);
          });

        // Prepare email data
        const emailData = {
          booking_id: booking.booking_id,
          booking_code: booking.booking_code,
          booking_date_time: moment$1(booking.booking_date_time).format(
            "DD/MM/YYYY hh:mm:ss"
          ),
          event_name: booking.event_name,
          event_tnc: booking.event_tnc,
          customer_email: resendCustomerEmail || booking.c_email,
          c_name: booking.c_name,
          c_phone_number: `${booking.c_country_code}${booking.c_phone_number}`,
          cinema_name: booking.cinema_name,
          city_name: booking.city_name,
          country_name: booking.country_name,
          event_date_time: `${moment$1(booking.event_date).format(
            "DD/MM/YYYY"
          )} ${booking.event_time}`,
          event_date_body: moment$1(booking.event_date).format("DD/MM/YYYY"),
          event_time_body: booking.event_time,
          seats: booking.seat_names,
          totalPrice: booking.total_price,
          currency: booking.currency,
          qrcode_data: qrImage,
          event_seating_type: booking.event_seating_type,
          attachments: [],
          client_name: process.env.CLIENT_NAME || "Our Platform",
          invoice_content:
            process.env.CLIENT_NAME && process.env.CLIENT_NAME == "TKTFOX"
              ? " and invoice "
              : " ",
        };

        // Create invoice and ticket PDFs
        const createInvResponse = await createInvoicePdf(emailData);
        if (createInvResponse.status) {
          // Attach PDFs to the email
          for (const file of createInvResponse.data) {
            const fileData = fs.readFileSync(file.filename);
            emailData.attachments.push({
              filename: file.name,
              content: fileData,
              cid: "",
            });
          }
          // Send email
          await sendTicketEmail(emailData);
        } else {
          await global
            .knexConnection("ms_booking")
            .where({ booking_id: booking.booking_id })
            .update({ ticket_sent: "N" });
        }
      } catch (error) {
        winstonLogger$1.error("Error in CreateInvSendTicketEmail 2:", error);
        console.error(
          "Error processing booking:",
          booking.booking_code,
          "==",
          error
        );
        // Continue to the next iteration if an error occurs
        continue;
      }
    }
  } catch (error) {
    winstonLogger$1.error("Error in CreateInvSendTicketEmail 3:", error);
    console.error("Error in CreateInvSendTicketEmail:", error);
  }
};

const sendTicketEmail = async (emailData) => {
  try {
    const templatePath = path.join(
      global.__base,
      "/modules/templetes/ticketBody.ejs"
    );
    const ticketTemplate = fs.readFileSync(templatePath, "utf8");

    const emailHtml = await ejs.render(ticketTemplate, { emailData });
    const attachments = emailData.attachments || [];

    await sendEmail(
      emailData.customer_email,
      `${process.env.CLIENT_NAME} -: ${emailData.booking_code} - ${emailData.event_name}`,
      emailHtml,
      attachments
    );
  } catch (error) {
    console.error("Error in sending email:", error);
    await global
      .knexConnection("ms_booking")
      .where({ booking_id: emailData.booking_id })
      .update({ ticket_sent: "N" });
    winstonLogger$1.error("Error in sendTicketEmail 4:", error);
  }
};

const getSeatsArray = async (seats) => {
  const updatedSeats = [];
  for (const seat of seats) {
    const [row, count] = seat.split("-");
    for (let s = 1; s <= parseInt(count); s++) {
      updatedSeats.push(`${row} (Customer ${s})`);
    }
  }
  return updatedSeats;
};

const createInvoicePdf = async (emailData) => {
  const pdfArray = [];
  return new Promise(async (resolve, reject) => {
    if (!emailData.seats) {
      return reject({
        status: false,
        message: "Seats data is missing",
      });
    }
    let seatsArray = emailData.seats.split(",");
    if (emailData.event_seating_type === "N") {
      seatsArray = await getSeatsArray(seatsArray);
    } else if (emailData.event_seating_type === "seats_io") {
      if (seatsArray[0].split("-")[0] === "GA") {
        seatsArray = await getSeatsArray(seatsArray);
      }
    }

    for (const seat of seatsArray) {
      emailData.seats = seat;
      const templatePath =
        seat === "INV"
          ? path.join(global.__base, "/modules/templetes/ticketInvoice.ejs")
          : path.join(global.__base, "/modules/templetes/confirmTicket.ejs");
      const invoiceTemplate = fs.readFileSync(templatePath, "utf8");

      const invHtml = await ejs.render(invoiceTemplate, { emailData });
      const options = { format: "A4", orientation: "portrait" };
      const fileName = `${emailData.booking_code}-${seat}.pdf`;
      const filePath = path.join(
        global.__base,
        "/public/uploads/ticketInvoice",
        fileName
      );

      if (!fs.existsSync(path.dirname(filePath))) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
      }

      pdf.create(invHtml, options).toFile(filePath, (err, data) => {
        if (err) {
          reject({ status: false, message: "Error in createInvoicePdf" });
        } else {
          data.name = fileName;
          pdfArray.push(data);
          if (pdfArray.length === seatsArray.length) {
            resolve({ status: true, message: "PDFs created", data: pdfArray });
          }
        }
      });
    }
  });
};

var CreateInvSendTicketEmail$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  CreateInvSendTicketEmail: CreateInvSendTicketEmail
});

async function getTransactionList(req, res) {
  try {
    // Combine request data
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { user_info } = req;
    const booking_id = reqbody.booking_id || null;

    // Safely parse filters with error handling
    let parsedFilters = {};
    parsedFilters = JSON.parse(reqbody.filters || "{}");

    // Extract filters
    const {
      event_ids = null,
      booking_code = null,
      customer_email = null,
      promo_code = null,
      search = null,
      selectedEventType = null,
    } = parsedFilters;

    const user_id = reqbody.user_id || null;
    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;

    // Fetch transaction list with query building and error handling
    const TransactionList = await global
      .knexConnection("ms_booking")
      .select("ms_booking.*", "ms_event.org_id", "PBD.is_booked", "PBD.is_paid")
      .leftJoin("ms_event", "ms_event.event_id", "ms_booking.event_id")
      .leftJoin(
        "ms_payment_booking_detail as PBD",
        "ms_booking.reservation_id",
        "PBD.reservation_id"
      )
      .where((builder) => {
        if (booking_id) builder.where("booking_id", "=", booking_id);
        if (event_ids && event_ids.length)
          builder.whereIn("ms_booking.event_id", event_ids);
        if (booking_code)
          builder.where("booking_code", "like", `%${booking_code}%`);
        if (customer_email)
          builder.where("c_email", "like", `%${customer_email}%`);
        if (promo_code)
          builder.where("voucher_code", "like", `%${promo_code}%`);
        if (user_info?.org_id)
          builder.where("ms_event.org_id", "=", user_info.org_id);
        if (selectedEventType)
          builder.where("ms_event.event_is_active", "=", selectedEventType);
        if (search) {
          builder.whereRaw(`concat_ws(' ', c_name, c_phone_number) like ?`, [
            `%${search}%`,
          ]);
        }
      })
      .orderBy("booking_id", "desc")
      .paginate(pagination(limit, currentPage));

    // Send response
    return sendResponse(res, 200, "Transaction List", {
      Records: TransactionList,
    });
  } catch (error) {
    return sendResponse(res, 500, "Error fetching transaction list", error);
  }
}

async function getReservationBookingList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { user_info } = req;

    // Safely parse filters with error handling
    let parsedFilters = {};

    parsedFilters = JSON.parse(reqbody.filters || "{}");

    // Extract parameters and filters
    const booking_id = reqbody.booking_id || null;
    const {
      event_ids = null,
      booking_code = null,
      customer_email = null,
      search = null,
      selectedEventType = null,
      paymentBookStatus = null,
    } = parsedFilters;

    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;

    // Fetch reservation list
    const ReservationListAll = await global
      .knexConnection("ms_payment_booking_detail as PBD")
      .select(
        global.knexConnection.raw(`
          PBD.is_refund, PBD.is_paid, R.r_id, R.reservation_id, R.is_reserved, 
          R.event_id, group_concat(R.seat_name) as seatName, 
          group_concat(R.seat_type) as seatTypes, sum(R.seat_price) as seatPrice, 
          PBD.c_name, PBD.email, PBD.phone_number, PBD.country_code, 
          PBD.payment_capture, PBD.is_guest, PBD.is_booked, 
          B.booking_code, B.booking_type_name, B.total_price as totalPaidAmount, 
          B.booking_date_time, B.currency as amountCurrency, E.event_name
        `)
      )
      .leftJoin("ms_reservation as R", "R.reservation_id", "PBD.reservation_id")
      .leftJoin("ms_event as E", "E.event_id", "R.event_id")
      .leftJoin("ms_booking as B", "R.reservation_id", "B.reservation_id")
      .where((builder) => {
        if (booking_id) builder.where("B.booking_id", "=", booking_id);
        if (event_ids && event_ids.length)
          builder.whereIn("B.event_id", event_ids);
        if (booking_code)
          builder.where("B.booking_code", "like", `%${booking_code}%`);
        if (customer_email)
          builder.where("PBD.email", "like", `%${customer_email}%`);
        if (user_info?.org_id) builder.where("E.org_id", "=", user_info.org_id);
        if (selectedEventType)
          builder.where("E.event_is_active", "=", selectedEventType);
        if (paymentBookStatus === "N") {
          builder.where("PBD.is_paid", "=", "Y");
          builder.where("PBD.is_refund", "=", "Y");
        }
        if (search) {
          builder.whereRaw(
            `concat_ws(' ', PBD.c_name, PBD.phone_number) like ?`,
            [`%${search}%`]
          );
        }
      })
      .groupBy("R.reservation_id")
      .orderBy("R.r_id", "desc")
      .paginate(pagination(limit, currentPage));

    return sendResponse(res, 200, "Reservation List", {
      Records: ReservationListAll,
    });
  } catch (error) {
    return sendResponse(res, 500, "Error fetching reservation list", error);
  }
}

async function exportBookingReport(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { user_info } = req;

    // Safely parse filters with error handling
    let parsedFilters = {};

    parsedFilters = JSON.parse(reqbody.payload || "{}");

    // Extract filters
    const {
      booking_id = null,
      event_ids = null,
      booking_code = null,
      customer_email = null,
      promo_code = null,
      search = null,
      selectedEventType = null,
    } = parsedFilters;

    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;

    // Fetch transaction report data from the database
    const TransactionReport = await global
      .knexConnection("ms_booking")
      .select("ms_booking.*", "ms_event.org_id", "PBD.is_booked", "PBD.is_paid")
      .leftJoin("ms_event", "ms_event.event_id", "ms_booking.event_id")
      .leftJoin(
        "ms_payment_booking_detail as PBD",
        "ms_booking.reservation_id",
        "PBD.reservation_id"
      )
      .where((builder) => {
        if (booking_id) builder.where("booking_id", "=", booking_id);
        if (event_ids && event_ids.length)
          builder.whereIn("ms_booking.event_id", event_ids);
        if (booking_code)
          builder.where("booking_code", "like", `%${booking_code}%`);
        if (customer_email)
          builder.where("c_email", "like", `%${customer_email}%`);
        if (promo_code)
          builder.where("voucher_code", "like", `%${promo_code}%`);
        if (user_info?.org_id)
          builder.where("ms_event.org_id", "=", user_info.org_id);
        if (selectedEventType)
          builder.where("ms_event.event_is_active", "=", selectedEventType);
        if (search) {
          builder.whereRaw(`concat_ws(' ', c_name, c_phone_number) like ?`, [
            `%${search}%`,
          ]);
        }
      })
      .orderBy("booking_id", "desc");

    // Create the Excel workbook
    let workbook = new excel.Workbook();
    let worksheet = workbook.addWorksheet("Bookings");

    // Define Excel columns
    const excelColumns = [
      { key: "booking_is_active", header: "Booking Status", width: 20 },
      { key: "event_name", header: "Event Name", width: 20 },
      { key: "event_date", header: "Event Date", width: 20 },
      { key: "event_time", header: "Event Time", width: 20 },
      { key: "cinema_name", header: "Cinema", width: 20 },
      { key: "booking_code", header: "BookingID", width: 20 },
      { key: "c_email", header: "Customer Email", width: 40 },
      { key: "c_name", header: "Customer Name", width: 20 },
      { key: "c_country_code", header: "Country Code", width: 20 },
      { key: "c_phone_number", header: "Phone No.", width: 20 },
      { key: "seat_names", header: "Seats Names", width: 20 },
      { key: "total_seats", header: "Total Seats", width: 20 },
      {
        key: "total_before_discount",
        header: "Amount Before Discount",
        width: 20,
      },
      { key: "voucher_code", header: "Voucher", width: 20 },
      { key: "discount_percent", header: "Discount Percent", width: 20 },
      { key: "discount_value", header: "Discount Amount", width: 20 },
      { key: "total_price", header: "Final Total Amount Paid", width: 20 },
      { key: "currency", header: "Currency", width: 20 },
      { key: "seats_scanned", header: "Scanned Seats", width: 20 },
      { key: "seats_tobe_scanned", header: "Seats To be Scanned", width: 20 },
      { key: "booking_date_time", header: "Booking Date", width: 20 },
      { key: "is_guest", header: "Is Guest User", width: 20 },
      {
        key: "payment_transaction_id",
        header: "Payone TransactionID",
        width: 20,
      },
    ];
    worksheet.columns = excelColumns;
    worksheet.addRow({}).commit();

    // Add transaction data to Excel
    for (let item of TransactionReport) {
      item.booking_is_active =
        item.booking_is_active === "N" ? "Cancelled" : "Active";
      worksheet.addRow(item);
    }

    // Set the response headers for the Excel file download
    const excelName = "Booking Report";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${excelName}.xlsx`
    );

    // Write the workbook and end the response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while generating the booking report.",
      error
    );
  }
}

async function exportReservationReport(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { user_info } = req;

    // Safely parse filters with error handling
    let parsedFilters = {};

    parsedFilters = JSON.parse(reqbody.filters || "{}");

    // Extract filters
    const {
      booking_id = null,
      event_ids = null,
      booking_code = null,
      customer_email = null,
      search = null,
      selectedEventType = null,
      paymentBookStatus = null,
    } = parsedFilters;

    const limit = req.query.limit || 100;
    const currentPage = req.query.currentPage || 1;

    // Fetch reservation data from the database
    const ReservationData = await global
      .knexConnection("ms_payment_booking_detail as PBD")
      .select(
        global.knexConnection.raw(
          `PBD.is_refund, PBD.is_paid, R.r_id, R.reservation_id, R.is_reserved, 
          R.event_id, group_concat(R.seat_name) as seatName, 
          group_concat(R.seat_type) as seatTypes, 
          sum(R.seat_price) as seatPrice, PBD.c_name, PBD.email, 
          PBD.phone_number, PBD.country_code, PBD.payment_capture, 
          PBD.is_guest, PBD.is_booked, B.booking_code, 
          B.booking_type_name, B.total_price as totalPaidAmount, 
          B.booking_date_time, B.currency as amountCurrency, 
          E.event_name`
        )
      )
      .leftJoin("ms_reservation as R", "R.reservation_id", "PBD.reservation_id")
      .leftJoin("ms_event as E", "E.event_id", "R.event_id")
      .leftJoin("ms_booking as B", "R.reservation_id", "B.reservation_id")
      .where((builder) => {
        if (booking_id) builder.where("B.booking_id", "=", booking_id);
        if (event_ids && event_ids.length)
          builder.whereIn("B.event_id", event_ids);
        if (booking_code)
          builder.where("B.booking_code", "like", `%${booking_code}%`);
        if (customer_email)
          builder.where("PBD.email", "like", `%${customer_email}%`);
        if (user_info?.org_id) builder.where("E.org_id", "=", user_info.org_id);
        if (selectedEventType)
          builder.where("E.event_is_active", "=", selectedEventType);
        if (paymentBookStatus === "N") {
          builder
            .where("PBD.is_paid", "=", "Y")
            .where("PBD.is_refund", "=", "Y");
        }
        if (search) {
          builder.whereRaw(
            `concat_ws(' ', PBD.c_name, PBD.phone_number) like ?`,
            [`%${search}%`]
          );
        }
      })
      .groupBy("R.reservation_id")
      .orderBy("R.r_id", "desc");

    // Create the Excel workbook
    let workbook = new excel.Workbook();
    let worksheet = workbook.addWorksheet("Reservations");

    // Define Excel columns
    const excelColumns = [
      { key: "event_name", header: "Event Name", width: 20 },
      { key: "reservation_id", header: "ReservationID", width: 20 },
      { key: "c_name", header: "Customer Name", width: 20 },
      { key: "email", header: "Customer Email", width: 40 },
      { key: "country_code", header: "Country Code", width: 20 },
      { key: "phone_number", header: "Phone No.", width: 20 },
      { key: "seatName", header: "Seats Names", width: 20 },
      { key: "seatTypes", header: "Seat Types", width: 20 },
      { key: "seatPrice", header: "Total Seat Price", width: 20 },
      { key: "is_reserved", header: "Booking Status", width: 20 },
      { key: "is_paid", header: "Payment Status", width: 20 },
      { key: "is_refund", header: "Is Refund Case", width: 20 },
      { key: "payment_capture", header: "PG Response", width: 20 },
      { key: "totalPaidAmount", header: "Total Paid Amount", width: 20 },
      { key: "amountCurrency", header: "Currency", width: 20 },
      { key: "booking_code", header: "Booking Code", width: 20 },
      { key: "booking_date_time", header: "Booking Date", width: 20 },
    ];
    worksheet.columns = excelColumns;
    worksheet.addRow({}).commit();

    // Add reservation data to Excel
    for (let item of ReservationData) {
      worksheet.addRow(item);
    }

    // Set response headers for file download
    const excelName = "Reservation Report";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${excelName}.xlsx`
    );

    // Write the workbook to the response stream
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while generating the reservation report.",
      error
    );
  }
}

async function getEventHomeDataById(req, res) {
  const reqBody = { ...req.query, ...req.body, ...req.params };
  const eventId = reqBody.event_id || null;

  if (!eventId) {
    return sendResponse(res, 400, "Event ID is required");
  }

  try {
    // Fetch data in parallel
    const [eventTransactions, ticketScannedCount, bookedSeats, seatTypes] =
      await Promise.all([
        getEventTransactions(eventId),
        getTicketScannedCount(eventId),
        getAllBookedSeats(eventId),
        getEventSeatTypes(eventId),
      ]);

    // Process voucher data
    const { totalVoucherTransactionCount, voucherSummaryArray } =
      processVoucherData(eventTransactions);

    // Process schedule data
    const { scheduleData, totalBookedSeats } = processScheduleData(
      seatTypes,
      bookedSeats
    );

    // Prepare response object
    const response = {
      event_total_trans: eventTransactions.length,
      event_total_seats_scanned: ticketScannedCount,
      event_total_voucher_trans: totalVoucherTransactionCount,
      event_total_bookedSeats: totalBookedSeats,
      eventScheduleSummary: scheduleData,
      voucherSummaryArray,
    };
    return sendResponse(res, 200, "Event Home Data", { Records: response });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching home data.",
      error
    );
  }
}

// Helper Functions
async function getEventTransactions(eventId) {
  return await global
    .knexConnection("ms_booking")
    .select("event_id", "booking_id", "seat_names", "voucher_code")
    .where("ms_booking.event_id", eventId)
    .andWhere("ms_booking.booking_is_active", "Y");
}

async function getTicketScannedCount(eventId) {
  const result = await global
    .knexConnection("ms_booking")
    .sum("seats_scanned as event_total_seats_scanned")
    .where("ms_booking.event_id", eventId)
    .andWhere("ms_booking.booking_is_active", "Y");
  return result[0]?.event_total_seats_scanned || 0;
}

async function getAllBookedSeats(eventId) {
  return await global
    .knexConnection("ms_reservation")
    .select(
      "ms_reservation.seat_type",
      "ms_reservation.no_of_seats",
      "event_schedule.sch_date",
      "event_schedule.sch_time",
      "event_schedule.sch_max_capacity",
      "event_schedule.event_sch_id"
    )
    .leftJoin(
      "event_schedule",
      "event_schedule.event_sch_id",
      "ms_reservation.event_sch_id"
    )
    .where({
      is_booked: "Y",
      "ms_reservation.event_id": eventId,
    });
}

async function getEventSeatTypes(eventId) {
  return await global
    .knexConnection("event_sch_seat_type")
    .select(
      "event_sch_seat_type.*",
      "ms_seat_class_type.seat_class_name",
      "event_schedule.sch_date",
      "event_schedule.sch_time",
      "event_schedule.sch_max_capacity"
    )
    .leftJoin(
      "ms_seat_class_type",
      "ms_seat_class_type.sct_id",
      "event_sch_seat_type.sct_id"
    )
    .leftJoin(
      "event_schedule",
      "event_schedule.event_sch_id",
      "event_sch_seat_type.event_sch_id"
    )
    .where({
      "ms_seat_class_type.sct_is_active": "Y",
      "event_schedule.sch_is_active": "Y",
      "event_sch_seat_type.event_id": eventId,
    })
    .orderBy("event_sch_seat_type.event_sch_ss_id", "asc");
}

function processVoucherData(eventTransactions) {
  let totalVoucherTransactionCount = 0;
  const voucherSummaryArray = [];

  eventTransactions.forEach((booking) => {
    if (booking.voucher_code) {
      totalVoucherTransactionCount++;

      const seatDetails = (booking.seat_names || "")
        .split(",")
        .map((seat) => seat.trim());

      seatDetails.forEach((seat) => {
        const [seatType, countStr] = seat.split("-");
        const count = parseInt(countStr, 10) || 1;

        const existingObj = voucherSummaryArray.find(
          (obj) =>
            obj.VoucherCode.toLowerCase() ===
              booking.voucher_code.toLowerCase() && obj.SeatType === seatType
        );

        if (existingObj) {
          existingObj.Count += count;
        } else {
          voucherSummaryArray.push({
            VoucherCode: booking.voucher_code,
            SeatType: seatType,
            Count: count,
          });
        }
      });
    }
  });

  return { totalVoucherTransactionCount, voucherSummaryArray };
}

function processScheduleData(seatTypes, bookedSeats) {
  const scheduleData = [];
  let totalBookedSeats = 0;

  seatTypes.forEach((type) => {
    const scheduleIndex = scheduleData.findIndex(
      (x) => x.event_sch_id === type.event_sch_id
    );

    const bookedSeatTypes = bookedSeats.filter(
      (seat) =>
        seat.event_sch_id === type.event_sch_id &&
        seat.seat_type === type.seat_class_name
    );

    const soldCount = bookedSeatTypes.reduce(
      (sum, seat) => sum + parseInt(seat.no_of_seats || 1, 10),
      0
    );

    const seatInfo = {
      seat_type: type.seat_class_name,
      count: soldCount,
      total_allocated: type.available_seats,
    };

    if (scheduleIndex >= 0) {
      scheduleData[scheduleIndex].seatTypes.push(seatInfo);
      scheduleData[scheduleIndex].sch_sold_seats += soldCount;
    } else {
      scheduleData.push({
        event_sch_id: type.event_sch_id,
        event_sch_date: type.sch_date,
        event_sch_time: type.sch_time,
        sch_max_capacity: type.sch_max_capacity,
        sch_sold_seats: soldCount,
        seatTypes: [seatInfo],
      });
    }

    totalBookedSeats += soldCount;
  });

  return { scheduleData, totalBookedSeats };
}

async function resendTicketCustomer(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body };

    // Assuming CreateInvSendTicketEmail returns data with status or error
    const data = await CreateInvSendTicketEmail(reqbody);

    if (data && data.status) {
      return sendResponse(res, 200, "Email Ticket Sent");
    } else {
      return sendResponse(res, 400, "Failed to send email");
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while sending the email",
      error
    );
  }
}

async function getPassTransactionList(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const pass_booking_id = reqbody.pass_booking_id || null;
    const { user_info } = req;
    let parsedFilters = JSON.parse(reqbody.filters);

    let event_ids = parsedFilters.event_ids || null;
    let booking_code = parsedFilters.booking_code || null;
    let customer_email = parsedFilters.customer_email || null;
    let promo_code = parsedFilters.promo_code || null;
    let search = parsedFilters.search || null;
    let selectedEventType = parsedFilters.selectedEventType || null;

    const user_id = reqbody.user_id || null;
    const limit = req.query.limit ? parseInt(req.query.limit) : 100;
    const currentPage = req.query.currentPage
      ? parseInt(req.query.currentPage)
      : 1;

    const query = global
      .knexConnection("pass_booking")
      .select("pass_booking.*")
      .where("is_active", "=", "Y");

    // Apply filters
    if (pass_booking_id) {
      query.where("pass_booking_id", "=", pass_booking_id);
    }
    if (booking_code) {
      query.where("booking_code", "like", `%${booking_code}%`);
    }
    if (customer_email) {
      query.where("c_email", "like", `%${customer_email}%`);
    }
    if (search) {
      query.whereRaw(
        `concat_ws(' ', c_name, c_phone_number) like '%${search}%'`
      );
    }

    // Apply pagination and order
    const TransactionList = await query
      .orderBy("pass_booking_id", "desc")
      .paginate(pagination(limit, currentPage));
    return sendResponse(res, 200, "Pass Transaction List", {
      Records: TransactionList,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching pass transactions",
      error
    );
  }
}

const router$4 = Router();

function ReportRoutes() {
  // GET Routes
  router$4.get("/getTransactionList", checkSessionExist, getTransactionList);
  router$4.get(
    "/getPassTransactionList",
    checkSessionExist,
    getPassTransactionList
  );
  router$4.get(
    "/getReservationBookingList",
    checkSessionExist,
    getReservationBookingList
  );
  router$4.get("/getEventHomeDataById", checkSessionExist, getEventHomeDataById);
  router$4.get("/exportBookingReport", checkSessionExist, exportBookingReport);
  router$4.get(
    "/exportReservationReport",
    checkSessionExist,
    exportReservationReport
  );

  // POST Routes
  router$4.post(
    "/resend-ticket-customer",
    checkSessionExist,
    resendTicketCustomer
  );

  return router$4;
}

async function addEdtUser(req, res) {
  let reqbody = req.body;
  const { user_info } = req;
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
  let checkFields = [];
  if (isUpdate) {
    checkFields = [
      "first_name",
      "last_name",
      "mobile_number",
      "user_name",
      "user_is_active",
      "role_id",
      "email",
      // 'role_permission',
    ];
  } else {
    checkFields = [
      "first_name",
      "last_name",
      "mobile_number",
      "user_name",
      "password",
      "user_is_active",
      "role_id",
      "email",
      // 'role_permission',
    ];
  }

  try {
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Invalid Request Data", result);
    }

    let checkUserExist = await global
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
      return sendResponse(res, 400, "User Already Exist");
    } else {
      let obj = {
        first_name: first_name || null,
        last_name: last_name || null,
        email: email || null,
        mobile_number: mobile_number || null,
        employee_code: employee_code || null,
        user_name: user_name || null,
        user_is_active: user_is_active || "Y",
        role_id: role_id || 1,

        role_permission: role_permission || null,
        ...dataReturnUpdate(user_info, isUpdate),
      };

      if (isUpdate) {
        if (password) {
          let getUser = await global
            .knexConnection("users")
            .select(["is_super_admin"])
            .where((builder) => {
              builder.where({ user_id });
            });

          if (getUser[0].is_super_admin == "Y") {
            return sendResponse(
              res,
              400,
              "Access Denied to change Super Admin password"
            );
          }
          obj["password"] = bcrypt.hashSync(password, 10);
        }
        await global.knexConnection("users").update(obj).where({ user_id });
      } else {
        obj["org_id"] = user_info.org_id;
        obj["password"] = bcrypt.hashSync(password, 10);
        await global.knexConnection("users").insert(obj);
      }

      return sendResponse(res, 200, "User Created Successfully");
    }
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An unexpected error occurred in addEdtUser",
      error
    );
  }
}

async function getUserList(req, res) {
  const { user_info } = req;
  const reqbody = { ...req.query, ...req.body };
  const user_id = reqbody.user_id;
  const getUserPermission =
    reqbody.getUserPermission && reqbody.getUserPermission == "Y"
      ? true
      : false;
  const limit = req.query.limit ? req.query.limit : 100;
  const currentPage = req.query.currentPage ? req.query.currentPage : 1;

  try {
    const UserList = await global
      .knexConnection("users")
      .select([
        "user_name",
        "first_name",
        "last_name",
        "mobile_number",
        "email",
        "role_name",
        "role_permission",
        "users.role_id",
        "users.user_id",
        "users.user_is_active",
        "organizations.org_name",
        "is_super_admin",
      ])
      .leftJoin("ms_roles", "ms_roles.role_id", "users.role_id")
      .leftJoin("organizations", "organizations.org_id", "users.org_id")
      .where((builder) => {
        if (user_id) {
          builder.where("user_id", "=", user_id);
        }

        if (getUserPermission) {
          builder.where("user_id", "=", user_info.user_id);
        }
        if (user_info.is_super_admin != "Y") {
          builder.where("users.role_id", "!=", 3);
          builder.where("is_super_admin", "!=", "Y");
        }

        builder.where("users.role_id", "!=", 3);

        if (user_info.org_id) {
          builder.where("users.org_id", "=", user_info.org_id);
        }

        if (req.query.search) {
          builder.whereRaw(
            ` concat_ws(' ',first_name,last_name,employee_code,email,mobile_number,user_name) like '%${req.query.search}%'`
          );
        }
      })
      .orderBy("user_id", "desc")
      .paginate(pagination(limit, currentPage));

    let permissionArray = [
      {
        name: "Country",
        subject: "countrymaster",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "City",
        subject: "citymaster",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "Cinema",
        subject: "cinemamaster",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "Seat Type",
        subject: "seattypemaster",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "Language",
        subject: "languagemaster",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "Genre",
        subject: "genremaster",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "Currency",
        subject: "currencymaster",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "Events",
        subject: "eventlist",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "Event Banners",
        subject: "eventbanners",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "Movies",
        subject: "movielist",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },

      {
        name: "Seat Layout",
        subject: "eventseatlayout",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "Booking Reports",
        subject: "transactionreport",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          // {
          //   text: 'Add',
          //   value: 'create',
          //   status: false,
          // },
          // {
          //   text: 'Update',
          //   value: 'update',
          //   status: false,
          // },
        ],
      },
      {
        name: "Reservation Report",
        subject: "reservationreport",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          // {
          //   text: 'Add',
          //   value: 'create',
          //   status: false,
          // },
          // {
          //   text: 'Update',
          //   value: 'update',
          //   status: false,
          // },
        ],
      },
      {
        name: "Contact Us & Subscriber",
        subject: "contactuslist",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          // {
          //   text: 'Add',
          //   value: 'create',
          //   status: false,
          // },
          // {
          //   text: 'Update',
          //   value: 'update',
          //   status: false,
          // },
        ],
      },
      {
        name: "Users",
        subject: "userlist",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "Roles",
        subject: "roleList",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "Vouchers",
        subject: "voucherlist",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
          {
            text: "Add",
            value: "create",
            status: false,
          },
          {
            text: "Update",
            value: "update",
            status: false,
          },
        ],
      },
      {
        name: "User Permisssions",
        subject: "userform",
        action: [
          {
            text: "Can give user permissions",
            value: "create",
            status: false,
          },
        ],
      },
      // {
      //   name: 'Movie Banners',
      //   subject: 'moviebanners',
      //   action: [
      //     {
      //       text: 'view',
      //       value: 'read',
      //       status: false,
      //     },
      //     {
      //       text: 'Add',
      //       value: 'create',
      //       status: false,
      //     },
      //     {
      //       text: 'Update',
      //       value: 'update',
      //       status: false,
      //     },
      //   ],
      // },
      // {
      //   name: 'Organization',
      //   subject: 'organizationlist',
      //   action: [
      //     {
      //       text: 'view',
      //       value: 'read',
      //       status: false,
      //     },
      //     {
      //       text: 'Add',
      //       value: 'create',
      //       status: false,
      //     },
      //     {
      //       text: 'Update',
      //       value: 'update',
      //       status: false,
      //     },
      //   ],
      // },
    ];
    return sendResponse(res, 200, "User List", {
      Records: UserList,
      permissionArray: permissionArray,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An unexpected error occurred in getUserList.",
      error
    );
  }
}

const router$3 = Router();

function UserRoutes() {
  // POST Routes
  router$3.post("/add-edit-users", checkSessionExist, addEdtUser);

  // GET Routes
  router$3.get("/getuserlist", checkSessionExist, getUserList);

  return router$3;
}

async function getTransactionByCode(req, res) {
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

const checkPriceData = (seatLayoutData, price_array) => {
  let price_data = {
    status: true,
    records: [],
  };

  try {
    // Create a Set for fast lookup of prices
    const priceLookup = new Map();
    price_array.forEach((priceData) => {
      const key = `${priceData.groupId}-${priceData.price}`;
      priceLookup.set(key, priceData);
    });

    // Iterate over seatLayoutData and check prices
    seatLayoutData.forEach((seatData) => {
      const key = `${seatData.seatGroupId}-${seatData.seatPrice}`;

      if (!priceLookup.has(key)) {
        price_data.records.push(seatData);
        price_data.status = false; // Update status once a mismatch is found
      }
    });
  } catch (error) {
    price_data.status = false;
    price_data.records = [];
    return sendResponse(res, 500, "Error in checkPriceData function", error);
  }

  return price_data;
};

const checkSeatsAvailableWithoutSL = async ({
  event_sch_id,
  seatLayoutData,
}) => {
  let seatCheck = {
    status: true,
    records: [],
  };

  try {
    // Fetch booked seat details grouped by seat_type_id
    const checkBookedSeats = await global
      .knexConnection("ms_reservation")
      .select(
        global.knexConnection.raw(
          "seat_type_id, sum(no_of_seats) as total_seats"
        )
      )
      .where({ event_sch_id, is_reserved: "Y" })
      .groupBy("seat_type_id");

    // Fetch seat type data for the event schedule
    const seatTypeData = await global
      .knexConnection("event_sch_seat_type")
      .select("available_seats", "sct_id")
      .where({ event_sch_id });

    // Fetch max capacity for the event schedule
    const event_data_sch = await global
      .knexConnection("event_schedule")
      .select("sch_max_capacity")
      .where({ event_sch_id });

    // Early return if necessary data is missing
    if (
      !checkBookedSeats.length ||
      !seatTypeData.length ||
      !event_data_sch.length
    ) {
      return seatCheck;
    }

    // Calculate total booked seats
    let totalBookedSeats = checkBookedSeats.reduce(
      (n, { total_seats }) => n + parseInt(total_seats),
      0
    );
    let totalScheduleMaxSeats = parseInt(
      event_data_sch[0].sch_max_capacity || 0
    );

    // Create a map of seat_type_id to available seats, considering booked seats
    let seatAvailabilityMap = new Map();
    seatTypeData.forEach(({ available_seats, sct_id }) => {
      let bookedSeats = 0;
      let bookedData = checkBookedSeats.find(
        ({ seat_type_id }) => seat_type_id === sct_id
      );
      if (bookedData) {
        bookedSeats = parseInt(bookedData.total_seats);
      }
      seatAvailabilityMap.set(sct_id, parseInt(available_seats) - bookedSeats);
    });

    // Check seat availability for the layout data
    seatLayoutData.forEach((seat) => {
      if (seatCheck.status) {
        const totalSeatsInLayout = parseInt(seat.noOfSeats);
        const updatedBookedSeats = totalBookedSeats + totalSeatsInLayout;

        // Check if booking exceeds max capacity
        if (updatedBookedSeats > totalScheduleMaxSeats) {
          seatCheck.status = false;
          seatCheck.records.push(seat);
        }

        // Check if the seat type has enough available seats
        const availableSeats = seatAvailabilityMap.get(seat.sct_id);
        if (
          availableSeats === undefined ||
          totalSeatsInLayout > availableSeats
        ) {
          seatCheck.status = false;
          seatCheck.records.push(seat);
        }

        totalBookedSeats = updatedBookedSeats;
      }
    });
  } catch (error) {
    seatCheck.status = false;
    seatCheck.records = [];
    return sendResponse(
      res,
      500,
      "Error in checkSeatsAvailableWithoutSL function",
      error
    );
  }

  return seatCheck;
};

const checkPriceDataWithoutSL = (seatLayoutData, price_array) => {
  let price_data = {
    status: true,
    records: [],
  };

  try {
    // Create a Map of price data for fast lookup
    const priceMap = new Map();
    price_array.forEach((priceData) => {
      const key = `${priceData.sct_id}-${priceData.price_per_seat}`;
      priceMap.set(key, priceData);
    });

    // Iterate over seatLayoutData
    seatLayoutData.forEach((seatData) => {
      const key = `${seatData.sct_id}-${seatData.price_per_seat}`;

      // Check if the price data for this seat exists in the price map
      if (!priceMap.has(key) && price_data.status) {
        price_data.records.push(seatData);
        price_data.status = false; // No need to keep checking after the first mismatch
      }
    });
  } catch (error) {
    price_data.status = false;
    price_data.records = [];
    return sendResponse(
      res,
      500,
      "Error in checkPriceDataWithoutSL function",
      error
    );
  }

  return price_data;
};

const addReservationSeat = async (req, res) => {
  let reqbody = req.body;
  const { user_info } = req;
  const { event_sch_id, event_id, selectedSeatsArray } = reqbody;

  try {
    // Validate required fields
    const checkFields = ["event_sch_id", "event_id", "selectedSeatsArray"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Event Schedule, Event or Seats not found");
    }

    // Validate seats in parallel
    const seatValidationPromises = selectedSeatsArray.map(async (seatsObj) => {
      const checkFieldsAr = [
        "seatGroupId",
        "seatPrice",
        "seatType",
        "seatRowName",
        "seatColName",
      ];
      let result2 = await checkValidation(checkFieldsAr, seatsObj);
      if (!result2.status) {
        throw new Error(
          `Seat validation failed for ${seatsObj.seatRowName}${seatsObj.seatColName}`
        );
      }

      // Check if the seat is already reserved
      const checkAlready = await global.knexConnection("ms_reservation").where({
        is_reserved: "Y",
        seat_name: `${seatsObj.seatRowName}${seatsObj.seatColName}`,
        seat_group_id: seatsObj.seatGroupId,
        event_sch_id,
      });

      if (checkAlready.length) {
        throw new Error(
          `Seat ${seatsObj.seatRowName}${seatsObj.seatColName} already reserved.`
        );
      }

      return {
        seat_group_id: seatsObj.seatGroupId,
        seat_type: seatsObj.seatType,
        seat_name: `${seatsObj.seatRowName}${seatsObj.seatColName}`,
        row_name: seatsObj.seatRowName,
        column_name: seatsObj.seatColName,
        seat_price: seatsObj.seatPrice,
      };
    });

    // Wait for all seat validations to complete
    let arrayData = await Promise.all(seatValidationPromises).catch((error) => {
      return sendResponse(res, 400, "Error in adding reservation seat");
    });

    // Generate unique reservation ID
    let reservation_id = v4();

    // Fetch event data and schedule validation
    let event_data_all = await EVENT_DATA({ event_id });
    let event_data = event_data_all.Records;
    if (!event_data.length) {
      return sendResponse(res, 400, "Event Doesn't Exist");
    }

    let event_data_sch = await global
      .knexConnection("event_schedule")
      .where({ event_sch_id });

    if (!event_data_sch.length) {
      return sendResponse(res, 400, "Event Schedule Doesn't Exist");
    }

    // Fetch seat layout data and validate price
    let seatLayoutData = await global
      .knexConnection("ms_seat_layout")
      .select("price_data")
      .where({ sl_id: event_data[0].sl_id });

    if (!seatLayoutData.length) {
      return sendResponse(res, 400, "Seat Layout Doesn't Exist");
    }

    let priceArray = seatLayoutData[0].price_data
      ? JSON.parse(seatLayoutData[0].price_data)
      : [];
    let checkPrice = checkPriceData(arrayData, priceArray || []);

    if (!checkPrice.status) {
      return sendResponse(res, 400, "Price not matched");
    }

    // Get current time for reservation creation
    let currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      event_data[0].tz_name
    );

    // Prepare data for insertion
    const insertData = arrayData.map((z) => ({
      ...z,
      reservation_id,
      event_sch_id,
      event_id,
      is_seat_layout_exist: event_data[0].event_seating_type,
      created_at: currentDateTimeNew,
      timezone_name: event_data[0].tz_name,
      created_by: user_info ? user_info.user_id : null,
      seat_release_time: event_data[0].cinema_seat_release_time || 15,
    }));

    // Use transaction for safer insertion
    await global.knexConnection.transaction(async (trx) => {
      await trx("ms_reservation").insert(insertData);
    });

    // Respond with success and the reservation ID
    return sendResponse(res, 200, "Reservation seat added successfully", {
      reservation_id: reservation_id,
    });
  } catch (error) {
    return sendResponse(res, 500, "Error in adding reservation seat", error);
  }
};

const addReservationSeatWithoutSeatlayout = async (req, res) => {
  let reqbody = req.body;
  const { user_info } = req;
  const { event_sch_id, event_id, selectedSeatsArray } = reqbody;

  try {
    // Validate required fields
    const checkFields = ["event_sch_id", "event_id", "selectedSeatsArray"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    // Validate each seat in parallel
    const seatValidationPromises = selectedSeatsArray.map(async (seatsObj) => {
      const checkFieldsAr = [
        "sct_id",
        "price_per_seat",
        "seat_class_name",
        "noOfSeats",
      ];
      let result2 = await checkValidation(checkFieldsAr, seatsObj);
      if (!result2.status) {
        throw new Error(`Seat validation failed for ${seatsObj.sct_id}`);
      }

      return {
        seat_type_id: seatsObj.sct_id,
        seat_type: seatsObj.seat_class_name,
        no_of_seats: seatsObj.noOfSeats,
        seat_price: seatsObj.price_per_seat,
      };
    });

    // Wait for all seat validations to complete
    let arrayData = await Promise.all(seatValidationPromises).catch((error) => {
      return sendResponse(res, 400, "Error in adding reservation seat");
    });

    // Check seat availability
    let checkSeatExist = await checkSeatsAvailableWithoutSL({
      event_sch_id,
      seatLayoutData: selectedSeatsArray,
    });

    if (!checkSeatExist.status) {
      return sendResponse(res, 400, "Seat Already Booked or Reserved");
    }

    // Generate unique reservation ID
    let reservation_id = v4();

    // Get event data for validation
    let event_data_all = await EVENT_DATA({ event_id });
    let event_data = event_data_all.Records;
    if (!event_data.length) {
      return sendResponse(res, 400, "Event Doesn't Exist");
    }

    // Check if the event schedule exists
    let event_data_sch = await global
      .knexConnection("event_schedule")
      .where({ event_sch_id });

    if (!event_data_sch.length) {
      return sendResponse(res, 400, "Schedule Doesn't Exist");
    }

    // Fetch seat price data for price validation
    let priceArray = await global
      .knexConnection("event_sch_seat_type")
      .select("sct_id", "price_per_seat")
      .where({ event_sch_id });

    if (!priceArray.length) {
      return sendResponse(res, 400, "Seat Layout Doesn't Exist");
    }

    // Validate price data
    let checkPrice = checkPriceDataWithoutSL(
      selectedSeatsArray,
      priceArray || []
    );
    if (!checkPrice.status) {
      return sendResponse(res, 400, "Price Unmatched");
    }

    // Get current time for reservation creation
    let currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      event_data[0].tz_name
    );

    // Prepare common data for insertion
    const duplicateData = {
      reservation_id,
      event_sch_id,
      event_id,
      is_seat_layout_exist: event_data[0].event_seating_type,
      created_at: currentDateTimeNew,
      timezone_name: event_data[0].tz_name,
      created_by: user_info ? user_info.user_id : null,
      seat_release_time: event_data[0].cinema_seat_release_time || 15,
    };

    // Prepare data for bulk insertion
    let insertData = arrayData.map((z) => ({
      ...z,
      ...duplicateData,
    }));

    // Use transaction to ensure consistency
    await global.knexConnection.transaction(async (trx) => {
      await trx("ms_reservation").insert(insertData);
    });

    // Respond with the reservation ID
    return sendResponse(res, 200, "Reservation Added Successfully", {
      reservation_id: reservation_id,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while adding reservation seat.",
      error
    );
  }
};

const getReservationSeat = async (req, res) => {
  let reqbody = { ...req.body, ...req.params };
  const { reservation_id } = reqbody;
  const Booking_time = 10; // Default booking time in minutes

  try {
    // Validate reservation_id
    const checkFields = ["reservation_id"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    // Get reservation details
    let getReservationDetail = await global
      .knexConnection("ms_reservation")
      .where({ reservation_id, is_reserved: "Y" });

    if (!getReservationDetail.length) {
      return sendResponse(
        res,
        400,
        "Reservation not found or seat is released"
      );
    }

    // Get current date/time
    let currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      getReservationDetail[0].timezone_name
    );

    let obj = {
      seat_name: [],
      totalprice: 0,
      minutes: 0,
      seconds: 0,
      reserved_time: "",
      release_time: "",
      discountValue: 0,
      voucher_code: "",
      discountPercent: "",
      priceBeforeDiscount: 0,
      backend_api_route: null,
      currentDateTime: currentDateTimeNew,
      pass_applied: false,
      booking_fee_value: 0,
      actualAmount: 0,
      booking_fee_percent: "",
    };

    // Fetch event data
    const event_data = await EVENT_DATA({
      event_id: getReservationDetail[0].event_id,
      event_sch_id: getReservationDetail[0].event_sch_id,
    });

    //fetch cinema payment gateway
    const cinemaPaymentGateway = await global
      .knexConnection("organization_setting")
      .where({ org_id: event_data.Records[0].org_id })
      .where((builder) =>
        builder
          .where({ setting_key: "tap_pay_payment" })
          .orWhere({ setting_key: "payone_payment" })
          .orWhere({ setting_key: "mpgs_network_payment" })
      );

    // Process reservation details
    getReservationDetail.forEach((z) => {
      obj.seat_name.push(z.seat_name);
      const seatPrice = parseFloat(z.seat_price);
      const noOfSeats = parseFloat(z.no_of_seats) || 1;
      obj.priceBeforeDiscount += parseFloat(seatPrice) * noOfSeats;

      obj.totalprice += parseFloat(seatPrice) * noOfSeats;
      obj.reserved_time = moment$1(z.created_at).format("YYYY-MM-DD HH:mm:ss");
      obj.release_time = moment$1(z.created_at)
        .add(z.seat_release_time || Booking_time, "minutes")
        .format("YYYY-MM-DD HH:mm:ss");

      //check for voucher discount here
      if (z.voucher_applied == "Y") {
        obj.totalprice -= parseFloat(z.voucher_discount_amount || 0);
      }

      //check for pass discount here

      if (z.pass_applied == "Y") {
        obj.totalprice -= parseFloat(z.pass_discount_amount || 0);
        obj.pass_applied = true;
        obj.discountPercent = `${z.pass_discount_percent}%`;
        obj.discountValue = parseFloat(z.pass_discount_amount);
      }
    });

    if (
      event_data.Records[0].event_booking_fees &&
      event_data.Records[0].event_booking_fees > 0
    ) {
      obj.booking_fee_percent = event_data.Records[0].event_booking_fees + "%";
      obj.booking_fee_value =
        (parseFloat(event_data.Records[0].event_booking_fees) / 100) *
        obj.totalprice;
      obj.actualAmount = obj.totalprice;
      obj.totalprice = obj.totalprice + obj.booking_fee_value;
    }

    // Calculate time difference for reservation release
    obj.seconds =
      moment$1(obj.release_time).diff(moment$1(obj.currentDateTime), "seconds") %
      60;
    obj.minutes =
      moment$1(obj.release_time).diff(moment$1(obj.currentDateTime), "minutes") %
      60;

    // add voucher discount details in response if available
    if (getReservationDetail[0].voucher_applied == "Y") {
      obj.voucher_code = getReservationDetail[0].voucher_code;
      obj.discountPercent = `${getReservationDetail[0].voucher_discount_percent}%`;
      obj.discountValue = parseFloat(
        getReservationDetail[0].voucher_discount_amount
      );
    }

    // Get cinema payment gateway information
    if (cinemaPaymentGateway.length) {
      const apiRoute = JSON.parse(cinemaPaymentGateway[0].setting_data);
      obj.backend_api_route = apiRoute.PAYMENT_API_ROUTE;
    }

    // Merge event data with the calculated reservation details
    event_data.Records[0] = {
      ...event_data.Records[0],
      ...obj,
    };
    return sendResponse(res, 200, "Success", {
      Records: [...event_data.Records],
      getReservationDetail,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving reservation details.",
      error
    );
  }
};

const resetReserveTime = async (req, res) => {
  let reqbody = { ...req.body, ...req.params };
  const { reservation_id } = reqbody;

  try {
    // Validate reservation_id
    const checkFields = ["reservation_id"];
    const result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Reservation ID is required");
    }

    // Get reservation details to ensure the reservation exists and is active
    const [getReservationDetail] = await global
      .knexConnection("ms_reservation")
      .where({ reservation_id, is_reserved: "Y" });

    if (!getReservationDetail) {
      return sendResponse(res, 400, "Reservation not found");
    }

    // Get current date and time based on the timezone of the reservation
    const currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      getReservationDetail.timezone_name
    );

    // Create the update object with the new timestamps
    const update_obj = {
      created_at: currentDateTimeNew,
      updated_at: currentDateTimeNew,
    };

    // Update the reservation with the new timestamps
    await global
      .knexConnection("ms_reservation")
      .update(update_obj)
      .where({ reservation_id });
    return sendResponse(res, 200, "Timer Reset");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while resetting the reservation time.",
      error
    );
  }
};

const releaseSeats = async (req, res) => {
  const reqbody = { ...req.body, ...req.params };
  const { reservation_id } = reqbody;

  try {
    // Validate reservation_id
    const checkFields = ["reservation_id"];
    const validationResult = await checkValidation(checkFields, reqbody);
    if (!validationResult.status) {
      return sendResponse(res, 400, "Reservation ID is required");
    }

    // Get reservation details to ensure the reservation exists and is active
    const [reservation] = await global
      .knexConnection("ms_reservation")
      .where({ reservation_id, is_reserved: "Y" });

    if (!reservation) {
      return sendResponse(res, 400, "Seat Released or Already Booked");
    }

    // Get the current date and time based on the reservation's timezone
    const currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      reservation.timezone_name
    );

    // Prepare the object to update reservation status to "Released"
    const update_obj = { is_reserved: "N" };

    // Update the reservation status to "Released"
    await global
      .knexConnection("ms_reservation")
      .update(update_obj)
      .where({ reservation_id });

    // Return a success response
    return sendResponse(res, 200, "Seat Released", {
      Records: "Seat Released", // Success message
      update_obj, // Information about the updated reservation status
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while releasing the seat.",
      error
    );
  }
};

const allReserveSeatBySchedule = async (req, res) => {
  let reqbody = { ...req.body, ...req.params };
  const { event_sch_id } = reqbody;

  try {
    // Validate event_sch_id
    let checkFields = ["event_sch_id"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Event Schedule ID is required");
    }

    // Fetch reserved seat details
    let getReservationDetail = await global
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
      .where({ event_sch_id, is_reserved: "Y" });

    // Fetch manually blocked seat details
    let getManualBlockDetail = await global
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
      .where({ event_sch_id });

    // Combine the results and return them in a response
    return sendResponse(res, 200, "All Reserved and Blocked Seats", {
      Records: [...getReservationDetail, ...getManualBlockDetail],
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while retrieving seat reservations.",
      error
    );
  }
};

async function applyVoucher(req, res) {
  const reqbody = { ...req.query, ...req.body, ...req.params };
  const { reservation_id, event_id, voucher_code, seatCount } = reqbody;

  try {
    // Validate required fields
    if (!reservation_id || !event_id || !voucher_code) {
      return sendResponse(
        res,
        400,
        "Reservation ID, Event ID, and Voucher Code are required."
      );
    }

    // Fetch the voucher details from the database
    const getVoucher = await global.knexConnection("ms_vouchers").where({
      event_id: event_id,
      voucher_code: voucher_code,
      voucher_is_active: "Y",
    });

    // Check if the voucher exists
    if (!getVoucher.length) {
      return sendResponse(res, 400, "Invalid Voucher Code");
    }

    // Check if the voucher has already been applied to the reservation
    const getAddedVouchers = await global
      .knexConnection("ms_reserve_vouchers")
      .select("ms_reservation.reservation_id")
      .leftJoin(
        "ms_reservation",
        "ms_reservation.reservation_id",
        "ms_reserve_vouchers.reservation_id"
      )
      .where({
        "ms_reserve_vouchers.event_id": event_id,
        "ms_reserve_vouchers.voucher_code": voucher_code,
        "ms_reserve_vouchers.reservation_id": reservation_id,
        "ms_reservation.is_reserved": "Y",
      })
      .groupBy("ms_reserve_vouchers.reservation_id");

    // Check if voucher usage exceeds available quantity
    if (
      getAddedVouchers.length >=
      parseFloat(getVoucher[0].total_available_voucher)
    ) {
      return sendResponse(res, 400, "Total Voucher Code limit exceeded");
    }

    // Validate seat count against the voucher's minimum and maximum seat requirements
    const seatCountValue = parseFloat(seatCount);
    const { min_seats_required, max_seats_required } = getVoucher[0];

    if (seatCountValue < min_seats_required) {
      return sendResponse(
        res,
        400,
        `Minimum seat count should be greater than ${min_seats_required}`
      );
    }

    if (seatCountValue > max_seats_required) {
      return sendResponse(
        res,
        400,
        `Maximum seat count should not be greater than ${max_seats_required}`
      );
    }

    // Prepare the object to insert into ms_reserve_vouchers
    const voucherObj = {
      reservation_id,
      event_id,
      voucher_id: getVoucher[0].voucher_id,
      voucher_code,
      voucher_discount_percent: getVoucher[0].voucher_discount_value || 0,
      rv_is_active: "Y",
    };

    // Insert the voucher application into the database
    await global.knexConnection("ms_reserve_vouchers").insert(voucherObj);

    //get reservation data
    const reservation = await global
      .knexConnection("ms_reservation")
      .select("seat_price", "r_id", "no_of_seats")
      .where({ reservation_id, is_reserved: "Y" });

    //update voucher data in reservation table
    for (let item of reservation) {
      let update_obj = {
        voucher_applied: "Y",
        voucher_code: voucher_code,
        voucher_discount_percent:
          parseFloat(getVoucher[0].voucher_discount_value) || 0,
        voucher_discount_amount:
          (parseFloat(getVoucher[0].voucher_discount_value || 0) / 100) *
          parseFloat(item.seat_price) *
          parseFloat(item.no_of_seats || 1),
      };
      await global
        .knexConnection("ms_reservation")
        .update(update_obj)
        .where({ r_id: item.r_id });
    }

    // Send success response
    return sendResponse(res, 200, "Voucher Code Applied", {
      voucher_code: voucher_code,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while applying the voucher code.",
      error
    );
  }
}

async function removeVoucher(req, res) {
  const reqbody = { ...req.query, ...req.body, ...req.params };
  const { reservation_id, rv_id } = reqbody;

  try {
    // Validate the presence of reservation_id
    if (!reservation_id) {
      return sendResponse(
        res,
        400,
        "Reservation ID is required to remove the voucher!"
      );
    }

    //Update Reservation Table
    let update_obj = {
      voucher_applied: "N",
      voucher_code: "",
      voucher_discount_percent: 0,
      voucher_discount_amount: 0,
    };
    await global
      .knexConnection("ms_reservation")
      .update(update_obj)
      .where({ reservation_id });

    // Delete the voucher record from ms_reserve_vouchers
    await global
      .knexConnection("ms_reserve_vouchers")
      .where({ reservation_id })
      .del();

    return sendResponse(res, 200, "Voucher Code Removed Successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while removing the voucher.",
      error
    );
  }
}

const addReservationSeatsIo = async (req, res) => {
  const { event_sch_id, event_id, selectedSeatsArray, seatsio_eventkey } =
    req.body;
  const { user_info } = req;

  try {
    // Validate required fields in the request body
    const requiredFields = [
      "event_sch_id",
      "event_id",
      "selectedSeatsArray",
      "seatsio_eventkey",
    ];
    const validationResult = await checkValidation(requiredFields, req.body);
    if (!validationResult.status) {
      return sendResponse(res, 400, "Validation Error", validationResult);
    }

    let seatsIoSeatArray = [];
    let seatReservationData = [];

    // Process each selected seat
    for (const seat of selectedSeatsArray) {
      // Validate seat data
      const seatFields = [
        "seatGroupId",
        "seatPrice",
        "seatType",
        "seatRowName",
        "seatColName",
      ];
      const seatValidationResult = await checkValidation(seatFields, seat);
      if (!seatValidationResult.status) {
        return sendResponse(res, 400, "Validation Error", seatValidationResult);
      }

      // Check if the seat is already reserved
      const existingReservation = await global
        .knexConnection("ms_reservation")
        .where({
          is_reserved: "Y",
          seat_name: `${seat.seatRowName}${seat.seatColName}`,
          seat_group_id: seat.seatGroupId,
          event_sch_id: event_sch_id,
        });

      if (
        existingReservation.length &&
        existingReservation[0].row_name !== "GA-"
      ) {
        return sendResponse(res, 400, "Seat Already Reserved");
      }

      // Add seat to SeatsIO holding array
      const seatIdentifier = seat.seatUniqueId;
      if (seat.objectType === "GeneralAdmissionArea" && seat.seatQuantity) {
        seatsIoSeatArray.push({
          objectId: seat.seatType,
          quantity: seat.seatQuantity,
        });
      } else {
        seatsIoSeatArray.push(seatIdentifier);
      }

      // Prepare seat data for database insertion
      seatReservationData.push({
        seat_group_id: seat.seatGroupId,
        seat_type: seat.seatType,
        seat_name: `${seat.seatRowName}${seat.seatColName}`,
        row_name: seat.seatRowName,
        column_name: seat.seatColName,
        seat_price: seat.seatPrice,
      });
    }

    // Generate a unique reservation ID
    const reservation_id = v4();

    // Retrieve event data
    const eventData = await EVENT_DATA({ event_id });
    if (!eventData.Records.length) {
      return sendResponse(res, 400, "Event Doesn't Exist");
    }

    // Check if event schedule exists
    const scheduleData = await global
      .knexConnection("event_schedule")
      .where({ event_sch_id });
    if (!scheduleData.length) {
      return sendResponse(res, 400, "Schedule Doesn't Exist");
    }

    // Fetch SeatsIO credentials
    const seatsioCredential = await SeatsIoCredentialFunction({
      org_id: eventData.Records[0].org_id,
      setting_key: "seats_io",
    });

    if (seatsioCredential.false) {
      return sendResponse(
        res,
        400,
        "Seats.io credentials not found for this organization"
      );
    }

    const { SEATSIO_SECRET_WORKSPACE_KEY } = seatsioCredential.data;
    const client = new SeatsioClient(Region.EU(), SEATSIO_SECRET_WORKSPACE_KEY);

    // Create a hold token and hold the seats in SeatsIO
    const holdToken = await client.holdTokens.create(15); // Hold time in minutes
    await client.events.hold(
      seatsio_eventkey,
      seatsIoSeatArray,
      holdToken.holdToken
    );

    // Prepare reservation data for database insertion
    const currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      eventData.Records[0].tz_name
    );
    const reservationData = seatReservationData.map((seatData) => ({
      ...seatData,
      reservation_id,
      event_sch_id,
      event_id,
      is_seat_layout_exist: eventData.Records[0].event_seating_type,
      created_at: currentDateTimeNew,
      timezone_name: eventData.Records[0].tz_name,
      created_by: user_info ? user_info.user_id : null,
      seat_release_time: eventData.Records[0].cinema_seat_release_time || 15,
      seatsio_holdtoken: holdToken.holdToken,
      seatsio_eventkey,
    }));

    // Insert reservation data into the database
    await global.knexConnection("ms_reservation").insert(reservationData);
    return sendResponse(res, 200, "Reservation Created Successfully", {
      reservation_id: reservation_id,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing the reservation. Please try again.",
      error
    );
  }
};

const reservePass = async (req, res) => {
  try {
    const reqbody = { ...req.body, ...req.params };
    const { user_info } = req;
    const { pass_id } = reqbody;

    const checkFields = ["pass_id"];
    const result = await checkValidation(checkFields, reqbody);

    if (!result.status) {
      return sendResponse(res, 400, "Pass ID is required");
    }

    const reservation_id = v4();

    // Fetch pass data
    const passData = await global
      .knexConnection("movie_event_pass")
      .select("movie_event_pass.*", "ms_currencies.curr_code")
      .leftJoin(
        "ms_currencies",
        "ms_currencies.curr_id",
        "movie_event_pass.pass_currency_id"
      )
      .where({
        "movie_event_pass.pass_id": pass_id,
        "movie_event_pass.pass_is_active": "Y",
      });

    if (!passData.length) {
      return sendResponse(res, 400, "Pass does not exists");
    }

    // Simplify amount and tax calculation
    const passAmount = parseFloat(passData[0].pass_amount);
    const passTaxValue =
      (parseFloat(passData[0].pass_tax_value) / 100) * passAmount;
    const passTotalPrice = passAmount + passTaxValue;

    const insertData = {
      p_reservation_id: reservation_id,
      pass_id: pass_id,
      pass_price: passAmount.toFixed(3),
      pass_tax_percent: passData[0].pass_tax_value,
      pass_tax_value: passTaxValue,
      pass_total_price: passTotalPrice,
      pass_price_currency: passData[0].curr_code,
      pass_release_time: 15,
    };

    // Insert reservation data into database
    await global.knexConnection("ms_pass_reservation").insert(insertData);
    return sendResponse(res, 200, "Reservation Created Successfully", {
      reservation_id: reservation_id,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while processing the reservation. Please try again.",
      error
    );
  }
};

const getReservePassDetails = async (req, res) => {
  try {
    const reqbody = { ...req.body, ...req.params };
    const { reservation_id } = reqbody;
    const Booking_time = 10; // Default Booking Time

    // Validate required fields
    const checkFields = ["reservation_id"];
    const result = await checkValidation(checkFields, reqbody);

    if (!result.status) {
      return sendResponse(res, 400, "Reservation ID is required");
    }

    // Fetch reservation details
    const getReservationDetail = await global
      .knexConnection("ms_pass_reservation")
      .select(
        "movie_event_pass.pass_name",
        "movie_event_pass.pass_feature",
        "movie_event_pass.pass_valid_days",
        "movie_event_pass.pass_tax_value",
        "pass_type",
        "pass_validity_from",
        "pass_validity_to",
        "pass_amount",
        "discount_type",
        "pass_discount_value",
        "pass_tnc",
        "p_reservation_id",
        "ms_pass_reservation.pass_total_price",
        "ms_pass_reservation.pass_tax_value",
        "ms_pass_reservation.pass_tax_percent",
        "ms_pass_reservation.pass_price",
        "pass_release_time",
        "ms_pass_reservation.pass_price_currency"
      )
      .leftJoin(
        "movie_event_pass",
        "movie_event_pass.pass_id",
        "ms_pass_reservation.pass_id"
      )
      .where({
        p_reservation_id: reservation_id,
        p_is_reserved: "Y",
        "movie_event_pass.pass_is_active": "Y",
      });

    if (!getReservationDetail.length) {
      return sendResponse(res, 400, "Reservation not found or pass released");
    }

    const currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      null
    );

    // Prepare response object
    const obj = {
      pass_name: getReservationDetail[0].pass_name,
      pass_type: getReservationDetail[0].pass_type,
      pass_validity_from: getReservationDetail[0].pass_validity_from,
      pass_validity_to: getReservationDetail[0].pass_validity_to,
      pass_valid_days: `${getReservationDetail[0].pass_valid_days} Days`,
      pass_amount: parseFloat(getReservationDetail[0].pass_amount),
      pass_tax_in_percent: getReservationDetail[0].pass_tax_percent,
      pass_tax_value: getReservationDetail[0].pass_tax_value,
      total_amount_payable: getReservationDetail[0].pass_total_price,
      curr_code: getReservationDetail[0].pass_price_currency,
      discount_type: getReservationDetail[0].discount_type,
      pass_discount_value: getReservationDetail[0].pass_discount_value,
      pass_tnc: getReservationDetail[0].pass_tnc,
      pass_feature: getReservationDetail[0].pass_feature,
      p_reservation_id: getReservationDetail[0].p_reservation_id,
      pass_release_time: getReservationDetail[0].pass_release_time,
      minutes: 0,
      seconds: 0,
      reserved_time: moment$1(getReservationDetail[0].created_at).format(
        "YYYY-MM-DD HH:mm:ss"
      ),
      release_time: moment$1(getReservationDetail[0].created_at)
        .add(
          getReservationDetail[0].pass_release_time || Booking_time,
          "minutes"
        )
        .format("YYYY-MM-DD HH:mm:ss"),
      backend_api_route: null,
      currentDateTime: currentDateTimeNew,
    };

    // Calculate time remaining for release
    obj.seconds =
      moment$1(obj.release_time).diff(moment$1(obj.currentDateTime), "seconds") %
      60;
    obj.minutes =
      moment$1(obj.release_time).diff(moment$1(obj.currentDateTime), "minutes") %
      60;

    // Format pass validity date
    obj.pass_validity_to = moment$1()
      .add(getReservationDetail[0].pass_valid_days, "days")
      .format("DD/MM/YYYY");

    // Fetch payment gateway configuration
    const getCinemaPaymentGateway = await global
      .knexConnection("organization_setting")
      .where({ setting_is_active: "Y" })
      .where((builder) => {
        builder.orWhere({ setting_key: "payone_payment" });
      });

    if (getCinemaPaymentGateway.length) {
      let apiRoute = JSON.parse(getCinemaPaymentGateway[0].setting_data);
      obj.backend_api_route = apiRoute.PASS_PAYMENT_API_ROUTE;
    }

    // Return response
    return sendResponse(res, 200, "Reservation details fetched successfully", {
      Records: [obj],
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred in getReservePassDetails",
      error
    );
  }
};

async function applyPass(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const { reservation_id, pass_id, customer_email } = reqbody;

    if (!reservation_id || !pass_id || !customer_email) {
      return sendResponse(
        res,
        400,
        "Reservation ID, Pass ID and Customer Email are required"
      );
    }

    let logged_in_customer_id = req["logged_in_customer_id"] || null;
    // Get customer details

    if (!logged_in_customer_id) {
      return sendResponse(res, 400, "User not found");
    }

    // Get pass details
    const getPass = await global
      .knexConnection("movie_event_pass")
      .select("movie_event_pass.*")
      .where({
        "movie_event_pass.pass_id": pass_id,
        "movie_event_pass.pass_is_active": "Y",
      });
    if (!getPass.length) {
      return sendResponse(res, 400, "Pass not found");
    }

    // Get reservation details
    const getReservationDetail = await global
      .knexConnection("ms_reservation")
      .select("reservation_id", "seat_type_id", "event_id", "seat_price")
      .where({
        reservation_id,
        is_reserved: "Y",
      });
    if (!getReservationDetail.length) {
      return sendResponse(
        res,
        400,
        "Reservation not found or seat is released"
      );
    }

    // Get event details and validate pass type
    const getEventDetail = await global
      .knexConnection("ms_event")
      .select("type")
      .where({
        event_id: getReservationDetail[0].event_id,
      });
    if (!getEventDetail.length) {
      return sendResponse(res, 400, "Event not found");
    }

    // Check pass type compatibility
    if (getPass[0].pass_type !== getEventDetail[0].type) {
      return sendResponse(
        res,
        400,
        "Pass type and event type are not compatible"
      );
    }

    // Validate seat type for the pass
    const validSeatType = getReservationDetail.find(
      (z) => z.seat_type_id === getPass[0].seat_type_id
    );
    if (!validSeatType) {
      return sendResponse(res, 400, "Seat type not eligible for pass!");
    }

    // Check if user has already bought the pass and handle limits
    const getAlreadyBoughtUserPass = await global
      .knexConnection("ms_booking")
      .select("booking_id", "booking_date_time")
      .where({
        voucher_code: "PASS-" + pass_id,
        logged_in_customer_id,
        booking_is_active: "Y",
      });

    if (getAlreadyBoughtUserPass.length) {
      const maxPerUser = parseFloat(getPass[0].max_transaction_per_user);
      if (getAlreadyBoughtUserPass.length >= maxPerUser) {
        return sendResponse(res, 400, "Per user pass limit exceed!");
      }

      // Filter bookings for today's date
      const filterForPerDayPass = getAlreadyBoughtUserPass.filter((x) =>
        moment$1(x.booking_date_time).isSame(moment$1(), "day")
      );

      const maxPerDay = parseFloat(getPass[0].max_transaction_per_day);
      if (filterForPerDayPass.length >= maxPerDay) {
        return sendResponse(res, 400, "Per day pass limit exceed!");
      }
    }

    // Prepare data to insert into ms_reserve_pass
    const obj = {
      reservation_id,
      pass_id,
      seat_type_id: validSeatType.seat_type_id,
      logged_in_customer_id,
      pass_discount_percent: getPass[0].pass_discount_value || 0,
      rp_is_active: "Y",
    };

    await global.knexConnection("ms_reserve_pass").insert(obj);

    //update pass data in reservation table

    const getvalidSeatType = getReservationDetail.filter(
      (z) => z.seat_type_id === passData[0].seat_type_id
    );
    if (getvalidSeatType.length) {
      let update_obj = {
        pass_applied: "Y",
        pass_code: getPass[0].pass_name,
        pass_discount_percent: parseFloat(getPass[0].pass_discount_value) || 0,
        pass_discount_amount:
          (parseFloat(getPass[0].pass_discount_value) / 100) *
          parseFloat(item.seat_price),
      };
      await global
        .knexConnection("ms_reservation")
        .update(update_obj)
        .where({ reservation_id: getvalidSeatType[0].reservation_id });
    }
    return sendResponse(res, 200, "Pass applied successfully", {
      pass_name: getPass[0].pass_name,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while applying the pass.",
      error
    );
  }
}

async function getCustomerPassById(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const logged_in_customer_id = req["logged_in_customer_id"] || null;

    if (!logged_in_customer_id) {
      return sendResponse(res, 400, "Customer ID not provided!");
    }

    // Fetching customer pass details
    const getCustomerPass = await global
      .knexConnection("pass_booking")
      .select(
        "pass_booking.pass_name",
        "pass_booking.pass_id",
        "pass_booking.pass_discount_percent"
      )
      .join(
        "ms_customers",
        "ms_customers.customer_id",
        "pass_booking.customer_id"
      )
      .where({
        "ms_customers.customer_id": logged_in_customer_id,
        "pass_booking.is_active": "Y", // Assuming is_active is for the pass itself
      });

    if (!getCustomerPass.length) {
      return sendResponse(res, 400, "Pass not found for user");
    }

    return sendResponse(res, 200, "Customer valid pass found", {
      Records: getCustomerPass,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the pass.",
      error
    );
  }
}

async function removePass(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const reservation_id = reqbody.reservation_id || null;

    // Validate the required field
    if (!reservation_id) {
      return sendResponse(res, 400, "Reservation ID is required!");
    }

    // Delete pass from reservation
    const rowsAffected = await global
      .knexConnection("ms_reserve_pass")
      .where({ reservation_id })
      .del();

    // Check if any row was deleted
    if (rowsAffected === 0) {
      return sendResponse(
        res,
        400,
        "No pass found with the provided reservation ID!"
      );
    }

    return sendResponse(res, 200, "Pass removed successfully");
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while removing the pass.",
      error
    );
  }
}

async function getCustomerPassHistory(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const logged_in_customer_id = req["logged_in_customer_id"] || null;

    // Validate customer_id
    if (!logged_in_customer_id) {
      return sendResponse(res, 400, "Customer ID is required!");
    }

    // Fetch customer pass details
    const getCustomerPass = await global
      .knexConnection("pass_booking")
      .select("pass_booking.*")
      .join(
        "ms_customers",
        "ms_customers.customer_id",
        "pass_booking.customer_id"
      )
      .where({
        "ms_customers.customer_id": logged_in_customer_id,
        is_active: "Y",
      });

    // If no passes found, return a message
    if (!getCustomerPass.length) {
      return sendResponse(
        res,
        400,
        "No active passes found for this customer!"
      );
    }

    // Process each pass history asynchronously
    await Promise.all(
      getCustomerPass.map(async (z) => {
        // Format the dates
        z["purches_on"] = moment$1(z.booking_date_time).format("DD/MM/YYYY");
        z["valid_till"] = moment$1(z.booking_date_time)
          .add(z.pass_valid_days, "days")
          .format("DD/MM/YYYY");

        // Get the total number of tickets bought with this pass
        const ticketsBought = await global
          .knexConnection("ms_booking")
          .count("booking_id as total_pass_booked_tickets")
          .where({
            "ms_booking.customer_id": z.customer_id,
            voucher_code: "PASS-" + z.pass_id,
            booking_is_active: "Y",
          });

        z["total_pass_booked_tickets"] =
          ticketsBought[0].total_pass_booked_tickets;
      })
    );
    return sendResponse(
      res,
      200,
      "Customer Pass History retrieved successfully",
      {
        Records: getCustomerPass,
      }
    );
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the pass history.",
      error
    );
  }
}

async function getCustomerTicketHistory(req, res) {
  try {
    const reqbody = { ...req.query, ...req.body, ...req.params };
    const logged_in_customer_id = req["logged_in_customer_id"] || null;

    // Validate customer_id
    if (!logged_in_customer_id) {
      return sendResponse(res, 400, "Customer ID is required!");
    }

    // Fetch customer tickets from the database
    const getCustomerTickets = await global
      .knexConnection("ms_booking")
      .select("ms_booking.*")
      .join(
        "ms_customers",
        "ms_customers.customer_id",
        "ms_booking.customer_id"
      )
      .where({
        "ms_customers.customer_id": logged_in_customer_id,
      });

    // Format the purchase date for each ticket

    getCustomerTickets.forEach((ticket) => {
      ticket["purches_on"] = moment$1(ticket.booking_date_time).format(
        "DD/MM/YYYY"
      );
    });
    return sendResponse(
      res,
      200,
      "Customer Ticket History retrieved successfully",
      {
        Records: getCustomerTickets,
      }
    );
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred while fetching the ticket history.",
      error
    );
  }
}

const router$2 = Router();

function WebsiteRoutes() {
  // GET Routes
  router$2.get("/getCountryList", checkWebsiteSessionExist, getCountryList);
  router$2.get("/getBannerList", checkWebsiteSessionExist, getBannerList);
  router$2.get("/getLanguageList", checkWebsiteSessionExist, getLanguageList);
  router$2.get("/getEventList", checkWebsiteSessionExist, getActiveEventList);
  router$2.get(
    "/getEventListById/:event_id",
    checkWebsiteSessionExist,
    getEventList
  );
  router$2.get("/getCustomerDetail", checkWebsiteSessionExist, getCustomer);
  router$2.get(
    "/getReservationDetails/:reservation_id",
    checkWebsiteSessionExist,
    getReservationSeat
  );
  router$2.get(
    "/resetReserveTimer/:reservation_id",
    checkWebsiteSessionExist,
    resetReserveTime
  );
  router$2.get(
    "/seatRelease/:reservation_id",
    checkWebsiteSessionExist,
    releaseSeats
  );
  router$2.get(
    "/getAllBlockedSeatsBySchedule/:event_sch_id",
    checkWebsiteSessionExist,
    allReserveSeatBySchedule
  );
  router$2.get(
    "/getTransactionByCode/:booking_code",
    checkWebsiteSessionExist,
    getTransactionByCode
  );
  router$2.get(
    "/get-event-extraInfoList/:event_id",
    checkWebsiteSessionExist,
    getEventExtraInfoList
  );
  router$2.get(
    "/getCustomerPassById",
    checkWebsiteSessionExist,
    getCustomerPassById
  );
  router$2.get(
    "/getCustomerPassHistory/:customer_id",
    checkWebsiteSessionExist,
    getCustomerPassHistory
  );
  router$2.get(
    "/getCustomerTicketHistory/:customer_id",
    checkWebsiteSessionExist,
    getCustomerTicketHistory
  );
  router$2.get("/getcinemalist", checkWebsiteSessionExist, getCinemaList);
  router$2.get("/getPassList", checkWebsiteSessionExist, getPassList);
  router$2.get("/getPassById/:pass_id", checkWebsiteSessionExist, getPassList);
  router$2.get("/reservePass/:pass_id", checkWebsiteSessionExist, reservePass);
  router$2.get(
    "/getPassReservationDetails/:reservation_id",
    checkWebsiteSessionExist,
    getReservePassDetails
  );

  // POST Routes
  router$2.post("/signup-customer", checkWebsiteSessionExist, addWebCustomer);
  router$2.post("/verify-otp", checkWebsiteSessionExist, verifyOTPAndUpdateUser);

  router$2.post("/signIn", checkWebsiteSessionExist, customerSignIn);

  router$2.post("/reserveSeats", checkWebsiteSessionExist, addReservationSeat);
  router$2.post(
    "/reserveSeatsIo",
    checkWebsiteSessionExist,
    addReservationSeatsIo
  );
  router$2.post(
    "/reserveSeats-no-sl",
    checkWebsiteSessionExist,
    addReservationSeatWithoutSeatlayout
  );
  router$2.post("/guestCheckout", checkWebsiteSessionExist, addEditGuest);
  router$2.post("/customerSubscribe", checkWebsiteSessionExist, addSubscriber);
  router$2.post(
    "/applyVoucher/:reservation_id",
    checkWebsiteSessionExist,
    applyVoucher
  );
  router$2.post(
    "/removeVoucher/:reservation_id",
    checkWebsiteSessionExist,
    removeVoucher
  );
  router$2.post(
    "/removePass/:reservation_id",
    checkWebsiteSessionExist,
    removePass
  );
  router$2.post(
    "/applyPass/:reservation_id",
    checkWebsiteSessionExist,
    applyPass
  );

  return router$2;
}

async function createTransation(req, res) {
  let reqbody = { ...req.body, ...req.params };
  const { user_info } = req;
  const isWebsiteUser = req["is_website_user"] || false;
  const { reservation_id } = reqbody;
  let checkFields = ["reservation_id"];

  // Validate incoming data
  let result = await checkValidation(checkFields, reqbody);
  if (!result.status) {
    return sendResponse(res, 400, "Validation Error", result);
  }

  try {
    // Fetch reservation details
    let getReservationDetail = await global
      .knexConnection("ms_reservation")
      .where({ reservation_id, is_reserved: "Y" });

    if (!getReservationDetail.length) {
      throw new Error("Reservation not found or seat is released/booked");
    }

    let getPaymentDetail = [];
    let qrUrl = "";

    // If the user is from the website, get payment details
    if (isWebsiteUser) {
      getPaymentDetail = await global
        .knexConnection("ms_payment_booking_detail")
        .select(
          "c_name",
          "email",
          "phone_number",
          "country_code",
          "is_booked",
          "is_guest",
          "customer_id",
          "payment_mode_name",
          "success_frontend_url",
          "failed_frontend_url",
          "payment_transaction_id"
        )
        .leftJoin(
          "ms_payment_mode",
          "ms_payment_mode.pm_id",
          "ms_payment_booking_detail.pm_id"
        )
        .where({ reservation_id, is_paid: "Y" });

      if (!getPaymentDetail.length) {
        return sendResponse(res, 400, "Payment Not Done from Website");
      }
    }

    let currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      getReservationDetail[0].timezone_name
    );

    let event_data_all = await EVENT_DATA({
      event_id: getReservationDetail[0].event_id,
      event_sch_id: getReservationDetail[0].event_sch_id,
    });

    let event_data = event_data_all.Records[0];
    qrUrl = getPaymentDetail[0].success_frontend_url;
    let insertObj = {
      event_id: getReservationDetail[0].event_id,
      schedule_id: getReservationDetail[0].event_sch_id,
      c_email: getPaymentDetail[0]?.email || null,
      c_name: getPaymentDetail[0]?.c_name || null,
      c_country_code: getPaymentDetail[0]?.country_code || null,
      is_guest: getPaymentDetail[0]?.is_guest || null,
      customer_id: getPaymentDetail[0]?.customer_id || 0,
      c_phone_number: getPaymentDetail[0]?.phone_number || null,
      event_name: event_data.event_name,
      cinema_name: event_data.cinema_name,
      cinema_email: event_data.cinema_email || null,
      city_name: event_data.city_name || null,
      country: event_data.country_name || null,
      timezone: event_data.tz_name || null,
      currency: event_data.curr_code || null,
      payment_mode_id: getPaymentDetail[0]?.pm_id || null,
      payment_mode: getPaymentDetail[0]?.payment_mode_name || null,
      booking_type_name: isWebsiteUser ? "Website" : "Box Office",
      event_date: event_data.event_sch_array
        ? event_data.event_sch_array[0].sch_date
        : null,
      event_time: event_data.event_sch_array
        ? event_data.event_sch_array[0].sch_time
        : null,
      booking_date_time: currentDateTimeNew,
      created_by: (user_info && user_info.user_id) || null,
      total_seats: 0,
      seats_scanned: 0,
      seats_tobe_scanned: 0,
      reservation_id,
      payment_transaction_id: getPaymentDetail[0].payment_transaction_id,
      exchange_rate: event_data.exchange_rate || 1,
      pay_currency_id: event_data.pay_currency_id || null,
    };

    let checkExistingBooking = await global.knexConnection("ms_booking").where({
      reservation_id,
    });

    if (checkExistingBooking && checkExistingBooking.length) {
      return sendResponse(res, 400, "Transaction already initiated");
    }

    // Handle seat booking for event seating type "seats_io"
    if (event_data.event_seating_type === "seats_io") {
      let bookSeatsArray = [];
      getReservationDetail.forEach((z) => {
        if (z.row_name && z.row_name === "GA-") {
          bookSeatsArray.push({
            objectId: z.seat_type,
            quantity: parseInt(z.column_name),
          });
        } else {
          bookSeatsArray.push(
            z.seat_type + "-" + z.row_name + "-" + z.column_name
          );
        }
      });

      const seatsio_credential = await SeatsIoCredentialFunction({
        org_id: event_data.org_id,
        setting_key: "seats_io",
      });

      if (seatsio_credential.false) {
        return sendResponse(res, 400, "Seats.io Credential not found");
      }

      const { SEATSIO_SECRET_WORKSPACE_KEY } = seatsio_credential.data;

      let client = new SeatsioClient(Region.EU(), SEATSIO_SECRET_WORKSPACE_KEY);

      try {
        const bookResponse = await client.events.book(
          getReservationDetail[0].seatsio_eventkey,
          bookSeatsArray,
          getReservationDetail[0].seatsio_holdtoken
        );

        for (const key in bookResponse.objects) {
          if (bookResponse.objects.hasOwnProperty(key)) {
            const value = bookResponse.objects[key];
            if (
              value.status.toLowerCase() !== "booked" &&
              value.objectType !== "generalAdmission"
            ) {
              return sendResponse(res, 400, "Issue in Seats.io Booking");
            }
          }
        }
      } catch (error) {
        return sendResponse(res, 500, "Issue in Seats.io Booking", error);
      }
    }

    // Insert booking record into the database
    let insertBookingId = await global
      .knexConnection("ms_booking")
      .insert(insertObj);

    let transaction_array = [];
    let seatNames = [];
    let totalSeats = 0;
    let totalAmount = 0;
    let totalBeforeDiscount = 0;
    let voucher_code = "";
    let discountValue = 0;
    let discountPercent = "";

    getReservationDetail.forEach((z) => {
      if (event_data.event_seating_type === "N") {
        seatNames.push(z.seat_type + "-" + z.no_of_seats);
        totalAmount +=
          parseFloat(z.seat_price) *
          (z.no_of_seats ? parseFloat(z.no_of_seats) : 1);
        totalSeats += parseInt(z.no_of_seats);
      } else {
        seatNames.push(z.seat_type + "-" + z.seat_name);
        totalAmount += parseFloat(z.seat_price);
      }

      totalAmount *= event_data.exchange_rate
        ? parseFloat(event_data.exchange_rate)
        : 1;

      totalBeforeDiscount += totalAmount;

      //check for voucher discount here
      if (z.voucher_applied == "Y") {
        totalAmount -= parseFloat(z.voucher_discount_amount || 0);
        discountValue += parseFloat(z.voucher_discount_amount || 0);
        discountPercent = z.voucher_discount_percent;
        voucher_code = z.voucher_code;
      }

      //check for pass discount here
      if (z.pass_applied == "Y") {
        totalAmount -= parseFloat(z.pass_discount_amount || 0);
        discountValue += parseFloat(z.pass_discount_amount || 0);
        discountPercent = z.pass_discount_percent;
        voucher_code = z.pass_code;
      }

      let obj = {
        booking_id: insertBookingId[0],
        seat_name: z.seat_name,
        seat_type: z.seat_type,
        seat_group_id: z.seat_group_id,
        seat_price: z.seat_price,
        no_of_seats: z.no_of_seats,
      };
      transaction_array.push({ ...obj });
    });

    if (event_data.event_booking_fees && event_data.event_booking_fees > 0) {
      let booking_fee_value =
        (parseFloat(event_data.event_booking_fees) / 100) * totalAmount;
      totalAmount = totalAmount + booking_fee_value;
    }

    if (event_data.event_seating_type === "N") {
      console.log(totalSeats, "totalSeats");
    } else {
      totalSeats = seatNames.length;
    }

    await global
      .knexConnection("ms_booking_transaction")
      .insert(transaction_array);

    let booking_code = event_data.event_prefix_code
      ? event_data.event_prefix_code
      : "TKT";
    let prefix_array = ["00000", "0000", "000", "00", "0"];
    let string_length = String(insertBookingId[0]).length - 1;
    let booking_number_new = prefix_array[string_length]
      ? `${prefix_array[string_length]}${insertBookingId[0]}`
      : insertBookingId[0];
    booking_code += booking_number_new;

    // Update relevant tables after booking
    await global
      .knexConnection("ms_reservation")
      .where({ reservation_id })
      .update({ is_booked: "Y" });

    await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id })
      .update({ is_booked: "Y" });

    await global
      .knexConnection("ms_booking")
      .where({ booking_id: insertBookingId[0] })
      .update({
        booking_code,
        total_seats: totalSeats,
        seats_tobe_scanned: totalSeats,
        seat_names: seatNames.join(", "),
        total_price: totalAmount.toFixed(3),
        voucher_code: voucher_code,
        discount_percent: discountPercent,
        discount_value: discountValue,
        total_before_discount: totalBeforeDiscount,
      });

    return sendResponse(res, 200, "Transaction created successfully", {
      booking_code: booking_code,
    });
  } catch (error) {
    return sendResponse(res, 500, "Transaction creation failed", error);
  }
}

//Skip Payment Gateway when payment amount is 0

const skipPaymentGateway = async (reqbody) => {
  let {
    reservation_id,
    event_data,
    is_guest,
    logged_in_customer_id,
    success_frontend_url,
    failed_frontend_url,
    customer_name,
    customer_email,
    customer_mobile,
    country_code,
    webtoken,
  } = reqbody;

  // Validation for required fields
  if (
    !reservation_id ||
    !event_data ||
    !success_frontend_url ||
    !failed_frontend_url
  ) {
    return { status: false, message: "Missing required fields." };
  }

  const currentDateTimeNew = currentDateTime(
    null,
    "YYYY-MM-DD HH:mm:ss",
    event_data[0].tz_name
  );

  // Check if the customer exists in the database
  let checkGuest = is_guest;

  try {
    if (!logged_in_customer_id) {
      checkGuest = "Y";
      logged_in_customer_id = 0;
    } else {
      checkGuest = "N";
      logged_in_customer_id = logged_in_customer_id;
    }

    // Insert payment details into the database
    const insertPaymentDetail = {
      reservation_id,
      success_frontend_url,
      failed_frontend_url,
      c_name: customer_name,
      email: customer_email,
      phone_number: customer_mobile,
      country_code,
      is_guest: checkGuest,
      customer_id: logged_in_customer_id,
      created_at: currentDateTimeNew,
      pm_id: 1,
      is_booked: "Y",
      is_paid: "Y",
    };

    await global
      .knexConnection("ms_payment_booking_detail")
      .insert(insertPaymentDetail);

    // Get the base URL for the backend
    const [BACKEND_URL] = await global.knexConnection("global_options").where({
      go_key: "BASE_URL_BACKEND",
    });
    const BASEURL = BACKEND_URL ? BACKEND_URL.go_value : "";

    if (!BASEURL) {
      return { status: false, message: "Backend URL not found." };
    }

    // Make the request to the transaction API
    const config = {
      method: "post",
      url: `${BASEURL}/payment/createTransation/${reservation_id}`,
      headers: {
        Authorization: webtoken,
      },
    };

    const transactionResponse = await axios$1(config);

    // Handle the transaction response and determine the redirect URL
    let redirectToUrl = failed_frontend_url; // Default to failed URL
    if (
      transactionResponse?.data?.status &&
      transactionResponse.data.booking_code
    ) {
      redirectToUrl = `${success_frontend_url}/${transactionResponse.data.booking_code}`;
    } else {
      console.log("Transaction failed:", transactionResponse?.data);
    }

    return {
      message: "Payment skipped successfully",
      status: true,
      redirectTo: redirectToUrl,
    };
  } catch (error) {
    return sendResponse(res, 500, "Transaction creation failed", error);
  }
};

async function tapPaymentCheckout(req, res) {
  const {
    reservation_id,
    customer_name,
    customer_id,
    customer_email,
    customer_mobile,
    country_code,
    is_guest,
    success_frontend_url,
    failed_frontend_url,
  } = req.body;
  let logged_in_customer_id = req["logged_in_customer_id"] || null;

  try {
    // Validate required fields
    const requiredFields = [
      "reservation_id",
      "customer_email",
      "customer_mobile",
      "is_guest",
      "success_frontend_url",
      "failed_frontend_url",
    ];
    const validationResult = await checkValidation(requiredFields, req.body);
    if (!validationResult.status) {
      return sendResponse(res, 400, "Validation Error", validationResult);
    }

    // Check if payment has already been initiated for this reservation
    const paymentDetailExists = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id });

    if (paymentDetailExists.length) {
      return sendResponse(res, 400, "Payment Already Initiated");
    }

    // Check reservation status
    const checkReservation = await global
      .knexConnection("ms_reservation")
      .where({ is_reserved: "Y", reservation_id });

    if (checkReservation.length === 0) {
      return sendResponse(res, 400, "Invalid Reservation");
    }

    // Get event data
    const event_data_all = await EVENT_DATA({
      event_id: checkReservation[0].event_id,
      event_sch_id: checkReservation[0].event_sch_id,
    });

    let event_data = event_data_all.Records;

    // Retrieve backend URL for redirection
    const [BACKEND_URL] = await global
      .knexConnection("global_options")
      .where({ go_key: "BASE_URL_BACKEND" });
    const webtoken = req.header("authorization");
    const BASEURL = BACKEND_URL.go_value;
    const redirectUrl = `${BASEURL}/payment/confirmTapPayment?reservation_id=${reservation_id}&event_token=${webtoken}`;

    // Check if organization data exists
    if (!event_data[0].org_id) {
      return sendResponse(res, 400, "Invalid organization");
    }

    // Fetch payment credentials
    const payment_credential = await PaymentCredentialFunction({
      org_id: event_data[0].org_id,
      setting_key: "tap_pay_payment",
    });

    if (payment_credential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }

    const { MERCHANT_ID, SOURCE_ID, URL, PAYTAP_SECRET_KEY } =
      payment_credential.data;

    if (!MERCHANT_ID || !SOURCE_ID || !URL || !PAYTAP_SECRET_KEY) {
      return sendResponse(res, 400, "Missing Payment Data");
    }

    // Get payment currency
    const paymentCurrencyData = await global
      .knexConnection("ms_currencies")
      .select("curr_code")
      .where({ curr_id: event_data[0].pay_currency_id, curr_is_active: "Y" });

    if (!paymentCurrencyData.length) {
      return sendResponse(res, 400, "Add Payment Currency in cinema");
    }

    let paymentCurrency = paymentCurrencyData[0].curr_code;

    // Calculate total amount
    let totalAmount = 0;
    checkReservation.forEach((z) => {
      if (event_data[0].event_seating_type === "N") {
        totalAmount +=
          parseFloat(z.seat_price) *
          (z.no_of_seats ? parseFloat(z.no_of_seats) : 1);
      } else {
        totalAmount += parseFloat(z.seat_price);
      }

      totalAmount *= event_data[0].exchange_rate
        ? parseFloat(event_data[0].exchange_rate)
        : 1;

      //check for voucher discount here
      if (z.voucher_applied == "Y") {
        totalAmount -= parseFloat(z.voucher_discount_amount || 0);
      }

      //check for pass discount here
      if (z.pass_applied == "Y") {
        totalAmount -= parseFloat(z.pass_discount_amount || 0);
      }
    });

    // Skip payment if total amount is zero
    if (totalAmount <= 0) {
      const skipBookingData = await skipPaymentGateway({
        reservation_id,
        event_data,
        is_guest,
        logged_in_customer_id,
        success_frontend_url,
        failed_frontend_url,
        customer_name,
        customer_email,
        customer_mobile,
        country_code,
        webtoken,
      });

      return sendResponse(
        res,
        200,
        "Success",
        {
          data: skipBookingData.status
            ? skipBookingData.redirectTo
            : failed_frontend_url,
        },
        skipBookingData.status ? true : false
      );
    }

    // Prepare the payment request object
    const tapPaymentObject = {
      amount: totalAmount.toFixed(2),
      currency: paymentCurrency,
      threeDSecure: true,
      save_card: false,
      customer_initiated: true,
      description: "",
      statement_descriptor: "Sample",
      metadata: { udf1: "test 1", udf2: "test 2" },
      reference: {
        transaction: `trx_${reservation_id}`,
        order: reservation_id,
      },
      receipt: { email: true, sms: false },
      customer: {
        first_name: "-",
        last_name: "-",
        email: customer_email,
        phone: { country_code, number: customer_mobile },
      },
      merchant: { id: MERCHANT_ID },
      source: { id: SOURCE_ID },
      redirect: { url: redirectUrl },
    };

    const paymentData = JSON.stringify(tapPaymentObject);
    const config = {
      method: "post",
      url: URL,
      headers: {
        Authorization: `Bearer ${PAYTAP_SECRET_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      data: paymentData,
    };

    // Make the API request to TapPay
    const response = await axios.request(config);

    // Handle customer verification and insert payment details
    let currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      event_data[0].tz_name
    );
    let checkGuest = is_guest;

    if (!logged_in_customer_id) {
      checkGuest = "Y";
      logged_in_customer_id = 0;
    } else {
      checkGuest = "N";
      logged_in_customer_id = logged_in_customer_id;
    }

    const insertPaymentDetail = {
      reservation_id,
      success_frontend_url,
      failed_frontend_url,
      c_name: customer_name,
      email: customer_email,
      phone_number: customer_mobile,
      country_code,
      is_guest: checkGuest,
      customer_id: logged_in_customer_id,
      created_at: currentDateTimeNew,
      pm_id: 1,
      payment_request: paymentData,
    };

    await global
      .knexConnection("ms_payment_booking_detail")
      .insert(insertPaymentDetail);
    return sendResponse(res, 200, "Success", {
      payment_mode: "tappay",
      data: response.data.transaction.url,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An error occurred during the payment process.",
      error
    );
  }
}
async function confirmTapPayment(req, res) {
  const { reservation_id, event_token, tap_id } = req.query;

  try {
    // Fetch payment and reservation details
    const [detailPayment] = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id });
    const [reservationDetail] = await global
      .knexConnection("ms_reservation")
      .select("ms_reservation.*", "ms_event.org_id", "ms_event.event_is_active")
      .leftJoin("ms_event", "ms_event.event_id", "ms_reservation.event_id")
      .where({ reservation_id, event_is_active: "Y" });

    if (!detailPayment || !reservationDetail) {
      return sendResponse(res, 400, "Detail Not Found");
    }

    const { success_frontend_url, failed_frontend_url } = detailPayment;
    const { org_id } = reservationDetail;

    // Fetch payment credentials
    const paymentCredential = await PaymentCredentialFunction({
      org_id,
      setting_key: "tap_pay_payment",
    });

    if (paymentCredential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }

    const { MERCHANT_ID, SOURCE_ID, URL, PAYTAP_SECRET_KEY } =
      paymentCredential.data;

    if (!MERCHANT_ID || !SOURCE_ID || !URL || !PAYTAP_SECRET_KEY) {
      return sendResponse(res, 400, "Invalid Payment Credentials");
    }

    // Make the API request to TapPay to get payment status
    const paymentStatusResponse = await axios.get(`${URL}/${tap_id}`, {
      headers: {
        Authorization: `Bearer ${PAYTAP_SECRET_KEY}`,
        Accept: "application/json",
      },
    });

    const paymentStatus = paymentStatusResponse.data.status.toUpperCase();

    if (paymentStatus === "CAPTURED") {
      // Payment successful, update payment details
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id })
        .update({
          is_paid: "Y",
          payment_capture: JSON.stringify(paymentStatusResponse.data),
        });

      // Prepare the redirect URL for successful payment
      const [BACKEND_URL] = await global
        .knexConnection("global_options")
        .where({ go_key: "BASE_URL_BACKEND" });

      const BASEURL = BACKEND_URL.go_value;
      const transactionResponse = await axios.post(
        `${BASEURL}/payment/createTransation/${reservation_id}`,
        {},
        { headers: { Authorization: event_token } }
      );

      if (transactionResponse?.data?.status) {
        return res.redirect(
          `${success_frontend_url}/${transactionResponse.data.booking_code}`
        );
      } else {
        console.log("Failed to create transaction");
        return res.redirect(failed_frontend_url);
      }
    } else {
      // Payment failed, update payment capture and redirect to failure URL
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id })
        .update({
          payment_capture: JSON.stringify({
            ...paymentStatusResponse.data,
            queryData: req.query,
          }),
        });

      return res.redirect(failed_frontend_url);
    }
  } catch (error) {
    winstonLogger$1.error("Error in payonePayment.js 2:", error);
    console.error("Error in confirmTapPayment:", error);

    // If an error occurs, update payment capture and redirect to failure URL
    await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id })
      .update({
        payment_capture: JSON.stringify(req.query),
      });

    return res.redirect(failed_frontend_url);
  }
}

async function payonePaymentCheckout(req, res) {
  const {
    reservation_id,
    customer_name,
    customer_id,
    customer_email,
    customer_mobile,
    country_code,
    is_guest,
    success_frontend_url,
    failed_frontend_url,
  } = req.body;
  let logged_in_customer_id = req["logged_in_customer_id"] || null;
  const webtoken = req.header("authorization");

  // Check for required fields
  const requiredFields = [
    "reservation_id",
    "customer_email",
    "customer_mobile",
    "is_guest",
    "success_frontend_url",
    "failed_frontend_url",
  ];
  const validationResult = await checkValidation(requiredFields, req.body);

  if (!validationResult.status) {
    return sendResponse(res, 400, "Validation Error", validationResult);
  }

  try {
    // Check if payment has already been initiated
    const paymentDetail = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id });
    if (paymentDetail.length) {
      return sendResponse(
        res,
        400,
        "Payment Already Initiated with reservation id"
      );
    }

    // Validate reservation
    const reservation = await global
      .knexConnection("ms_reservation")
      .where({ is_reserved: "Y", reservation_id });
    if (reservation.length === 0) {
      return sendResponse(res, 400, "Invalid reservation id");
    }

    // Fetch event data
    const event_data_all = await EVENT_DATA({
      event_id: reservation[0].event_id,
      event_sch_id: reservation[0].event_sch_id,
    });
    const event_data = event_data_all.Records;
    if (!event_data[0].org_id) {
      return sendResponse(res, 400, "Invalid organization");
    }

    // Get payment credentials
    const paymentCredential = await PaymentCredentialFunction({
      org_id: event_data[0].org_id,
      setting_key: "payone_payment",
    });
    if (paymentCredential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }

    const { MERCHANT_ID, URL, SECRET_KEY } = paymentCredential.data;
    if (!MERCHANT_ID || !URL || !SECRET_KEY) {
      return sendResponse(res, 400, "Missing Payment Data");
    }

    // Calculate total amount
    let totalAmount = 0;
    reservation.forEach((z) => {
      if (event_data[0].event_seating_type === "N") {
        totalAmount +=
          parseFloat(z.seat_price) *
          (z.no_of_seats ? parseFloat(z.no_of_seats) : 1);
      } else {
        totalAmount += parseFloat(z.seat_price);
      }
      totalAmount *= event_data[0].exchange_rate
        ? parseFloat(event_data[0].exchange_rate)
        : 1;

      //check for voucher discount here
      if (z.voucher_applied == "Y") {
        totalAmount -= parseFloat(z.voucher_discount_amount || 0);
      }

      //check for pass discount here
      if (z.pass_applied == "Y") {
        totalAmount -= parseFloat(z.pass_discount_amount || 0);
      }
    });

    // Skip payment if total amount is zero
    if (totalAmount <= 0) {
      const skipBookingData = await skipPaymentGateway({
        reservation_id,
        event_data,
        is_guest,
        logged_in_customer_id,
        success_frontend_url,
        failed_frontend_url,
        customer_name,
        customer_email,
        customer_mobile,
        country_code,
        webtoken,
      });

      return sendResponse(res, 200, "Success", {
        data: skipBookingData.status
          ? skipBookingData.redirectTo
          : failed_frontend_url,
      });
    }

    // Fetch payment currency data
    const paymentCurrencyData = await global
      .knexConnection("ms_currencies")
      .select("curr_code", "curr_id", "curr_name", "curr_iso")
      .where({ curr_id: event_data[0].pay_currency_id, curr_is_active: "Y" });
    if (!paymentCurrencyData.length) {
      return sendResponse(res, 400, "Add Payment Currency");
    }

    const paymentCurrencyIso = paymentCurrencyData[0].curr_iso;

    // Create payment object
    const redirectUrl = `${BASEURL}/payment/confirmPayonePayment?reservation_id_token=${reservation_id}///${webtoken}`;
    const PaymentObject = {
      Amount: totalAmount * 1000,
      Channel: 0,
      CurrencyISOCode: parseInt(paymentCurrencyIso),
      MerchantID: MERCHANT_ID,
      MessageID: 1,
      ResponseBackURL: redirectUrl,
      TransactionID: "RESERVEID" + reservation_id,
    };

    // Generate hash code for security
    const hashCodeString =
      SECRET_KEY +
      PaymentObject.Amount +
      PaymentObject.Channel +
      PaymentObject.CurrencyISOCode +
      PaymentObject.MerchantID +
      PaymentObject.MessageID +
      PaymentObject.ResponseBackURL +
      PaymentObject.TransactionID;
    const hashCode = createHash("sha256").update(hashCodeString).digest("hex");
    PaymentObject["hashCode"] = hashCode;

    // Build the payment form
    const formbody = `<form id="nonseamless" method="post" action="${URL}" name="redirectForm">
      <input name="Amount" type="hidden" value="${PaymentObject.Amount}"/>
      <input name="Channel" type="hidden" value="${PaymentObject.Channel}"/>
      <input name="CurrencyISOCode" type="hidden" value="${PaymentObject.CurrencyISOCode}"/>
      <input name="MerchantID" type="hidden" value="${PaymentObject.MerchantID}"/>
      <input name="MessageID" type="hidden" value="${PaymentObject.MessageID}"/>
      <input name="ResponseBackURL" type="hidden" value="${PaymentObject.ResponseBackURL}"/>
      <input name="TransactionID" type="hidden" value="${PaymentObject.TransactionID}"/>
      <input name="SecureHash" type="hidden" value="${hashCode}"/>
    </form>`;

    // Insert payment details into DB
    const currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      event_data[0].tz_name
    );
    let checkGuest = is_guest;

    if (!logged_in_customer_id) {
      checkGuest = "Y";
      logged_in_customer_id = 0;
    } else {
      checkGuest = "N";
      logged_in_customer_id = logged_in_customer_id;
    }

    const paymentDetails = {
      reservation_id,
      success_frontend_url,
      failed_frontend_url,
      c_name: customer_name,
      email: customer_email,
      phone_number: customer_mobile,
      country_code,
      is_guest: checkGuest,
      customer_id: logged_in_customer_id,
      created_at: currentDateTimeNew,
      pm_id: 2,
      payment_request: JSON.stringify(PaymentObject),
      payment_transaction_id: PaymentObject.TransactionID,
    };

    await global
      .knexConnection("ms_payment_booking_detail")
      .insert(paymentDetails);
    return sendResponse(res, 200, "Success", {
      payment_mode: "payone",
      data: formbody,
    });
  } catch (error) {
    return sendResponse(
      res,
      400,
      "An error occurred in payonePayment.js",
      error
    );
  }
}

async function confirmPayonePayment(req, res) {
  const { reservation_id_token } = req.query;
  const reservation_id = reservation_id_token.split("///")[0];
  const event_token = reservation_id_token.split("///")[1];

  const body = req.body;

  try {
    // Get payment booking detail and reservation details
    const detailPayment = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id });

    if (!detailPayment.length) {
      throw new Error("Payment detail not found");
    }

    const reservation_detail = await global
      .knexConnection("ms_reservation")
      .select("ms_reservation.*", "ms_event.org_id", "ms_event.event_is_active")
      .leftJoin("ms_event", "ms_event.event_id", "ms_reservation.event_id")
      .where({ reservation_id, event_is_active: "Y" });

    if (!reservation_detail.length) {
      throw new Error("Reservation detail not found or event is inactive");
    }

    // Extract necessary fields from payment detail
    const {
      success_frontend_url,
      failed_frontend_url,
      payment_request,
      payment_transaction_id,
    } = detailPayment[0];
    const success_redirect_url = success_frontend_url;
    const failed_redirect_url = failed_frontend_url;

    // Parse payment request and calculate values
    const requestedPayload = JSON.parse(payment_request);
    const requestHash = requestedPayload.hashCode;
    const requestPaymentAmt =
      parseFloat(requestedPayload.Amount) / 1000 + " JOD";
    const transaction_date_frontend = moment().format("DD/MM/YYYY, h:mm:ss");

    const getPaymentStatusCode = body["Response.StatusCode"];
    const getGatewayStatusDescription =
      body["Response.GatewayStatusDescription"];
    const responseHash = body["Response.SecureHash"];
    const paymentMessage = body["Response.StatusDescription"];

    // Check if payment is approved
    if (
      (getGatewayStatusDescription === "APPROVED" ||
        getGatewayStatusDescription === "approved") &&
      getPaymentStatusCode === "00000"
    ) {
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id })
        .update({
          is_paid: "Y",
          recheck_payment: "N",
          payment_capture: JSON.stringify(body),
        });

      const [BACKEND_URL] = await global
        .knexConnection("global_options")
        .where({ go_key: "BASE_URL_BACKEND" });

      if (!BACKEND_URL) {
        throw new Error("Backend URL not found");
      }

      const BASEURL = BACKEND_URL.go_value;

      // Make the transaction request
      const config = {
        method: "post",
        url: `${BASEURL}/payment/createTransation/${reservation_id}`,
        headers: {
          Authorization: event_token,
        },
      };

      const transactionResponse = await axios(config);

      if (transactionResponse.data && transactionResponse.data.status) {
        return res.redirect(
          `${success_redirect_url}/${transactionResponse.data.booking_code}?message=${paymentMessage}`
        );
      } else {
        throw new Error("Transaction creation failed");
      }
    } else {
      // If payment is not approved
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id })
        .update({
          recheck_payment: "N",
          payment_capture: JSON.stringify({
            ...body,
            queryData: req.query,
          }),
        });

      return res.redirect(
        `${failed_redirect_url}?message=${paymentMessage}&amount=${requestPaymentAmt}&transaction_id=${payment_transaction_id}&date=${transaction_date_frontend}`
      );
    }
  } catch (error) {
    winstonLogger$1.error("Error in payonePayment.js 2:", error);
    console.error("Error during Payone payment confirmation:", error.message);
    await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id })
      .update({
        payment_capture: JSON.stringify(req.query),
      });

    return res.redirect(
      `${failed_redirect_url}?message=${error.message}&amount=${
        body["Response.Amount"]
      }&transaction_id=${body["Response.TransactionID"]}&date=${moment().format(
        "DD/MM/YYYY, h:mm:ss"
      )}`
    );
  }
}

async function payonePassPaymentCheckout(req, res) {
  try {
    const { user_info } = req;
    const reqbody = req.body;

    const {
      reservation_id,
      customer_name,
      customer_id,
      customer_email,
      customer_mobile,
      country_code,
      is_guest,
      success_frontend_url,
      failed_frontend_url,
    } = reqbody;

    // Validate required fields
    const requiredFields = [
      "reservation_id",
      "customer_email",
      "customer_mobile",
      "is_guest",
      "success_frontend_url",
      "failed_frontend_url",
    ];

    const validationResult = await checkValidation(requiredFields, reqbody);
    if (!validationResult.status) {
      return sendResponse(res, 400, "Validation Error", validationResult);
    }

    // Check if payment already exists for the reservation
    const paymentDetailC = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id });

    if (paymentDetailC.length) {
      return sendResponse(
        res,
        400,
        "Payment already initiated with this reservation ID."
      );
    }

    // Check if the reservation is valid and reserved
    const checkReservation = await global
      .knexConnection("ms_pass_reservation")
      .where({ p_is_reserved: "Y", p_reservation_id: reservation_id });

    if (!checkReservation.length) {
      return sendResponse(
        res,
        400,
        "Reservation not found or pass already released."
      );
    }

    // Get pass details
    const getPassDetail = await global
      .knexConnection("movie_event_pass")
      .select("movie_event_pass.*", "ms_currencies.curr_code")
      .leftJoin(
        "ms_currencies",
        "ms_currencies.curr_id",
        "movie_event_pass.pass_currency_id"
      )
      .where({
        "movie_event_pass.pass_id": checkReservation[0].pass_id,
        "movie_event_pass.pass_is_active": "Y",
      });

    if (!getPassDetail.length || !getPassDetail[0].org_id) {
      return sendResponse(res, 400, "Invalid or inactive pass organization.");
    }

    // Fetch payment credentials for the organization
    const paymentCredential = await PaymentCredentialFunction({
      org_id: getPassDetail[0].org_id,
      setting_key: "payone_payment",
    });

    if (paymentCredential.false) {
      return sendResponse(res, 400, "Invalid payment mode or credentials.");
    }

    const { MERCHANT_ID, URL, SECRET_KEY } = paymentCredential.data;

    if (!MERCHANT_ID || !URL || !SECRET_KEY) {
      return sendResponse(res, 400, "Invalid payment mode or credentials.");
    }

    // Prepare transaction details and hash
    let totalAmount = parseFloat(checkReservation[0].pass_total_price);
    const paymentCurrencyData = await global
      .knexConnection("ms_currencies")
      .select("curr_code", "curr_id", "curr_name", "curr_iso")
      .where({
        curr_id: getPassDetail[0].pass_currency_id,
        curr_is_active: "Y",
      });

    if (!paymentCurrencyData.length) {
      return sendResponse(
        res,
        400,
        "No valid payment currency found for the pass."
      );
    }

    const paymentCurrencyIso = paymentCurrencyData[0].curr_iso;
    const redirectUrl = `${BASEURL}/payment/confirmPassPayonePayment?reservation_id_token=${reservation_id}///${req.header(
      "authorization"
    )}`;

    let PaymentObject = {
      Amount: totalAmount * 1000, // Convert to smallest currency unit (e.g., cents)
      Channel: 0,
      CurrencyISOCode: parseInt(paymentCurrencyIso),
      MerchantID: MERCHANT_ID,
      MessageID: 1,
      ResponseBackURL: redirectUrl,
      TransactionID: `PASS${Math.floor(Math.random() * 90000) + 10000}`,
    };

    const hashCodeString =
      SECRET_KEY +
      PaymentObject.Amount +
      PaymentObject.Channel +
      PaymentObject.CurrencyISOCode +
      PaymentObject.MerchantID +
      PaymentObject.MessageID +
      PaymentObject.ResponseBackURL +
      PaymentObject.TransactionID;

    const hashCode = createHash("sha256").update(hashCodeString).digest("hex");
    PaymentObject.hashCode = hashCode;

    // Create the HTML form for redirection
    const formBody = `
        <form id="nonseamless" method="post" action="${URL}" name="redirectForm">
          <input name="Amount" type="hidden" value="${PaymentObject.Amount}"/>
          <input name="Channel" type="hidden" value="${PaymentObject.Channel}"/>
          <input name="CurrencyISOCode" type="hidden" value="${PaymentObject.CurrencyISOCode}"/>
          <input name="MerchantID" type="hidden" value="${PaymentObject.MerchantID}"/>
          <input name="MessageID" type="hidden" value="${PaymentObject.MessageID}"/>
          <input name="ResponseBackURL" type="hidden" value="${PaymentObject.ResponseBackURL}"/>
          <input name="TransactionID" type="hidden" value="${PaymentObject.TransactionID}"/>
          <input name="SecureHash" type="hidden" value="${hashCode}"/>
        </form>
      `;

    // Handle guest/customer check
    let checkGuest = is_guest;
    let logged_in_customer_id = req["logged_in_customer_id"] || null;

    if (!logged_in_customer_id) {
      checkGuest = "Y";
      logged_in_customer_id = 0;
    } else {
      checkGuest = "N";
      logged_in_customer_id = logged_in_customer_id;
    }

    // Check if the customer has already bought the pass
    if (logged_in_customer_id && logged_in_customer_id > 0) {
      const existingPass = await global
        .knexConnection("pass_booking")
        .select("pass_booking.pass_id")
        .where({ customer_id: logged_in_customer_id, is_active: "Y" });

      if (existingPass.length) {
        return sendResponse(res, 400, "Pass already bought for this customer.");
      }
    }

    // Insert payment details into the database
    const currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      "Pacific/Yap"
    );
    const insertPaymentDetail = {
      reservation_id,
      success_frontend_url,
      failed_frontend_url,
      c_name: customer_name,
      email: customer_email,
      phone_number: customer_mobile,
      country_code,
      is_guest: checkGuest,
      customer_id: logged_in_customer_id,
      created_at: currentDateTimeNew,
      pm_id: 2,
      payment_request: JSON.stringify(PaymentObject),
      payment_transaction_id: PaymentObject.TransactionID,
    };

    await global
      .knexConnection("ms_payment_booking_detail")
      .insert(insertPaymentDetail);
    return sendResponse(res, 200, "Success", {
      payment_mode: "payone",
      data: formBody,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "An unexpected error occurred in payone payment checkout.",
      error
    );
  }
}

async function confirmPassPayonePayment(req, res) {
  const { reservation_id_token } = req.query;

  if (!reservation_id_token) {
    return sendResponse(res, 400, "Missing reservation_id_token in query.");
  }

  const [reservation_id, event_token] = reservation_id_token.split("///");

  if (!reservation_id || !event_token) {
    return sendResponse(res, 400, "Invalid reservation_id_token format.");
  }

  const body = req.body;

  // Fetch payment details from the database
  let detailPayment = await global
    .knexConnection("ms_payment_booking_detail")
    .where({ reservation_id })
    .first(); // Using `.first()` to directly get the single record

  if (!detailPayment) {
    return sendResponse(
      res,
      400,
      "Payment details not found for this reservation."
    );
  }

  const {
    success_frontend_url,
    failed_frontend_url,
    payment_request,
    payment_transaction_id,
  } = detailPayment;
  const failed_redirect_url = failed_frontend_url;

  let requestedPayload = JSON.parse(payment_request); // Safely parse payment request

  requestedPayload.hashCode;
  const requestPaymentAmt = parseFloat(requestedPayload.Amount) / 1000 + " JOD";
  const transaction_date_frontend = moment$1().format("DD/MM/YYYY, h:mm:ss");
  const getPaymentStatusCode = body["Response.StatusCode"];
  const getGatewayStatusDescription = body["Response.GatewayStatusDescription"];
  body["Response.SecureHash"];
  const paymentMessage = body["Response.StatusDescription"];

  try {
    // Check for successful payment
    if (
      (getGatewayStatusDescription === "APPROVED" ||
        getGatewayStatusDescription === "approved") &&
      getPaymentStatusCode === "00000"
    ) {
      // Update payment status to "paid"
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id })
        .update({
          is_paid: "Y",
          recheck_payment: "N",
          payment_capture: JSON.stringify(body),
        });

      const [BACKEND_URL] = await global
        .knexConnection("global_options")
        .where({ go_key: "BASE_URL_BACKEND" });

      if (!BACKEND_URL) {
        console.error("BASE_URL_BACKEND not found.");
        return sendResponse(res, 400, "Backend URL not configured.");
      }

      const BASEURL = BACKEND_URL.go_value;

      const config = {
        method: "post",
        url: `${BASEURL}/payment/createPassTransation/${reservation_id}`,
        headers: {
          Authorization: event_token,
        },
      };

      let transactionResponse;
      try {
        transactionResponse = await axios$1(config);
      } catch (axiosError) {
        return sendResponse(
          res,
          500,
          "Error during transaction API call.",
          axiosError
        );
      }

      if (
        transactionResponse &&
        transactionResponse.data &&
        transactionResponse.data.status
      ) {
        return res.redirect(
          `${failed_redirect_url}?message=${paymentMessage}&amount=${requestPaymentAmt}&transaction_id=${payment_transaction_id}&date=${transaction_date_frontend}`
        );
      } else {
        console.error("Transaction failed:", transactionResponse);
        return res.redirect(
          `${failed_redirect_url}?message=Transaction Failed&amount=${requestPaymentAmt}&transaction_id=${payment_transaction_id}&date=${transaction_date_frontend}`
        );
      }
    } else {
      // Handle failed payment case
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id })
        .update({
          recheck_payment: "N",
          payment_capture: JSON.stringify({
            ...body,
            queryData: req.query,
          }),
        });

      return res.redirect(
        `${failed_redirect_url}?message=${paymentMessage}&amount=${requestPaymentAmt}&transaction_id=${payment_transaction_id}&date=${transaction_date_frontend}`
      );
    }
  } catch (error) {
    winstonLogger$1.error("Error in payonePassPayment.js 5:", error);
    console.error("Error during payment confirmation:", error);
    await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id })
      .update({
        payment_capture: JSON.stringify(req.query),
      });

    return res.redirect(
      `${failed_redirect_url}?message=${paymentMessage}&amount=${requestPaymentAmt}&transaction_id=${payment_transaction_id}&date=${transaction_date_frontend}`
    );
  }
}

async function createPassTransation(req, res) {
  try {
    let reqbody = { ...req.body, ...req.params };
    const { user_info } = req;
    const isWebsiteUser = req["is_website_user"] || false;
    const { reservation_id } = reqbody;

    // Validate the reservation_id
    let checkFields = ["reservation_id"];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    let getReservationDetail = await global
      .knexConnection("ms_pass_reservation")
      .where({
        p_reservation_id: reservation_id,
        p_is_reserved: "Y",
      });

    if (!getReservationDetail.length) {
      return sendResponse(res, 400, "Reservation not found or already booked.");
    }

    let getPaymentDetail = [];
    let qrUrl = "";

    // Check for website user payment details
    if (isWebsiteUser) {
      getPaymentDetail = await global
        .knexConnection("ms_payment_booking_detail")
        .select(
          "c_name",
          "email",
          "phone_number",
          "country_code",
          "is_booked",
          "is_guest",
          "customer_id",
          "payment_mode_name",
          "success_frontend_url",
          "failed_frontend_url",
          "payment_transaction_id"
        )
        .leftJoin(
          "ms_payment_mode",
          "ms_payment_mode.pm_id",
          "ms_payment_booking_detail.pm_id"
        )
        .where({
          reservation_id,
          is_paid: "Y",
        });

      if (!getPaymentDetail.length) {
        return sendResponse(
          res,
          400,
          "Payment not completed from the website."
        );
      }
    }

    let currentDateTimeNew = currentDateTime(
      null,
      "YYYY-MM-DD HH:mm:ss",
      "Asia/Bahrain"
    );

    let getPassDetail;

    getPassDetail = await global
      .knexConnection("movie_event_pass")
      .select("movie_event_pass.*", "ms_currencies.curr_code")
      .leftJoin(
        "ms_currencies",
        "ms_currencies.curr_id",
        "movie_event_pass.pass_currency_id"
      )
      .where({
        "movie_event_pass.pass_id": getReservationDetail[0].pass_id,
        "movie_event_pass.pass_is_active": "Y",
      });

    let event_data = getPassDetail[0];
    qrUrl = getPaymentDetail[0].success_frontend_url;

    let insertObj = {
      pass_id: getReservationDetail[0].pass_id,
      pass_name: event_data.pass_name,
      pass_price: parseFloat(getReservationDetail[0].pass_price),
      pass_tax_percent: parseFloat(getReservationDetail[0].pass_tax_percent),
      pass_tax_value: parseFloat(getReservationDetail[0].pass_tax_value),
      pass_total_price: parseFloat(getReservationDetail[0].pass_total_price),
      pass_discount_percent: parseFloat(event_data.pass_discount_value),
      pass_valid_days: parseFloat(event_data.pass_valid_days),
      c_email:
        getPaymentDetail[0] && getPaymentDetail[0].email
          ? getPaymentDetail[0].email
          : null,
      c_name:
        getPaymentDetail[0] && getPaymentDetail[0].c_name
          ? getPaymentDetail[0].c_name
          : null,
      c_country_code:
        getPaymentDetail[0] && getPaymentDetail[0].country_code
          ? getPaymentDetail[0].country_code
          : null,
      is_guest:
        getPaymentDetail[0] && getPaymentDetail[0].is_guest
          ? getPaymentDetail[0].is_guest
          : null,
      customer_id:
        getPaymentDetail[0] && getPaymentDetail[0].customer_id
          ? getPaymentDetail[0].customer_id
          : 0,
      c_phone_number:
        getPaymentDetail[0] && getPaymentDetail[0].phone_number
          ? getPaymentDetail[0].phone_number
          : null,
      currency: event_data.curr_code || null,
      payment_mode_id:
        getPaymentDetail[0] && getPaymentDetail[0].pm_id
          ? getPaymentDetail[0].pm_id
          : null,
      payment_mode:
        getPaymentDetail[0] && getPaymentDetail[0].payment_mode_name
          ? getPaymentDetail[0].payment_mode_name
          : null,
      booking_type_name: isWebsiteUser ? "Website" : "Box Office",
      booking_date_time: currentDateTimeNew,
      reservation_id,
      payment_transaction_id: getPaymentDetail[0].payment_transaction_id,
    };

    // Check if the booking already exists

    let checkExistingBooking = await global
      .knexConnection("pass_booking")
      .where({
        reservation_id,
      });

    if (checkExistingBooking.length) {
      return sendResponse(
        res,
        400,
        "Transaction already initiated for this reservation."
      );
    }

    let insertBookingId = await global
      .knexConnection("pass_booking")
      .insert(insertObj);

    let booking_code = "PASS";
    let prefix_array = ["00000", "0000", "000", "00", "0"];
    let string_length = String(insertBookingId[0]).length - 1;
    let booking_number_new = prefix_array[string_length]
      ? `${prefix_array[string_length]}${insertBookingId[0]}`
      : insertBookingId[0];
    booking_code += booking_number_new;

    await global
      .knexConnection("ms_pass_reservation")
      .where({ p_reservation_id: reservation_id })
      .update({
        p_is_booked: "Y",
      });

    await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id })
      .update({
        is_booked: "Y",
      });
    return sendResponse(res, 200, "Transaction created successfully.", {
      booking_code: booking_code,
    });
  } catch (error) {
    return sendResponse(
      res,
      500,
      "Error updating reservation and payment status.",
      error
    );
  }
}

async function mpgsPaymentCheckout(req, res) {
  try {
    let BASEURL = ``;
    // @ts-ignore
    let reqbody = req.body;
    const { user_info } = req;
    let logged_in_customer_id = req["logged_in_customer_id"] || null;
    const {
      reservation_id,
      customer_name,
      customer_id,
      customer_email,
      customer_mobile,
      country_code,
      is_guest,
      success_frontend_url,
      failed_frontend_url,
    } = reqbody;
    let checkFields = [
      "reservation_id",
      "customer_email",
      "customer_mobile",
      "is_guest",
      "success_frontend_url",
      "failed_frontend_url",
    ];
    let result = await checkValidation(checkFields, reqbody);
    if (!result.status) {
      return sendResponse(res, 400, "Validation Error", result);
    }

    const paymentDetailC = await global
      .knexConnection("ms_payment_booking_detail")
      .where({
        reservation_id,
      });

    if (paymentDetailC.length) {
      return sendResponse(
        res,
        400,
        "Payment Already Initiated with reservation id"
      );
    }

    const checkReservation = await global
      .knexConnection("ms_reservation")
      .where({
        is_reserved: "Y",
        reservation_id,
      });

    if (checkReservation.length == 0) {
      return sendResponse(res, 400, "Seat Already Reserved or Booked");
    }

    const event_data_all = await EVENT_DATA({
      event_id: checkReservation[0].event_id,
      event_sch_id: checkReservation[0].event_sch_id,
    });

    let event_data = event_data_all.Records;

    const [BACKEND_URL] = await global.knexConnection("global_options").where({
      go_key: "BASE_URL_BACKEND",
    });
    let webtoken = req.header("authorization");

    BASEURL = BACKEND_URL.go_value;
    const redirectUrl = `${BASEURL}/payment/confirmMpgsPayment?reservation_id=${reservation_id}&event_token=${webtoken}`;

    // @ts-ignore
    if (!event_data[0].org_id) {
      return sendResponse(res, 400, "Invalid Organization");
    }

    const payment_credential = await PaymentCredentialFunction({
      org_id: event_data[0].org_id,
      setting_key: "mpgs_network_payment",
    });

    if (payment_credential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }

    const { MERCHANT_ID, URL, API_USER_NAME, API_PASSWORD } =
      payment_credential.data;

    if (!MERCHANT_ID || !URL || !API_USER_NAME || !API_PASSWORD) {
      return sendResponse(res, 400, "Missing Payment Data");
    }
    let paymentCurrency =
      event_data && event_data[0] ? event_data[0].curr_code : "";
    const getPaymentCurrencyData = await global
      .knexConnection("ms_currencies")
      .select("curr_code", "curr_id", "curr_name")
      .where({ curr_id: event_data[0].pay_currency_id, curr_is_active: "Y" });

    if (!getPaymentCurrencyData.length) {
      return sendResponse(res, 400, "Add Payment Currency in cinema");
    }

    paymentCurrency = getPaymentCurrencyData[0].curr_code;

    let totalAmount = 0;
    checkReservation.map((z) => {
      if (event_data[0].event_seating_type == "N") {
        totalAmount +=
          parseFloat(z.seat_price) *
          (z.no_of_seats ? parseFloat(z.no_of_seats) : 1);
      } else {
        totalAmount += parseFloat(z.seat_price);
      }
      totalAmount =
        totalAmount *
        (event_data[0].exchange_rate
          ? parseFloat(event_data[0].exchange_rate)
          : 1);

      //check for voucher discount here
      if (z.voucher_applied == "Y") {
        totalAmount -= parseFloat(z.voucher_discount_amount || 0);
      }

      //check for pass discount here
      if (z.pass_applied == "Y") {
        totalAmount -= parseFloat(z.pass_discount_amount || 0);
      }
    });

    if (totalAmount <= 0) {
      const skipBookingData = await skipPaymentGateway({
        reservation_id,
        event_data,
        is_guest,
        logged_in_customer_id,
        success_frontend_url,
        failed_frontend_url,
        customer_name,
        customer_email,
        customer_mobile,
        country_code,
        webtoken,
      });

      if (skipBookingData.status) {
        return sendResponse(res, 200, "Success", {
          data: `${skipBookingData.redirectTo}`,
        });
      } else {
        return sendResponse(res, 200, "Failed", {
          data: `${failed_frontend_url}`,
        });
      }
    }

    if (
      event_data[0].event_booking_fees &&
      event_data[0].event_booking_fees > 0
    ) {
      let booking_fee_value =
        (parseFloat(event_data[0].event_booking_fees) / 100) * totalAmount;
      totalAmount = totalAmount + booking_fee_value;
    }

    let mpgsObj = {
      apiOperation: "INITIATE_CHECKOUT",
      interaction: {
        operation: "PURCHASE",
        merchant: {
          name: API_USER_NAME, // Add the merchant user name here
        },
        returnUrl: redirectUrl,
        cancelUrl: failed_frontend_url,
        timeoutUrl: failed_frontend_url, // Return after timeout
      },
      order: {
        currency: paymentCurrency,
        amount: totalAmount.toFixed(2),
        id: reservation_id,
        reference: "REF-" + reservation_id,
        description: "Ticket",
      },
    };

    const auth = Buffer.from(`${API_USER_NAME}:${API_PASSWORD}`).toString(
      "base64"
    );

    try {
      const response = await axios$1.post(URL, mpgsObj, {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      });

      if (
        response &&
        response.data &&
        response.data.result &&
        response.data.result.toLowerCase() == "success"
      ) {
        const sessionId = response.data.session.id;
        mpgsObj["sessionResponse"] = response.data;
        if (sessionId) {
          let currentDateTimeNew = currentDateTime(
            null,
            "YYYY-MM-DD HH:mm:ss",
            event_data[0].tz_name
          );

          let checkGuest = is_guest;

          if (!logged_in_customer_id) {
            checkGuest = "Y";
            logged_in_customer_id = 0;
          } else {
            checkGuest = "N";
            logged_in_customer_id = logged_in_customer_id;
          }

          let insertPaymentDetail = {
            reservation_id,
            success_frontend_url,
            failed_frontend_url,
            c_name: customer_name,
            email: customer_email,
            phone_number: customer_mobile,
            country_code: country_code,
            is_guest: checkGuest,
            customer_id: logged_in_customer_id,
            created_at: currentDateTimeNew,
            pm_id: 1,
            payment_request: JSON.stringify(mpgsObj),
          };

          await global
            .knexConnection("ms_payment_booking_detail")
            .insert(insertPaymentDetail);
          return sendResponse(res, 200, "MPGS Session created", {
            payment_mode: "mpgs",
            data: sessionId,
          });
        } else {
          return sendResponse(res, 400, "MPGS Session not created");
        }
      } else {
        return sendResponse(res, 400, "MPGS Session not created");
      }
    } catch (error) {
      return sendResponse(res, 400, "MPGS Session not created", error);
    }
  } catch (error) {
    return sendResponse(res, 400, "Error in mpgsPayment.js", error);
  }
}

async function confirmMpgsPayment(req, res) {
  try {
    const { reservation_id, event_token, resultIndicator } = req.query;

    const detailPayment = await global
      .knexConnection("ms_payment_booking_detail")
      .where({ reservation_id });
    const reservation_detail = await global
      .knexConnection("ms_reservation")
      .select("ms_reservation.*", "ms_event.org_id", "ms_event.event_is_active")
      .leftJoin("ms_event", "ms_event.event_id", "ms_reservation.event_id")
      .where({ reservation_id, event_is_active: "Y" });

    if (!detailPayment.length && !reservation_detail.length) {
      return sendResponse(res, 400, "Detail Not Found");
    }

    const { success_frontend_url, failed_frontend_url } = detailPayment[0];
    const success_redirect_url = success_frontend_url;
    const failed_redirect_url = failed_frontend_url;

    // @ts-ignore

    const payment_credential = await PaymentCredentialFunction({
      org_id: reservation_detail[0].org_id,
      setting_key: "mpgs_network_payment",
    });

    if (payment_credential.false) {
      return sendResponse(res, 400, "Invalid Payment Mode");
    }
    let getSuccessIndicator = JSON.parse(detailPayment[0].payment_request);
    const successIndicator =
      getSuccessIndicator.sessionResponse.successIndicator;

    if (
      successIndicator &&
      resultIndicator &&
      successIndicator == resultIndicator
    ) {
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id })
        .update({
          is_paid: "Y",
          payment_capture: JSON.stringify(req.query),
        });

      let BASEURL = ``;
      const [BACKEND_URL] = await global
        .knexConnection("global_options")
        .where({
          go_key: "BASE_URL_BACKEND",
        });

      BASEURL = BACKEND_URL.go_value;

      const config = {
        method: "post",
        url: `${BASEURL}/payment/createTransation/${reservation_id}`,
        headers: {
          Authorization: event_token,
        },
      };
      const transactionResponse = await axios$1(config);

      if (
        transactionResponse &&
        transactionResponse.data &&
        transactionResponse.data.status
      ) {
        return res.redirect(
          `${success_redirect_url}/${transactionResponse.data.booking_code}`
        );
      } else {
        return res.redirect(`${failed_redirect_url}`);
      }
    } else {
      await global
        .knexConnection("ms_payment_booking_detail")
        .where({ reservation_id })
        .update({
          payment_capture: JSON.stringify({
            queryData: req.query,
          }),
        });
      return res.redirect(`${failed_redirect_url}`);
    }
  } catch (error) {
    winstonLogger$1.error("Error in mpgsPayment.js 2:", error);
    console.log("error in confirmMpgsPayment=>", error);
  }
}

const router$1 = Router();

function PaymentAndBookingRoutes() {
  // TapPay Routes
  router$1.post(
    "/tapPaymentCheckout",
    checkWebsiteSessionExist,
    tapPaymentCheckout
  );
  router$1.get("/confirmTapPayment", confirmTapPayment);

  // Payone Routes
  router$1.post(
    "/payonePaymentCheckout",
    checkWebsiteSessionExist,
    payonePaymentCheckout
  );
  router$1.post("/confirmPayonePayment", confirmPayonePayment);
  router$1.post(
    "/payonePassPaymentCheckout",
    checkWebsiteSessionExist,
    payonePassPaymentCheckout
  );
  router$1.post("/confirmPassPayonePayment", confirmPassPayonePayment);

  //MPgs or network payment

  router$1.post(
    "/mpgsPaymentCheckout",
    checkWebsiteSessionExist,
    mpgsPaymentCheckout
  );
  router$1.get("/confirmMpgsPayment", confirmMpgsPayment);

  // Other Payment Linked Routes
  router$1.post(
    "/createTransation/:reservation_id",
    checkWebsiteSessionExist,
    createTransation
  );
  router$1.post(
    "/createPassTransation/:reservation_id",
    checkWebsiteSessionExist,
    createPassTransation
  );

  return router$1;
}

// Define all admin routes in an array
const adminRoutes = [
  UserRoutes,
  CustomerRoutes,
  GuestRoutes,
  MasterRoutes,
  CinemaRoutes,
  EventRoutes,
  ReportRoutes,
  PassRoutes,
];
const router = Router();

function RootRouter() {
  // load all the routes of the modules here

  router.use("/", LoginRoutes());

  // Register all admin routes
  adminRoutes.forEach((route) => {
    router.use("/admin", route());
  });

  // Register all website routes
  router.use("/api", WebsiteRoutes());

  // Register all payments routes
  router.use("/payment", PaymentAndBookingRoutes());

  //Register all scanner app routes
  router.use("/scanner", ScannerRoutes());

  return router;
}

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(cors());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
app.use(RootRouter());

app.use(
  express.static(__dirname + "/public", {
    maxAge: "7d",
  })
);

const redisConnection = () => {
  return new Promise((resolve, reject) => {
    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy: (times) => Math.min(times * 50, 2000), // Retry connection on failure
      });

      redis.on("connect", () => {
        console.log("Redis connection established.");
        resolve(redis);
      });

      redis.on("error", (error) => {
        winstonLogger$1.error("Error in redis.js 1:", error);
        console.error("Redis connection error:", error);
        resolve(null);
      });
    } catch (error) {
      winstonLogger$1.error("Error in redis.js 2:", error);
      console.error("Error initializing Redis connection:", error);
      resolve(null);
    }
  });
};

const EXPRESS_PORT = process.env.EXPRESS_PORT || 3000;

const httpServer = http.createServer(app);

Promise.all([KnexConnection()])
  .then(async ([db, redis]) => {
    //global varaibles
    global.knexConnection = db;
    global.redisCache = redis;

    //attach knex pagination
    attachPaginate();

    //global path
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    global.__base = __dirname;
    const globalOptionsMap = {};

    //global from DB
    let globalOptions = await global.knexConnection("global_options");
    globalOptions.forEach((row) => {
      globalOptionsMap[row.go_key] = row.go_value;
    });
    global.globalOptions = globalOptionsMap;

    // Start Redis connection
    redisConnection()
      .then((redis) => {
        if (!redis) {
          global.redisCache = null; // Set a fallback in case Redis is unavailable
        }
        global.redisCache = redis;
        console.log("Redis connection established successfully.");
      })
      .catch((error) => {
        global.redisCache = null; // Set a fallback in case Redis is unavailable
        winstonLogger$1.warn(
          "Redis connection failed, but continuing execution:",
          error
        );
        console.log(
          "Warning: Redis connection failed. The app will run without caching."
        );
      });

    //cron scripts
    import('./index-KMxU6T37.js');

    //start server
    httpServer.listen(EXPRESS_PORT, () => {
      console.log(`server running on port=>${EXPRESS_PORT}`);
    });
  })
  .catch((error) => {
    winstonLogger$1.error("error in server.js 1:", error);
    console.log(`error in connecting database or redis=>`, error);
  });

export { CreateInvSendTicketEmail$1 as C, winstonLogger$1 as w };
