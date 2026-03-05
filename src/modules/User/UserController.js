import { checkValidation } from "../../lib/checkValidation.js";
import { dataReturnUpdate } from "../../lib/helper.js";
import { pagination } from "../../lib/pagination.js";

import bcrypt from "bcryptjs";

import { sendResponse } from "../../lib/responseService.js";

export async function addEdtUser(req, res) {
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

export async function getUserList(req, res) {
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
      {
        name: "Shop",
        subject: "itemlist",
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
        name: "Shop Order Reports",
        subject: "orderList",
        action: [
          {
            text: "view",
            value: "read",
            status: false,
          },
        ],
      },
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
