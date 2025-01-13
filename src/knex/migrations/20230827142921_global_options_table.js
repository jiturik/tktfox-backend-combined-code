import bcrypt from 'bcryptjs';

async function up(knex) {
  await knex.schema.createTable("global_options", (table) => {
    table.increments("go_id").primary();
    table.text("go_key");
    table.text("go_value");
    table.text("key_name");
  });

  await knex.schema.createTable("global_options_private", (table) => {
    table.increments("go_id").primary();
    table.text("go_key");
    table.text("go_value");
    table.text("key_name");
  });

  await knex.schema.createTable("organizations", (table) => {
    table.increments("org_id").primary();
    table.string("org_name");
    table.text("org_address");
    table.text("org_other");
    table.enu("org_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("ms_countries", (table) => {
    table.increments("country_id").primary();
    table.string("country_name");
    table.string("country_code");
    table.string("country_mob_code");
    table.enu("country_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("ms_cities", (table) => {
    table.increments("city_id").primary();
    table.string("city_name");
    table.integer("country_id");
    table.enu("city_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("ms_genre", (table) => {
    table.increments("genre_id").primary();
    table.string("genre_name");
    table.enu("genre_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("ms_roles", (table) => {
    table.increments("role_id").primary();
    table.string("role_name");
    table.enu("role_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("ms_seat_class_type", (table) => {
    table.increments("sct_id").primary();
    table.string("seat_class_name");
    table.enu("sct_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("ms_languages", (table) => {
    table.increments("lang_id").primary();
    table.string("lang_name");
    table.string("lang_iso2");
    table.string("lang_iso3");
    table.enu("lang_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("users", (table) => {
    table.increments("user_id").primary();
    table.string("first_name");
    table.string("last_name");
    table.string("employee_code");
    table.string("email").unique();
    table.string("mobile_number");
    table.string("user_name").unique();
    table.text("password");
    table.integer("role_id");
    table.enu("user_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("user_link_cinema", (table) => {
    table.increments("ulc_id").primary();
    table.integer("user_id");
    table.integer("cinema_id");
  });

  await knex.schema.createTable("user_token", (table) => {
    table.increments("ut_id").primary();
    table.text("multi_token_id");
    table.integer("user_id");
    table.integer("role_id");
    table.enu("user_token_is_active", ["Y", "N"]).defaultTo("Y");
  });

  await knex("organizations").insert([
    {
      org_id: 1,
      org_name: "Event Name",
      org_other: null,
      org_is_active: "Y",
      org_address: null,
    },
  ]);

  await knex("ms_roles").insert([
    {
      role_id: 1,
      role_name: "Super Admin",
      role_is_active: "Y",
      // is_super_admin: "Y",
      // role_permission:
      //   '[{"action":["read","update","create"],"subject":"countrymaster","name":"Country"},{"action":["read","create","update"],"subject":"citymaster","name":"City"},{"action":["read","create","update"],"subject":"cinemamaster","name":"Cinema"},{"action":["read","create","update"],"subject":"seattypemaster","name":"Seat Type"},{"action":["read","create","update"],"subject":"languagemaster","name":"Language"},{"action":["read","create","update"],"subject":"genremaster","name":"Genre"},{"action":["read","create","update"],"subject":"currencymaster","name":"Currency"},{"action":["read","create","update"],"subject":"eventlist","name":"Events"},{"action":["read","create","update"],"subject":"eventbanners","name":"Event Banners"},{"action":["read","create","update"],"subject":"eventseatlayout","name":"Tktfox Seat Layout"},{"action":["read","create","update"],"subject":"transactionreport","name":"Booking Reports"},{"action":["read","create","update"],"subject":"reservationreport","name":"Reservation Report"},{"action":["read","create","update"],"subject":"userlist","name":"Users"},{"action":["read","create","update"],"subject":"roleList","name":"Roles"},{"action":["read","create","update"],"subject":"voucherlist","name":"Vouchers"},{"action":["read","create","update"],"subject":"organizationlist","name":"Organization"}]',
    },
    {
      role_id: 2,
      role_name: "Event Manager",
      role_is_active: "Y",
    },
  ]);

  await knex("users").insert([
    {
      first_name: "Admin",
      email: "admin@123.com",
      user_name: "admin@123",
      password: bcrypt.hashSync("admin@123", 10),
      role_id: "1",
    },
  ]);
}

async function down(knex) {
  await knex.schema.dropTable("global_options");
  await knex.schema.dropTable("global_options_private");
  await knex.schema.dropTable("organizations");
  await knex.schema.dropTable("ms_countries");
  await knex.schema.dropTable("ms_cities");
  await knex.schema.dropTable("ms_genre");
  await knex.schema.dropTable("ms_roles");
  await knex.schema.dropTable("users");
  await knex.schema.dropTable("user_link_cinema");
  await knex.schema.dropTable("user_token");
  await knex.schema.dropTable("ms_seat_class_type");
  await knex.schema.dropTable("ms_languages");
}

export { down, up };
