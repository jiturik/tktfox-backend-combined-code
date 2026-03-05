export async function up(knex) {
  await knex.schema.createTable("ms_pass_reservation", (table) => {
    table.increments("pr_id").primary();
    table.string("p_reservation_id");
    table.integer("pass_id");
    table.decimal("pass_price", 11, 4).defaultTo(0);
    table.string("pass_price_currency").nullable();
    table.integer("customer_id").nullable();
    table.string("c_email").nullable();
    table.string("c_name").nullable();
    table.string("c_country_code").nullable();
    table.string("c_phone_number").nullable();
    table.enu("p_is_reserved", ["Y", "N"]).defaultTo("Y");
    table.enu("p_is_booked", ["Y", "N"]).defaultTo("N");
    table.enu("p_payment", ["Y", "N"]).defaultTo("N");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTable("ms_pass_reservation");
}
