async function up(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.enu("type", ["event", "movie"]).after("event_id").defaultTo("event");
  });
}
async function down(knex) {
  await knex.schema.alterTable("ms_event", (table) => {
    table.dropColumn("type");
  });
}

export { down, up };
