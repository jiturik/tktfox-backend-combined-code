export async function up(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.enu("type", ["event", "movie"]).after("event_id").defaultTo("event");
  });
}
export async function down(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.dropColumn("type");
  });
}
