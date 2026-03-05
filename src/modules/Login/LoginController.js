import { checkValidation } from "../../lib/checkValidation.js";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import jwt_token from "jsonwebtoken";
import { sendResponse } from "../../lib/responseService.js";

// Function to create a token for the user
export const CREATE_TOKEN_FOR_USER = async ({ user_id, role_id, org_id }) => {
  try {
    const random = uuidv4();

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
    throw error;
  }
};

// Function to validate user password

async function validateUserPassword(user_name, password) {
  try {
    const users = await global
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

    if (users.length) {
      const isPasswordValid = await bcrypt.compare(password, users[0].password);
      return { user: users[0], isPasswordValid };
    } else {
      return { error: "User not found" };
    }
  } catch (error) {
    throw error;
  }
}

export async function login(req, res) {
  const reqbody = req.body;
  const { user_name, password } = reqbody;
  try {
    // Check if required fields are present
    const checkFields = ["user_name", "password"];

    let validationResult = await checkValidation(checkFields, reqbody);

    if (!validationResult.status) {
      return sendResponse(res, 400, "Username and password is required.");
    }

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

export async function checkLogin(req, res) {
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
