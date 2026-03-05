export async function up(knex) {
  await knex.schema.createTable("ms_reserve_pass", (table) => {
    table.increments("pass_r_id").primary();
    table.integer("pass_id");
    table.string("reservation_id");
    table.string("customer_id");
    table.string("rp_is_active");
    table.datetime("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTable("ms_reserve_pass");
}
