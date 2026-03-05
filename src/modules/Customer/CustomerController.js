import { checkValidation } from "../../lib/checkValidation.js";
import { dataReturnUpdate, sendEmail, generateJWT } from "../../lib/helper.js";
import { pagination } from "../../lib/pagination.js";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";

import { sendResponse } from "../../lib/responseService.js";

// Add  Customer
export async function addWebCustomer(req, res) {
  let reqbody = req.body;
  const { user_info } = req;
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
    obj["customer_unique_id"] = uuidv4();
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

export async function verifyOTPAndUpdateUser(req, res) {
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
export async function customerSignIn(req, res) {
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
export async function getCustomer(req, res) {
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
