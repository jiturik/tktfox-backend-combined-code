async function up(knex) {
  await knex.schema.createTable("ms_subscriber", (table) => {
    table.increments("subscriber_id").primary();
    table.string("subscriber_email");
    table.enu("subscriber_is_active", ["Y", "N"]).defaultTo("Y");
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

async function down(knex) {
  await knex.schema.dropTable("ms_subscriber");
}

export { down, up };
