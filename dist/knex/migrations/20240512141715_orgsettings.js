import 'knex';

async function up(knex) {
  await knex.schema.createTable("organization_setting", (table) => {
    table.increments("setting_id").primary();
    table.integer("org_id");
    table
      .enu("setting_key", [
        "tap_pay_payment",
        "payone_payment",
        "seats_io",
        "website_url",
      ])
      .defaultTo(null);
    table.string("setting_data");
    table.string("setting_is_active");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

async function down(knex) {
  await knex.schema.dropTable("organization_setting");
}

export { down, up };
