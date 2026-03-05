export async function up(knex) {
  await knex.schema.createTable("event_managers", (table) => {
    table.increments("event_manager_id").primary();
    table.integer("user_id");
    table.integer("event_id");
  });
}

export async function down(knex) {
  await knex.schema.dropTable("event_managers");
}
