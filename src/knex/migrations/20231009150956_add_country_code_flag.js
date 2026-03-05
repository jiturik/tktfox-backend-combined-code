import bcrypt from "bcryptjs";

export async function up(knex) {
  await knex.schema.alterTable("ms_countries", (table) => {
    table.text("country_flag_upload").after("country_mob_code");
  });

  await knex.schema.alterTable("ms_banner", (table) => {
    table.integer("country_id").after("b_id");
  });

  await knex.raw(`update ms_countries set country_is_active='N'`);

  await knex("users").insert([
    {
      first_name: "Website",
      email: "website@123.com",
      user_name: "website@123",
      password: bcrypt.hashSync("website@123", 10),
      role_id: "3",
    },
  ]);
  await knex("ms_roles").insert([
    {
      role_id: 3,
      role_name: "Website User",
      role_is_active: "Y",
    },
  ]);
}

export async function down(knex) {
  await knex.schema.alterTable("ms_countries", (table) => {
    table.dropColumn("country_flag_upload");
  });

  await knex.schema.alterTable("ms_banner", (table) => {
    table.dropColumn("country_id");
  });
}
