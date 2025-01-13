async function up(knex) {
  await knex.schema.createTable("ms_customers", (table) => {
    table.increments("customer_id").primary();
    table.string("customer_unique_id");
    table.string("first_name");
    table.string("last_name");
    table.string("email");
    table.string("phone_number");
    table.text("password");
    table.enu("customer_is_active", ["Y", "N"]).defaultTo("Y");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

async function down(knex) {
  await knex.schema.dropTable("ms_customers");
}

export { down, up };
