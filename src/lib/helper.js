import moment from "moment";
import nodemailer from "nodemailer";
import momentTimeZone from "moment-timezone";
import jwt from "jsonwebtoken";
import { winstonLogger } from "./winstonLogger.js";

// Function to generate JWT
export const generateJWT = (user, isWebsiteUser) => {
  return new Promise((resolve, reject) => {
    const payload = {
      customer_id: user.customer_id,
      email: user.email,
      is_website_user: isWebsiteUser || false,
    };

    const secret = process.env.JWT_SECRET || "secretevent";
    const expiresIn = process.env.JWT_EXPIRATION || "1d";

    jwt.sign(payload, secret, { expiresIn }, (err, token) => {
      if (err) {
        reject(err); // Reject the promise if an error occurs
      } else {
        resolve(token); // Resolve the promise with the generated token
      }
    });
  });
};

// Current DateTime Utility with Error Handling
export const currentDateTime = (
  date = null,
  format = "YYYY-MM-DD HH:mm",
  TIME_ZONE_SET = ""
) => {
  try {
    const { TIME_ZONE } = global.globalOptions || {};
    let currentDateTime = moment().format(format);
    const TIME_ZON_VALUE = TIME_ZONE_SET || TIME_ZONE;

    if (TIME_ZON_VALUE) {
      currentDateTime = momentTimeZone().tz(TIME_ZON_VALUE).format(format);
    }

    if (date) {
      currentDateTime = moment(date).format(format);
    }

    return currentDateTime;
  } catch (error) {
    console.error("Error in currentDateTime:", error);
    winstonLogger.error("Error in helper.js 1:", error);
    return null; // Return a fallback or null in case of error
  }
};

// Data Update Utility
export const dataReturnUpdate = (userInfo, isUpdate = false) => {
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
export const PaymentCredentialFunction = async ({ org_id, setting_key }) => {
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
    winstonLogger.error("Error in helper.js 2:", error);
    return { status: false, data: {}, message: "An error occurred" };
  }
};

// Seats.IO Credential Function with Error Handling
export const SeatsIoCredentialFunction = async ({ org_id, setting_key }) => {
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
    winstonLogger.error("Error in helper.js 3:", error);
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
export function sendEmail(to, subject, body, attachment) {
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
      winstonLogger.error("Error in helper.js 4:", error);
      reject({ status: false, message: "Unexpected error occurred" });
    }
  });
}

// Email Client Sending Function with Error Handling
export function sendEmailClient(from, subject, body, attachment) {
  try {
    const mailOptions = {
      from: `${process.env.CONTACT_US_EMAIL_FROM}`,
      to: `${process.env.CONTACT_US_EMAIL_TO}`,
      subject,
      html: body,
    };

    if (attachment) {
      mailOptions.attachments = attachment;
    }

    mail.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error in sendEmailClient:", error);
      } else {
        console.log(`Email Sent: ${JSON.stringify(info)}`);
      }
    });
  } catch (error) {
    winstonLogger.error("Error in helper.js 5:", error);
    console.error("Unexpected error in sendEmailClient:", error);
  }
}
