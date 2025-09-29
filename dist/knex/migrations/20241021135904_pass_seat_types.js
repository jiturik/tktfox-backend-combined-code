async function up(knex) {
  await knex.schema.createTable("pass_seat_types", (table) => {
    table.increments("psct_id").primary();
    table.integer("pass_id");
    table.integer("sct_id");
    table.string("psct_is_active");
    table.datetime("created_at").defaultTo(knex.fn.now());
  });
}

async function down(knex) {
  await knex.schema.dropTable("pass_seat_types");
}

export { down, up };
